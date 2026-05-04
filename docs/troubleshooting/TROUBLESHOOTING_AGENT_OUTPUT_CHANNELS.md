# Troubleshooting: Agent Output Channels & Artifact Write Semantics

## Problem

A pipeline step appears to run successfully, but the file it was supposed to produce contains a **description of what the agent did** instead of the actual artifact. Concrete example seen in the wild:

> *Contents of `LEGACY_DOCUMENTATION.md`:*
>
> *"Compiled a full legacy documentation draft for ContosoStore covering system overview, module map, API surface, data model, business rules, UI flows, integrations, and known smells based on the ASP.NET Core API and ASP.NET WebForms sources; attempted write to LEGACY_DOCUMENTATION.md but file writing was disabled in this environment."*

The status tree shows the step as ✅ done. The file exists. The file's content is wrong — it's a meta-description, not the documentation itself.

This is more likely with smaller models (`gpt-4o-mini`, `gpt-3.5`, `claude-haiku`) and less likely (but still possible) with frontier models. Frontier models tend to ignore the constraint and dump the artifact into whatever channel they can find; small models follow the literal instruction and produce nothing useful.

---

## Root cause

The original orchestrator used **two different channels** to get artifacts back from agents:

1. **`write_file` tool** — for code-generation steps. The agent writes files directly to disk via tool calls; the orchestrator just confirms they appeared.
2. **`finish` tool's `summary` field** — for the documentation step. The orchestrator captured the agent's last text output and wrote it to disk itself.

The doc-generator step was configured with `writeFiles: false` because "documentation isn't really code." This was a design mistake. It forced the agent into channel #2, which has three problems:

### Problem 1 — `summary` is semantically a wrap-up, not an output channel

The skill says "call `finish` with a summary." Models trained on tool-use conventions interpret "summary" as a **brief description of what was accomplished**, not as the raw artifact content. A well-aligned model produces a one-paragraph wrap-up; a misaligned model crams the artifact in there; both are valid interpretations of the prompt because the prompt is ambiguous.

### Problem 2 — Output budgets are smaller in `finish`

Different model APIs apply different limits to tool-call argument fields. A 50KB markdown document might fit comfortably in a `write_file` content arg but get truncated in a `finish.summary` arg. You won't get an error; you'll get a silently truncated artifact.

### Problem 3 — When `writeFiles` is false, the model knows the only available channel is text

This is what triggered the failure mode in the example. The model saw `writeFiles: false` (communicated through the system prompt or through tool availability), read the skill's instruction "write the markdown via write_file," noted the contradiction, and resolved it by describing what it would have done. Mini followed the contradiction literally; Sonnet would have ignored the constraint and dumped the markdown into the `finish` summary anyway.

The deeper issue: **the orchestrator was using `finish.summary` as a smuggling channel for content that should have been a real file.** It worked incidentally with strong models and broke loudly with weak ones.

---

## The specific fix

Let every artifact-producing step use the `write_file` tool, the same way the API and UI converters do. In `src/orchestrator/orchestrator.ts`, find `stepGenerateDocs`:

```ts
async stepGenerateDocs(): Promise<void> {
  if (!this.ensureSetup()) return;
  this.setStatus('docs', 'running');
  try {
    const writeRoot = path.join(this.targetRoot(), '_modernizer');
    fs.mkdirSync(writeRoot, { recursive: true });

    await runAgentLoop({
      orchestrator: this,
      agent: 'documenter',
      skillPath: path.join(this.context.extensionPath, 'skills', 'documentation-generator', 'SKILL.md'),
      userGoal:
        'Using the inventory.json plus source reading, write LEGACY_DOCUMENTATION.md to the writeRoot. ' +
        'Cover: system overview, module map, API surface, data model, business rules, UI flows, integrations, ' +
        'and known smells. Use Mermaid diagrams where useful. Call write_file with path "LEGACY_DOCUMENTATION.md" ' +
        'and the full markdown as content. Then call finish.',
      maxIterations: this.maxIter(),
      writeFiles: true,
      writeRoot
    });

    const outFile = path.join(writeRoot, 'LEGACY_DOCUMENTATION.md');
    if (!fs.existsSync(outFile)) {
      throw new Error(
        'Documenter agent finished but did not write LEGACY_DOCUMENTATION.md. ' +
        'Check the Output panel for the agent log.'
      );
    }

    this.setStatus('docs', 'awaiting-review', 'Open file in editor for review', outFile);
    const doc = await vscode.workspace.openTextDocument(outFile);
    await vscode.window.showTextDocument(doc);
  } catch (e: any) {
    this.setStatus('docs', 'failed', e.message);
    throw e;
  }
}
```

Same treatment for `stepAnalyze` — let the analyzer write `inventory.json` directly via `write_file` instead of returning it as text.

Then update the SKILL.md to confirm the channel: "use write_file to produce the artifact; use finish only to signal completion."

Optional defense in depth: if the agent doesn't write the file but `lastFreeText` is non-trivial, write that to disk as a recovery fallback so users don't lose work entirely.

---

## The general principle: separate channels by purpose

This is the lesson worth remembering for every future agent.

Each tool call channel has a **purpose**. Mixing them is the bug.

| Channel               | Purpose                                                | What goes here                              | What doesn't                              |
|-----------------------|--------------------------------------------------------|---------------------------------------------|-------------------------------------------|
| `write_file` (or equivalent disk tool) | Persisting artifacts for the user to consume | Generated code, generated docs, generated configs, manifests, tests | Status messages, agent reasoning, summaries |
| `finish.summary`      | Signaling to the orchestrator that work is done        | "Wrote 47 files in 6 modules. All planned items completed." | The full content of the artifact          |
| Free text in the response | Internal reasoning the orchestrator may log         | Step-by-step thinking, alternatives considered | The artifact, file paths, machine-readable data |
| Custom return JSON via a structured tool | Machine-readable signals to the orchestrator | Plan-vs-actual reconciliation, file lists, error counts | Prose, anything intended for human reading |

When a channel is misused, failures fall into one of three patterns:

### Pattern A — Smuggling artifacts through summary fields

What we just hit. The agent crams generated content into `finish.summary` because the orchestrator told it to "return" the artifact. Symptoms:

- Output file contains a description, not the content.
- Output file is suspiciously short or truncated.
- File contains phrases like "I produced" or "the document covers."

**Rule:** if the artifact is more than a paragraph and is meant for humans, it goes through `write_file`. Always.

### Pattern B — Free text instead of structured output

The agent emits reasoning that the orchestrator was supposed to parse. Symptoms:

- Orchestrator's parsing logic crashes with "unexpected JSON" errors.
- Orchestrator silently uses a default because parsing failed.
- Different runs of the same step produce inconsistent downstream behavior.

**Rule:** if the orchestrator needs to read the agent's output programmatically, give the agent a dedicated structured-output tool (`emit_plan`, `emit_inventory`) — don't rely on parsing free text.

### Pattern C — `finish` called too early

The agent calls `finish` after writing one file, thinking the goal was that file. Documented separately in `TROUBLESHOOTING_INCOMPLETE_CONVERSION.md` — same root cause, different channel: the agent has no enforced commitment device or verifier, so "done" is whatever it decides means done.

**Rule:** before `finish`, agents should re-list the disk and compare against a plan they wrote earlier. Calling `finish` with planned-but-unwritten files is a failure.

---

## Six things to be careful about when designing any agent step

These generalize from the doc-generator failure. Audit every existing skill against this list before shipping:

### 1. Define exactly one channel per kind of output

For each artifact the step produces, pick one channel and stick with it. Don't have an "either-or" — that's where ambiguity lives. The skill should say "write the X via Y" not "produce the X."

### 2. Match channel capacity to expected output size

`finish.summary` and free-text responses are bounded by the model's response budget — typically 4–16K tokens. Anything bigger needs `write_file`. If you're unsure, default to `write_file`; over-using disk is fine, smuggling content through summaries is not.

### 3. Be explicit when a channel is disabled

If `writeFiles: false`, the system prompt should say so plainly, and the skill must redirect to a viable alternative. Don't leave the agent guessing what to do with an artifact it can't write. Better still: don't have the option. Every artifact-producing step should have `writeFiles: true`.

### 4. Verify the channel was used after the call returns

Don't trust the agent's claim of success. After the step:

- Does the expected file exist on disk?
- Is its size sane (> a few hundred bytes for documentation; > a hundred bytes for JSON)?
- Does it parse as the expected format (valid JSON, valid markdown structure)?

If any check fails, that's a step failure even if the agent called `finish` happily.

### 5. Recover gracefully from channel mismatches

When validation fails, you have three options ranked by quality:
- **Re-run the step** automatically with a stricter prompt naming the failure.
- **Fall back to a secondary channel** — e.g., if the file wasn't written, save `lastFreeText` to disk as last-resort content.
- **Fail loud** — surface the error so the user knows the step didn't really succeed.

The original scaffold did none of these; it just wrote whatever came back from `finish` and called it done.

### 6. Test with a weak model on purpose

Strong models compensate for ambiguous prompts; weak models don't. Run each step at least once with `gpt-4o-mini` or `claude-haiku` during development. If a step works on Sonnet but breaks on mini, the prompt is ambiguous and will eventually break in production too. Mini is your canary.

---

## Audit checklist for existing agents

Run through every step in the pipeline:

| Step | Output | Channel currently used | Risk |
|------|--------|------------------------|------|
| Analyze | `inventory.json` | (was) `finish.summary` | High — same as doc-generator. Switch to `write_file`. |
| Documenter | `LEGACY_DOCUMENTATION.md` | (was) `finish.summary` | Already fixed above. |
| API converter | Many `.java`, `pom.xml`, `application.yml` | `write_file` | Correct. |
| UI converter | Many `.tsx`/`.ts`/`package.json` | `write_file` | Correct. |
| Test generator | Test files | `write_file` | Correct. |
| CI/CD generator | Helm/Kustomize/Tekton/Jenkinsfile | `write_file` | Correct. |
| Defect resolver | Modified files | `write_file` | Correct. |

If you add a new step, fill in this row before writing any code. If the channel column is anything but `write_file` and the artifact is bigger than a paragraph, stop and reconsider.

---

## Diagnostic checklist when you suspect a channel mismatch

1. **Open the output file.** Is it the artifact, or a description of the artifact? Look for first-person language, past-tense verbs, or phrases like "I created," "the document contains," "attempted to write."
2. **Check the file size.** A 200-byte "documentation" file is suspicious. So is a 4KB Java service that should have been 200 lines.
3. **Open the Output panel → "Legacy Modernizer".** Look at the agent's tool-call log. Did it call `write_file` at all? If not, you have a channel-misuse bug.
4. **Check `finish.summary` length.** If it's longer than ~500 chars, the agent is smuggling content. Tighten the skill to forbid it.
5. **Re-run with a stronger model.** If the bug disappears, the prompt is ambiguous — fix the prompt, don't just rely on a stronger model.
6. **Re-run with a weaker model.** If the bug appears that didn't before, you found a hidden ambiguity. Fix it.

---

## Why this matters beyond this one bug

Agentic systems are **multi-channel by nature**: tool calls, summaries, free text, structured returns, side effects on disk. Most agent bugs at the integration layer are channel-confusion bugs in disguise.

Three rules to internalize:

1. **One artifact, one channel.** Don't make the agent guess where to put output.
2. **Verify on the orchestrator side, not the agent side.** Agents are unreliable narrators of their own success. Disk doesn't lie.
3. **Test with weak models to surface ambiguity.** If your prompts only work on the best model, they don't really work.

These three rules apply equally to any agentic feature, not just modernization. Whenever you add a new agent — a Quarkus converter, a Vue UI, a Terraform generator, a database migrator — apply them from day one. The cost of channel discipline up front is one hour of design; the cost of skipping it is silent corruption you discover three weeks later in production.
