# Extending the Modernizer

## Adding a new agent / step
1. Create a new `skills/<my-step>/SKILL.md` describing inputs, output layout, conversion mapping, procedure, quality bar, and hard rules.
2. Add a step entry in `DEFAULT_STEPS` in `src/orchestrator/orchestrator.ts`.
3. Add a `step<MyStep>()` method on `Orchestrator` that calls `runAgentLoop({ skillPath, userGoal, writeRoot, writeFiles })`.
4. Register a command in `src/commands/index.ts` and add a button in `src/ui/menuProvider.ts`.
5. **Walk the agent-readiness checklist below before declaring the step done.**

## Agent-readiness checklist

This list captures the hard-won lessons from building the API converter. Six layers stack from foundation to polish. The first four belong on day one; skipping any of them produces failures that look unrelated and waste hours of debugging. The last two are polish that pays off only after the foundation works.

### Foundation (day-one mandatory)

| # | Layer | Symptom if absent | Fix location |
|---|---|---|---|
| 1 | **Iteration cap ≥ 30** | Agent quits at iteration 4-6 with one file written | `modernizer.maxIterations` setting |
| 2 | **Plan-and-verify protocol** | Agent calls `finish` early thinking it's done | Skill `Procedure` section + `userGoal` |
| 3 | **Fixup loop is multi-turn** | Verification finds gaps but only one file gets written per pass | `agentLoop.ts` verification block |
| 4 | **Structured tool messages** | Tool calls reappear as text in next turn; conversation degrades silently | `LlmClient` + `agentLoop.ts` message append |

### Polish (add once foundation is stable)

| # | Layer | What it gives you | Fix location |
|---|---|---|---|
| 5 | **Resume / delta runs** | 30-minute re-runs become 2-minute deltas; lower API cost | `step*` orchestrator method |
| 6 | **Real linter / compiler in loop** | Auto-fix compile errors before declaring done | `agentLoop.ts` post-loop verifier |

### Concretely, before declaring a new agent ready, confirm

- [ ] `modernizer.maxIterations` ≥ 30 (or per-step override). For UI/API converters, lean toward 40-50.
- [ ] Skill's `Procedure` section requires the agent to write a plan JSON before generating, then reconcile against disk before calling `finish`.
- [ ] `userGoal` enumerates exactly what must be produced (named files, named subpackages) — not just what to avoid.
- [ ] Verification block reads the plan file and re-checks disk after the main loop ends.
- [ ] Fixup pass is a *loop* over multiple LLM turns, not a single shot.
- [ ] Each fixup turn appends the assistant's structured response back into the conversation (with `tool_use` blocks intact) and the user's `tool_result` blocks back, both as content arrays — not stringified JSON.
- [ ] On no-tool-call turns, the loop nudges once before counting the streak; stops only after 2-3 consecutive no-tool turns.
- [ ] Resume mode detects an existing plan, computes plan-vs-disk delta, and offers Reuse / Resume / Regenerate / Cancel.
- [ ] Regenerate semantically wipes prior outputs (don't just overwrite — explicitly delete planned paths and the plan file).
- [ ] Plan paths use a single resolution helper shared with the verifier so resume detection and verification agree on what "exists" means.

### What the layers protect against

Each layer fixes a distinct failure mode. Adding three of four creates a system that fails *worse* than no agent at all — partial output that looks plausible. All four are required to ship.

- **Iteration cap** keeps the agent running long enough to do the work.
- **Plan-and-verify** keeps it honest about what work is.
- **Fixup loop** lets it close gaps the verifier finds.
- **Structured messages** keep multi-turn conversations from silently corrupting.

The order matters during debugging: if the agent produces incomplete output, check the layers in order 1 → 2 → 3 → 4. The earliest layer that's broken explains the symptom, and fixing layer N often makes layer N+1's bug visible. We discovered them in this order through pain; documenting them lets the next agent step skip the pain.

## Adding a new target stack (e.g., Quarkus instead of Spring Boot)
1. Add `skills/api-converter/SKILL-quarkus.md` with the equivalent conversion mapping.
2. Extend the `targetApiStack` setting in `package.json`.
3. In `stepConvertApi`, branch on the setting to pick the right skill file.
4. **Walk the agent-readiness checklist above** — same six layers apply to any target stack.

## Adding a new model provider
1. Add a class implementing `LlmClient` in `src/utils/llmClient.ts`.
2. Extend `makeLlmClient` to instantiate it.
3. Add the provider to the `modernizer.modelProvider` enum in `package.json`.
4. **Make sure the provider returns `rawContent` (or equivalent) so the agent loop can preserve structured tool-use blocks across turns.** A provider that flattens tool calls to text re-creates layer-4 corruption.

## Tweaking iteration & critique
- `modernizer.maxIterations` — main loop turn cap.
- The critique pass currently does plan-vs-disk reconciliation and loops up to 3 verification passes. Each pass runs its own multi-turn fixup loop with explicit nudges on no-tool-call turns.
- To replace with deeper critique, factor out the loop into a strategy interface and swap implementations per agent.

## Wiring a real linter into the loop
After `runAgentLoop` writes files, shell out (`child_process.spawnSync`) to `mvn -q -DskipTests compile` for the API or `tsc --noEmit` for the UI, capture errors, and feed them back as the next user message. This is layer 6 from the readiness checklist — turns the agent from "code generator" into "convergent engineer." Implement only after layers 1-5 are working; doing it earlier produces compile loops on top of incomplete code.

## Documenting your additions
When you ship a new agent or extend an existing one, update:
- `docs/ARCHITECTURE.md` — add the new step to the state-machine diagram.
- `docs/HUMAN_GATES.md` — if the new step needs a review gate, add a checklist.
- `docs/HYBRID_TEMPLATES_AND_GENERATION.md` — if the new step uses templates, list them.
- The `README.md` Pipeline section.

If the new agent surfaces a novel failure mode, write a `docs/TROUBLESHOOTING_<MODE>.md` capturing the problem, root cause, fix, and what to look out for next time. The existing troubleshooting docs are the working playbook for this kind of system.
