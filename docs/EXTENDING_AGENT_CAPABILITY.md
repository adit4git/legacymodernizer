# Extending Agent Capability: From SKILL.md to Agent Classes

## Problem

The original scaffold of this extension created `src/agents/` and `src/prompts/` as empty folders, alongside the populated `src/commands/`, `src/orchestrator/`, `src/utils/`, `src/ui/`, and `src/mcp/`. They stayed empty. Same problem the `templates/` folder had before it was populated: empty scaffold structure that misleads anyone exploring the codebase into thinking something's missing or unfinished.

Reality: agent **logic** lives in `src/orchestrator/agentLoop.ts` (the generic loop), and agent **behavior** lives in `skills/<agent>/SKILL.md` (declarative playbooks). The decision was to treat agents as data — markdown files — rather than code. That's a defensible choice for a small project, but it left two empty folders behind, and it has a ceiling.

This doc explains where each piece of agent functionality lives today, the limits of the data-only approach, and a clean upgrade path to per-agent classes when you outgrow it.

---

## Where agent capability lives today

| Concern                                              | Location                                              | Form     |
|------------------------------------------------------|-------------------------------------------------------|----------|
| The driving loop (tool dispatch, iterations, critique) | `src/orchestrator/agentLoop.ts`                      | Code     |
| Per-agent behavior (what to read, what to write, quality bar) | `skills/<agent>/SKILL.md`                    | Data (markdown) |
| LLM-provider abstraction                             | `src/utils/llmClient.ts`                              | Code     |
| Tool schemas (`read_file`, `write_file`, `search_text`, `finish`, `list_dir`) | `agentLoop.ts` (`TOOL_SCHEMAS` const) | Code     |
| System prompt construction                           | `agentLoop.ts` (`buildSystemPrompt`)                  | Code     |
| Pipeline state machine + human gates                 | `src/orchestrator/orchestrator.ts`                    | Code     |
| Step-to-agent wiring (which skill runs at which step)| `orchestrator.ts` `step*()` methods                   | Code     |

The pattern: **one generic loop, many declarative skills.** Adding a new agent today is three steps:

1. Drop a `skills/<new-agent>/SKILL.md`.
2. Add a `step<NewAgent>()` method in `orchestrator.ts` that calls `runAgentLoop` with the skill path.
3. Register a command and a menu button.

No TypeScript class per agent. No agent base class. The orchestrator treats every agent uniformly — same tools, same loop, same prompt structure. Behavior differences come entirely from the skill markdown.

---

## When SKILL.md alone is enough

For the agents currently shipped, this works:

- **analyzer** — reads the legacy code, writes `inventory.json`.
- **documenter** — reads inventory, writes `LEGACY_DOCUMENTATION.md`.
- **apiConverter** — reads .NET source, writes Spring Boot.
- **uiConverter** — reads ASP.NET views, writes React/Angular SPA.
- **testGenerator** — reads generated code, writes tests.
- **cicdGenerator** — reads target structure, writes OpenShift manifests.
- **defectResolver** — reads Jira issue + target code, fixes the bug.

All of them share the same five tools (`list_dir`, `read_file`, `search_text`, `write_file`, `finish`). All run with the same iteration cap and critique pass. Their behavior differences fit comfortably in the skill markdown — which entities to read, what output structure to produce, what quality bar to enforce. Promoting any of these to a TypeScript class would add code without adding capability.

**Use case:** while every agent's behavior is data-shaped (read X, transform, write Y), keep them as SKILL.md. Don't create classes prematurely.

---

## When SKILL.md isn't enough — five symptoms

The data-only approach starts to crack when at least one of these is true:

### Symptom 1: Per-agent model selection
Different agents have different cost/quality sweet spots. The API converter benefits from Opus 4.7's bigger context and reasoning; the test generator runs fine on `gpt-4o-mini` at 1/10 the cost. Today, model is a global setting (`modernizer.modelProvider`) — every agent gets the same.

### Symptom 2: Per-agent tool schemas
The defect resolver wants a `git_diff` tool to compute minimal-diff fixes. The CI/CD generator wants a `helm_lint` tool to validate output. The test generator wants a `mvn_test` tool to run what it just wrote. Today, the tool list is a single `TOOL_SCHEMAS` const shared across every agent.

### Symptom 3: Per-agent pre/post hooks
The API converter should **copy templates first**, then run the agent (the hybrid approach from `HYBRID_TEMPLATES_AND_GENERATION.md`). The test generator should **run the tests after** they're written. The defect resolver should **commit + push + open a PR** at the end. Today, these hooks live scattered across `step*()` methods on the orchestrator, mixing pipeline plumbing with agent behavior.

### Symptom 4: Per-agent iteration tuning
Some agents converge fast (analyzer: 5 iterations). Some need many (API converter: 40+ on big codebases). Some benefit from multiple critique passes (defect resolver should iterate until tests pass). Today, `maxIterations` is global and `enableCritiquePass` is a single boolean.

### Symptom 5: Shared behavior between subsets of agents
The API and UI converters both copy templates first. The test generator and defect resolver both run shell commands (mvn, npm). The analyzer and documenter both write to `_modernizer/`. Without classes, this shared behavior duplicates across step methods.

If you're hitting one or two of these, you can paper over with more settings keys. If you're hitting three or more, you've outgrown the data-only approach and `src/agents/` should actually exist.

---

## The upgrade path: introduce an agent class hierarchy

The transition has three layers, each independently useful, in order of value:

### Layer 1: Base class for shared behavior (~1 hour)

Create `src/agents/BaseAgent.ts`:

```ts
import { Orchestrator } from '../orchestrator/orchestrator';
import { runAgentLoop } from '../orchestrator/agentLoop';
import * as path from 'path';

export interface RunOptions {
  writeRoot?: string;
  writeFiles?: boolean;
  goalSuffix?: string;       // appended to the agent's defaultGoal
}

export abstract class BaseAgent {
  abstract readonly id: string;
  abstract readonly skillFile: string;       // relative to skills/
  abstract readonly defaultGoal: string;

  // Per-agent overrides — subclass sets only what it cares about.
  protected modelOverride?: string;          // e.g. 'anthropic:claude-opus-4-7'
  protected maxIterationsOverride?: number;
  protected enableCritique = true;

  constructor(protected orch: Orchestrator) {}

  /** Hook: runs before the agent loop. Return true to continue, false to abort. */
  protected async beforeRun(_opts: RunOptions): Promise<boolean> { return true; }

  /** Hook: runs after the agent loop, before status update. */
  protected async afterRun(_opts: RunOptions): Promise<void> {}

  async run(opts: RunOptions = {}): Promise<string> {
    const proceed = await this.beforeRun(opts);
    if (!proceed) return '';

    const skillPath = path.join(
      this.orch.context.extensionPath, 'skills', this.skillFile
    );
    const result = await runAgentLoop({
      orchestrator: this.orch,
      agent: this.id,
      skillPath,
      userGoal: opts.goalSuffix
        ? this.defaultGoal + '\n\n' + opts.goalSuffix
        : this.defaultGoal,
      maxIterations: this.maxIterationsOverride ?? this.orch.maxIter(),
      writeFiles: opts.writeFiles,
      writeRoot: opts.writeRoot
    });

    await this.afterRun(opts);
    return result;
  }
}
```

Then concrete agents become small. Example:

```ts
// src/agents/ApiConverterAgent.ts
import { BaseAgent, RunOptions } from './BaseAgent';
import { copyTemplates, deriveVarsFromArchitectureMd } from '../utils/templateCopier';
import * as fs from 'fs';
import * as path from 'path';

export class ApiConverterAgent extends BaseAgent {
  readonly id = 'apiConverter';
  readonly skillFile = 'api-converter/SKILL.md';
  readonly defaultGoal =
    'Convert all .NET Web API controllers/services/repositories/DTOs/configs into a ' +
    'production-grade Java 21 + Spring Boot 3 multi-module Maven project. ' +
    'Templates already exist on disk — generate only the project-specific code.';

  protected maxIterationsOverride = 50;

  /** Pre-hook: copy Spring Boot templates before the agent runs. */
  protected async beforeRun(opts: RunOptions): Promise<boolean> {
    if (!opts.writeRoot) return false;
    const archMd = this.orch.archFile() && fs.existsSync(this.orch.archFile())
      ? fs.readFileSync(this.orch.archFile(), 'utf8') : '';
    const vars = deriveVarsFromArchitectureMd(archMd, {
      artifactId: path.basename(this.orch.targetRoot()).toLowerCase()
    });
    const tmpl = path.join(this.orch.context.extensionPath, 'templates', 'springboot');
    const written = copyTemplates(tmpl, opts.writeRoot, vars);
    this.orch.log(`[${this.id}] copied ${written.length} template files`);
    return true;
  }
}
```

The orchestrator's `stepConvertApi` collapses to:

```ts
async stepConvertApi(): Promise<void> {
  if (!this.ensureSetup()) return;
  this.setStatus('convertApi', 'running');
  try {
    const apiRoot = path.join(this.targetRoot(), 'api');
    await new ApiConverterAgent(this).run({ writeFiles: true, writeRoot: apiRoot });
    this.setStatus('convertApi', 'done', 'Spring Boot generated', apiRoot);
  } catch (e: any) {
    this.setStatus('convertApi', 'failed', e.message);
    throw e;
  }
}
```

Pipeline plumbing stays in the orchestrator; agent behavior moves to the agent class. The pre/post hooks (Symptom 3) now have a clean home.

### Layer 2: Per-agent model selection (~1 hour)

This is the cost win from `TROUBLESHOOTING_QUOTA_AND_COST.md` made concrete. Extend `BaseAgent`:

```ts
async run(opts: RunOptions = {}): Promise<string> {
  // ... beforeRun ...

  // Resolve model: agent override > settings override > orchestrator default
  const stepOverride = this.orch.cfg().get<string>(`modelFor.${this.id}`);
  const effective = stepOverride ?? this.modelOverride;
  const previousModel = this.orch.swapModelTo(effective);  // returns prior; null = no swap
  try {
    const result = await runAgentLoop({ /* ... */ });
    await this.afterRun(opts);
    return result;
  } finally {
    this.orch.restoreModel(previousModel);
  }
}
```

`Orchestrator.swapModelTo` and `restoreModel` are small additions: parse the override (`'anthropic:claude-opus-4-7'`, `'copilot:gpt-4o-mini'`, `'local-ollama:qwen2.5-coder:32b'`) and rebuild the `LlmClient` for the duration of the call.

Add per-step settings to `package.json`:

```json
"modernizer.modelFor.analyze":     { "type": "string", "default": "" },
"modernizer.modelFor.docs":        { "type": "string", "default": "" },
"modernizer.modelFor.convertApi":  { "type": "string", "default": "" },
"modernizer.modelFor.convertUi":   { "type": "string", "default": "" },
"modernizer.modelFor.tests":       { "type": "string", "default": "" },
"modernizer.modelFor.cicd":        { "type": "string", "default": "" },
"modernizer.modelFor.defects":     { "type": "string", "default": "" }
```

Empty string = use global default. Now a user can configure:

```json
{
  "modernizer.modelFor.convertApi": "anthropic:claude-opus-4-7",
  "modernizer.modelFor.tests": "copilot:gpt-4o-mini",
  "modernizer.modelFor.cicd": "copilot:gpt-4o-mini"
}
```

Big model where it matters, cheap model everywhere else, without code changes.

### Layer 3: Per-agent tool schemas (~2 hours)

Extend `BaseAgent` to optionally contribute extra tools:

```ts
export abstract class BaseAgent {
  // ... existing ...
  protected extraTools(): any[] { return []; }   // override to add tools
  protected async dispatchExtraTool(_call: any): Promise<string | null> { return null; }
}
```

Modify `runAgentLoop` to accept `extraTools` and `extraDispatch`:

```ts
const tools = [...TOOL_SCHEMAS, ...(opts.extraTools ?? [])];
// in dispatch:
const handled = await opts.extraDispatch?.(call);
if (handled !== null && handled !== undefined) return handled;
// fall through to default dispatch
```

Then a defect resolver can ship its own tools:

```ts
export class DefectResolverAgent extends BaseAgent {
  readonly id = 'defectResolver';
  readonly skillFile = 'defect-resolver/SKILL.md';
  readonly defaultGoal = 'Fix the Jira defect minimally and add a regression test.';

  protected extraTools() {
    return [
      {
        name: 'git_diff',
        description: 'Show the working-tree diff for files in writeRoot.',
        input_schema: { type: 'object', properties: { paths: { type: 'array' } } }
      },
      {
        name: 'run_tests',
        description: 'Run the test suite that covers the changed files.',
        input_schema: { type: 'object', properties: {} }
      }
    ];
  }

  protected async dispatchExtraTool(call: any) {
    if (call.name === 'git_diff')   return runGitDiff(this.orch.targetRoot(), call.input.paths);
    if (call.name === 'run_tests')  return runTargetedTests(this.orch.targetRoot());
    return null;
  }
}
```

Now a defect resolver can iterate against real test results, not just static analysis. Symptom 2 solved cleanly.

---

## Migration plan

If you're going to do this refactor, do it in this order to avoid breaking the working pipeline mid-flight:

1. **Land Layer 1 first.** Create `src/agents/BaseAgent.ts` and one subclass — start with `ApiConverterAgent` because it has the most pre-hook value. Keep all other agents on the old code path. Verify the API conversion step still works end-to-end.
2. **Migrate the rest one at a time.** `UiConverterAgent`, then `TestGeneratorAgent`, etc. After each, run the full pipeline once to confirm nothing regressed.
3. **Land Layer 2 once all agents are classes.** This is the cost win — don't skip it.
4. **Land Layer 3 only when you have a concrete need.** Don't build extra-tool plumbing speculatively. Wait until DefectResolverAgent or TestGeneratorAgent actually wants `run_tests` or `git_diff`, then add it.

Each layer is a half-day of work, ships a real improvement, and is independently shippable. You don't have to do all three to get value from the refactor.

---

## Anti-patterns to avoid in the refactor

### Don't make every agent inherit from BaseAgent if there's nothing to share

If an agent has no overrides, no pre/post hook, and no extra tools, it doesn't need its own class. Keep it as a plain skill + step method. The agents directory should hold classes that earn their existence.

### Don't move skill content into TypeScript

The big mistake would be turning each SKILL.md into a string constant inside the agent class. Skills should stay markdown — they're reviewable by non-engineers, version-controlled separately, and the format is the same as user-facing best-practice docs. The class points at the skill file; it doesn't replace it.

### Don't centralize all per-agent config into one big config object

Tempting to make a `agents.json` or similar with every agent's settings. Resist. Per-agent code in a per-agent class is more discoverable than per-agent config in a shared file. The class is the agent's contract; let it speak for itself.

### Don't promote `BaseAgent` into a framework

If you find yourself adding lifecycle methods like `beforeBeforeRun`, `afterAfterRun`, `onIteration`, `onCritiquePass`, you're building a framework. Stop. The base class should be small (≤ 100 lines), have one extension point per concrete need, and refuse cleverness.

---

## What to do right now

If you're reading this without an actual problem to solve:

1. **Delete the empty `src/agents/` and `src/prompts/` folders.** Empty scaffold ages into confusion.
2. **Add a comment in `agentLoop.ts`** — at the top, briefly: "Agent behavior lives in `skills/<agent>/SKILL.md`. The orchestrator dispatches to a uniform loop here. If you need per-agent classes, see `docs/EXTENDING_AGENT_CAPABILITY.md`."
3. **Update `docs/ARCHITECTURE.md`** to remove any mention of the empty folders.

If you're reading this because you've hit one of the five symptoms:

1. **Identify which symptoms you have.** If only one, paper over with a setting and document it.
2. **If you have three or more, do Layer 1 first.** Don't try to do everything at once.
3. **Migrate one agent at a time.** Verify each migration with a full pipeline run before moving to the next.

---

## Why this matters beyond this one folder

Empty scaffold folders are a special case of a broader pattern: **structure that anticipates capability you haven't built yet.** It feels organized at the time and confusing forever after. Two cousins of the same mistake have appeared in this project already — the empty `templates/` folder before it was populated, and the `src/agents/`/`src/prompts/` directories created in the very first scaffold.

The principle: **only create folders for files that exist.** If you anticipate needing a folder later, leave a comment in `docs/EXTENDING.md` describing where it would go and what it would hold. Don't create the directory until the first file lands.

For agents specifically, the second principle: **promote from data to code only when capability demands it.** Most agents in most projects are happy as SKILL.md + a step method. The minute you need per-agent models, per-agent tools, or non-trivial pre/post hooks, classes earn their place. Until then, classes are overhead. Knowing where that line sits — and being willing to cross it later, not earlier — is what keeps the codebase navigable.

When extending this pipeline with a new agent, ask in this order:
1. Can a new SKILL.md and a new step method handle it? **Probably yes — do that.**
2. Does it need a tool that no other agent uses? **Then it's earned a class.**
3. Does it need pre/post hooks beyond a few lines in the step method? **Then it's earned a class.**
4. Does it need its own model? **Then either Layer 2 of this refactor, or a per-step setting — depending on how many other agents are also asking.**

Most new agents fall into bucket 1. The ones that don't are signal that the structure should grow — not before, not behind, but exactly when capability demands it.
