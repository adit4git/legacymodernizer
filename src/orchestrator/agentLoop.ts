import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { Orchestrator } from './orchestrator';
import { CompleteResult, LlmClient, ToolCall, ToolResult } from '../utils/llmClient';
import { plannedFileLooksWritten, resolvePlannedPath } from '../utils/plannedPaths';

type AgentMessage = { role: 'user' | 'assistant'; content: string | any[] };

export interface AgentRunOpts {
  orchestrator: Orchestrator;
  agent: string;
  skillPath: string;        // path to SKILL.md describing this agent
  userGoal: string;
  maxIterations: number;
  writeFiles?: boolean;
  writeRoot?: string;       // where the agent may write
  llm?: LlmClient;
  critiquePass?: boolean;
}

/**
 * Generic agentic loop:
 *   1. Load SKILL.md as the agent's playbook
 *   2. Load architecture .md (if configured) as constraints
 *   3. Loop: model emits tool calls (read_file, list_dir, write_file, search, finish)
 *      until 'finish' or max iterations
 *   4. Optional critique pass
 *   5. Verify plan-vs-disk outputs and request fixups for missing planned files
 */
export async function runAgentLoop(opts: AgentRunOpts): Promise<string> {
  const { orchestrator, agent, skillPath, userGoal, maxIterations, writeFiles, writeRoot, llm: llmOverride, critiquePass } = opts;
  const llm = llmOverride || orchestrator.llm();
  const critiqueEnabled = critiquePass ?? orchestrator.cfg().get<boolean>('enableCritiquePass', true);
  const historyTurns = Math.max(1, orchestrator.cfg().get<number>('historyTurns', 12));
  const toolResultMaxChars = Math.max(2_000, orchestrator.cfg().get<number>('toolResultMaxChars', 30_000));
  const skillPromptMaxChars = Math.max(4_000, orchestrator.cfg().get<number>('skillPromptMaxChars', 45_000));
  const archPromptMaxChars = Math.max(4_000, orchestrator.cfg().get<number>('archPromptMaxChars', 30_000));
  const interRequestDelayMs = Math.max(0, orchestrator.cfg().get<number>('interRequestDelayMs', 1_000));
  const readFileDefaultMaxBytes = Math.max(10_000, orchestrator.cfg().get<number>('readFileDefaultMaxBytes', 100_000));
  const readFileHardMaxBytes = Math.max(readFileDefaultMaxBytes, orchestrator.cfg().get<number>('readFileHardMaxBytes', 250_000));
  const legacyRoot = orchestrator.legacyRoot();
  const archFile = orchestrator.archFile();

  const skillRaw = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '';
  const archGuideRaw = archFile && fs.existsSync(archFile) ? fs.readFileSync(archFile, 'utf8') : '';
  const skill = limitText(skillRaw, skillPromptMaxChars, '[SKILL.md truncated for token budget]');
  const archGuide = limitText(archGuideRaw, archPromptMaxChars, '[Architecture guide truncated for token budget]');

  const system = buildSystemPrompt({ agent, skill, archGuide, legacyRoot, writeRoot });
  const messages: AgentMessage[] = [
    { role: 'user', content: userGoal }
  ];
  const structuredToolMessages = isAnthropicClient(llm);

  let lastFreeText = '';
  for (let i = 0; i < maxIterations; i++) {
    orchestrator.log(`[${agent}] iteration ${i + 1}/${maxIterations}`);
    const promptMessages = windowMessages(messages, historyTurns);
    if (interRequestDelayMs > 0 && i > 0) await sleep(interRequestDelayMs);
    const response = await llm.complete({ system, messages: promptMessages, tools: TOOL_SCHEMAS });

    if (response.text) lastFreeText = response.text;

    if (!response.toolCalls || response.toolCalls.length === 0) {
      // No more tool calls -> agent finished
      orchestrator.log(`[${agent}] iteration ${i + 1}: no tool calls, ending main loop`);
      messages.push({
        role: 'assistant',
        content: assistantContentForNoToolTurn(response, structuredToolMessages)
      });
      break;
    }
    orchestrator.log(`[${agent}] iteration ${i + 1}: ${response.toolCalls.length} tool call(s)`);

    const toolResults: ToolResult[] = [];
    let finished = false;
    for (const call of response.toolCalls) {
      try {
        const result = await dispatchTool(call, {
          legacyRoot,
          writeRoot,
          writeFiles,
          readFileDefaultMaxBytes,
          readFileHardMaxBytes
        });
        toolResults.push({ id: call.id, name: call.name, result: limitText(result, toolResultMaxChars, '[tool result truncated]') });
        if (call.name === 'finish') {
          lastFreeText = (call.input?.summary as string) || lastFreeText;
          finished = true;
        }
      } catch (e: any) {
        orchestrator.log(`[${agent}] tool error (${call.name}): ${e.message}`);
        toolResults.push({
          id: call.id,
          name: call.name,
          result: limitText(`ERROR: ${e.message}`, toolResultMaxChars, '[error message truncated]')
        });
      }
    }

    appendToolTurnMessages(messages, response, toolResults, structuredToolMessages);

    if (finished) break;
  }

  // Optional self-critique pass
  if (critiqueEnabled && writeFiles && writeRoot) {
    orchestrator.log(`[${agent}] critique pass`);
    if (interRequestDelayMs > 0) await sleep(interRequestDelayMs);
    const critique = await llm.complete({
      system: system + '\n\nYou are now in CRITIQUE mode. List concrete defects in what you produced.',
      messages: windowMessages([{ role: 'user', content: 'Review your generated files for compile errors, missing imports, security issues, and architecture violations. Fix them via write_file then call finish.' }], historyTurns),
      tools: TOOL_SCHEMAS
    });
    if (critique.toolCalls) {
      for (const call of critique.toolCalls) {
        try {
          await dispatchTool(call, {
            legacyRoot,
            writeRoot,
            writeFiles,
            readFileDefaultMaxBytes,
            readFileHardMaxBytes
          });
        }
        catch (e: any) { orchestrator.log(`[${agent}] critique tool error: ${e.message}`); }
      }
    }
  } else if (writeFiles && writeRoot) {
    orchestrator.log(`[${agent}] critique pass skipped (modernizer.enableCritiquePass=false)`);
  }

  if (writeFiles && writeRoot) {
    await runPlanVerificationPasses({
      orchestrator,
      llm,
      agent,
      system,
      messages,
      historyTurns,
      interRequestDelayMs,
      toolResultMaxChars,
      legacyRoot,
      writeRoot,
      writeFiles,
      readFileDefaultMaxBytes,
      readFileHardMaxBytes
    });
  }

  return lastFreeText;
}

function limitText(text: string, maxChars: number, marker: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n${marker} ${text.length - maxChars} chars omitted.`;
}

function windowMessages(
  messages: AgentMessage[],
  historyTurns: number
): AgentMessage[] {
  if (messages.length <= 1) return messages;
  const head = messages[0];
  const tailLimit = historyTurns * 2;
  const tail = messages.slice(Math.max(1, messages.length - tailLimit));
  return [head, ...tail];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPlanVerificationPasses(opts: {
  orchestrator: Orchestrator;
  llm: LlmClient;
  agent: string;
  system: string;
  messages: AgentMessage[];
  historyTurns: number;
  interRequestDelayMs: number;
  toolResultMaxChars: number;
  legacyRoot: string;
  writeRoot: string;
  writeFiles?: boolean;
  readFileDefaultMaxBytes: number;
  readFileHardMaxBytes: number;
}): Promise<void> {
  const planPath = findPlanPath(opts.agent, opts.writeRoot);
  if (!planPath) {
    opts.orchestrator.log(`[${opts.agent}] no plan file found; skipping plan reconciliation`);
    return;
  }

  // Use a clean seed to avoid inheriting stale "finish" context from the main loop.
  const seedGoal = opts.messages[0];
  const structuredToolMessages = isAnthropicClient(opts.llm);

  for (let pass = 1; pass <= 3; pass++) {
    opts.orchestrator.log(`[${opts.agent}] verification pass ${pass}/3`);

    const planFiles = loadPlanFiles(planPath);
    if (!planFiles) {
      opts.orchestrator.log(`[${opts.agent}] plan file unreadable; skipping plan reconciliation`);
      return;
    }
    if (planFiles.length === 0) {
      opts.orchestrator.log(`[${opts.agent}] plan file has zero paths; skipping plan reconciliation`);
      return;
    }

    const getMissing = () => planFiles.filter((entry) => {
      const resolved = resolvePlannedPath(entry.path, opts.writeRoot);
      return !(resolved && plannedFileLooksWritten(resolved));
    });
    const missing = getMissing();
    if (missing.length === 0) {
      opts.orchestrator.log(`[${opts.agent}] verification clean - all ${planFiles.length} planned files exist`);
      return;
    }

    opts.orchestrator.log(`[${opts.agent}] ${missing.length}/${planFiles.length} planned files missing`);
    missing.slice(0, 10).forEach((entry) => opts.orchestrator.log(`  - ${entry.path}`));
    if (missing.length > 10) opts.orchestrator.log(`  ... and ${missing.length - 10} more`);

    const formatMissing = (rows: Array<{ path: string; type?: string }>, maxRows = rows.length) =>
      rows
        .slice(0, maxRows)
        .map((entry) => `- ${entry.path}${entry.type ? ` (${entry.type})` : ''}`)
        .join('\n');

    const fixupGoal =
      `Your plan at ${planPath} lists ${planFiles.length} files but only ${planFiles.length - missing.length} ` +
      `exist on disk under writeRoot. Write the ${missing.length} missing files now via write_file. ` +
      `Respond with tool calls only. Do NOT call finish until every missing file is written.\n\n` +
      `MISSING FILES:\n` +
      formatMissing(missing);

    // Fresh conversation per verification pass to avoid cross-pass tool_result linkage issues.
    const fixupMessages: AgentMessage[] = seedGoal ? [seedGoal] : [];
    fixupMessages.push({ role: 'user', content: fixupGoal });
    const fixupTurns = Math.min(missing.length * 2 + 5, 50);
    let fixupFinished = false;
    let noToolStreak = 0;

    for (let turn = 0; turn < fixupTurns && !fixupFinished; turn++) {
      if (opts.interRequestDelayMs > 0) await sleep(opts.interRequestDelayMs);
      const fixup = await opts.llm.complete({
        system: opts.system,
        messages: windowMessages(fixupMessages, opts.historyTurns),
        tools: TOOL_SCHEMAS
      });

      if (!fixup.toolCalls || fixup.toolCalls.length === 0) {
        noToolStreak += 1;
        const currentMissing = getMissing();
        if (currentMissing.length === 0) {
          opts.orchestrator.log(`[${opts.agent}] verification clean - all ${planFiles.length} planned files exist`);
          return;
        }
        const preview = (fixup.text || '').replace(/\s+/g, ' ').slice(0, 140);
        opts.orchestrator.log(
          `[${opts.agent}] fixup turn ${turn + 1}: no tool calls (streak ${noToolStreak}); ` +
          `${currentMissing.length} still missing; nudging` +
          (preview ? `; text="${preview}"` : '')
        );
        fixupMessages.push({
          role: 'assistant',
          content: assistantContentForNoToolTurn(fixup, structuredToolMessages)
        });
        fixupMessages.push({
          role: 'user',
          content:
            'You replied with text instead of tool calls. There are still missing files. ' +
            'Issue write_file calls for the next 3-5 missing files now using exact paths below. ' +
            'Do not summarize. Do not call finish unless every missing file is on disk.\n\n' +
            `CURRENT MISSING FILES (${currentMissing.length}):\n${formatMissing(currentMissing, 12)}`
        });
        if (noToolStreak >= 3) {
          opts.orchestrator.log(`[${opts.agent}] fixup: stopping pass after 3 consecutive no-tool turns`);
          break;
        }
        continue;
      }
      noToolStreak = 0;

      const fixupResults: ToolResult[] = [];
      for (const call of fixup.toolCalls) {
        try {
          const result = await dispatchTool(call, {
            legacyRoot: opts.legacyRoot,
            writeRoot: opts.writeRoot,
            writeFiles: opts.writeFiles,
            readFileDefaultMaxBytes: opts.readFileDefaultMaxBytes,
            readFileHardMaxBytes: opts.readFileHardMaxBytes
          });
          fixupResults.push({
            id: call.id,
            name: call.name,
            result: limitText(result, opts.toolResultMaxChars, '[tool result truncated]')
          });
          if (call.name === 'finish') fixupFinished = true;
        } catch (e: any) {
          opts.orchestrator.log(`[${opts.agent}] fixup tool error: ${e.message}`);
          fixupResults.push({
            id: call.id,
            name: call.name,
            result: limitText(`ERROR: ${e.message}`, opts.toolResultMaxChars, '[error message truncated]')
          });
        }
      }

      appendToolTurnMessages(fixupMessages, fixup, fixupResults, structuredToolMessages);
      opts.orchestrator.log(`[${opts.agent}] fixup turn ${turn + 1}: ${fixup.toolCalls.length} tool call(s)`);

      const remaining = getMissing();
      if (remaining.length === 0) {
        opts.orchestrator.log(`[${opts.agent}] verification clean - all ${planFiles.length} planned files exist`);
        return;
      }
    }
  }

  // Intentionally do not merge per-pass fixup history back into opts.messages.
}

function isAnthropicClient(llm: LlmClient): boolean {
  return llm.name().startsWith('anthropic:');
}

function assistantContentForNoToolTurn(response: CompleteResult, structuredToolMessages: boolean): string | any[] {
  if (!structuredToolMessages) return response.text || '';
  return response.rawContent ?? buildAssistantContent(response);
}

function appendToolTurnMessages(
  messages: AgentMessage[],
  response: CompleteResult,
  toolResults: ToolResult[],
  structuredToolMessages: boolean
): void {
  if (structuredToolMessages) {
    messages.push({
      role: 'assistant',
      content: response.rawContent ?? buildAssistantContent(response)
    });
    messages.push({
      role: 'user',
      content: toolResults.map((tr) => ({
        type: 'tool_result',
        tool_use_id: tr.id,
        content: tr.result
      }))
    });
    return;
  }

  messages.push({ role: 'assistant', content: JSON.stringify(response.toolCalls || []) });
  messages.push({ role: 'user', content: JSON.stringify(toolResults) });
}

function buildAssistantContent(response: CompleteResult): any[] {
  const blocks: any[] = [];
  if (response.text) blocks.push({ type: 'text', text: response.text });
  if (response.toolCalls) {
    for (const tc of response.toolCalls) {
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }
  if (blocks.length === 0) blocks.push({ type: 'text', text: '(no output)' });
  return blocks;
}

function findPlanPath(agent: string, writeRoot: string): string | undefined {
  const fileNames = planFileNamesForAgent(agent);
  const candidateDirs = [
    path.join(writeRoot, '_modernizer'),
    writeRoot
  ];
  for (const dir of candidateDirs) {
    for (const name of fileNames) {
      const candidate = path.resolve(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function planFileNamesForAgent(agent: string): string[] {
  if (agent === 'apiConverter') return ['api-conversion-plan.json', 'conversion-plan.json'];
  if (agent === 'uiConverter') return ['ui-conversion-plan.json', 'conversion-plan.json'];
  return ['conversion-plan.json'];
}

function loadPlanFiles(planPath: string): Array<{ path: string; type?: string; name?: string }> | null {
  try {
    const raw = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    const rows: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.files)
        ? (raw as any).files
        : [];
    const entries = rows
      .map((row) => {
        if (typeof row === 'string') return { path: row };
        if (row && typeof row === 'object' && typeof (row as any).path === 'string') {
          return {
            path: (row as any).path,
            type: typeof (row as any).type === 'string' ? (row as any).type : undefined,
            name: typeof (row as any).name === 'string' ? (row as any).name : undefined
          };
        }
        return null;
      })
      .filter((row): row is { path: string; type?: string; name?: string } => Boolean(row && row.path))
      .map((row) => ({ ...row, path: row.path.trim() }))
      .filter((row) => row.path.length > 0);
    return entries;
  } catch {
    return null;
  }
}

// ---------- Tool schemas (provider-agnostic) ----------
export const TOOL_SCHEMAS = [
  {
    name: 'list_dir',
    description: 'List files under a directory (relative to legacyRoot, or absolute).',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, glob: { type: 'string' } },
      required: ['path']
    }
  },
  {
    name: 'read_file',
    description: 'Read a text file (relative to legacyRoot, or absolute).',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, max_bytes: { type: 'number' } },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write a text file under writeRoot. Creates dirs.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content']
    }
  },
  {
    name: 'search_text',
    description: 'Search for a regex/string across the legacy codebase.',
    input_schema: {
      type: 'object',
      properties: { pattern: { type: 'string' }, glob: { type: 'string' } },
      required: ['pattern']
    }
  },
  {
    name: 'finish',
    description: 'Signal the agent is done. Provide a summary.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary']
    }
  }
];

async function dispatchTool(
  call: ToolCall,
  ctx: {
    legacyRoot: string;
    writeRoot?: string;
    writeFiles?: boolean;
    readFileDefaultMaxBytes: number;
    readFileHardMaxBytes: number;
  }
): Promise<string> {
  const input = call.input || {};
  switch (call.name) {
    case 'list_dir': {
      const base = path.isAbsolute(input.path) ? input.path : path.join(ctx.legacyRoot, input.path);
      const pattern = input.glob || '**/*';
      const files = await glob(pattern, { cwd: base, nodir: true, dot: false });
      return JSON.stringify(files.slice(0, 500));
    }
    case 'read_file': {
      const p = path.isAbsolute(input.path) ? input.path : path.join(ctx.legacyRoot, input.path);
      const requested = Number(input.max_bytes);
      const rawMax = Number.isFinite(requested) && requested > 0 ? requested : ctx.readFileDefaultMaxBytes;
      const max = Math.min(rawMax, ctx.readFileHardMaxBytes);
      const buf = fs.readFileSync(p);
      return buf.slice(0, max).toString('utf8');
    }
    case 'search_text': {
      const pattern = input.pattern;
      const gl = input.glob || '**/*.{cs,cshtml,aspx,asax,config,xml,csproj}';
      const files = await glob(gl, { cwd: ctx.legacyRoot, nodir: true });
      const re = new RegExp(pattern, 'gi');
      const hits: Array<{ file: string; line: number; text: string }> = [];
      for (const f of files) {
        try {
          const text = fs.readFileSync(path.join(ctx.legacyRoot, f), 'utf8');
          text.split('\n').forEach((line, i) => {
            if (re.test(line)) hits.push({ file: f, line: i + 1, text: line.trim().slice(0, 200) });
          });
        } catch { /* skip */ }
        if (hits.length > 200) break;
      }
      return JSON.stringify(hits);
    }
    case 'write_file': {
      if (!ctx.writeFiles || !ctx.writeRoot) throw new Error('write_file disabled for this step');
      const target = path.isAbsolute(input.path) ? input.path : path.join(ctx.writeRoot, input.path);
      // Sandboxing: target must be under writeRoot
      const resolved = path.resolve(target);
      if (!resolved.startsWith(path.resolve(ctx.writeRoot))) {
        throw new Error(`write outside writeRoot blocked: ${resolved}`);
      }
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, input.content, 'utf8');
      return `wrote ${resolved} (${input.content.length} bytes)`;
    }
    case 'finish':
      return 'finished';
    default:
      throw new Error(`unknown tool ${call.name}`);
  }
}

function buildSystemPrompt(opts: {
  agent: string;
  skill: string;
  archGuide: string;
  legacyRoot: string;
  writeRoot?: string;
}): string {
  return `You are the "${opts.agent}" agent of an iterative legacy modernization pipeline.

You operate by emitting tool calls (list_dir, read_file, search_text, write_file, finish).
You run iteratively. After each turn the user message will contain tool results.
When fully done, call the "finish" tool with a 1-paragraph summary.

LEGACY ROOT (read-only): ${opts.legacyRoot}
${opts.writeRoot ? `WRITE ROOT (only place you may write): ${opts.writeRoot}` : ''}

==== SKILL PLAYBOOK ====
${opts.skill || '(no skill provided)'}

==== TARGET ARCHITECTURE & BEST PRACTICES ====
${opts.archGuide || '(no architecture file provided — fall back to standard Spring Boot 3 + clean architecture defaults)'}

Rules:
- Never invent file contents you have not read; always read_file before converting it.
- Write idiomatic, production-grade code. No TODOs unless behaviour is unknowable.
- Keep files small and focused. Prefer many files over giant ones.
- Stop hallucinating: if unsure, search_text or read_file.
`;
}
