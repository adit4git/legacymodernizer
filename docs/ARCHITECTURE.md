# Internal Architecture

## Components
- **Activation** (`src/extension.ts`) wires up the menu webview, status tree, and all commands.
- **Menu webview** (`src/ui/menuProvider.ts`) is the only thing the user touches. Every action is a `postMessage` to the extension; the user types nothing.
- **Orchestrator** (`src/orchestrator/orchestrator.ts`) holds the pipeline state machine: `pending → running → done | awaiting-review | failed`. It enforces human gates and step prerequisites.
- **Agent loop** (`src/orchestrator/agentLoop.ts`) is the generic tool-use loop reused by every agent. It loads the SKILL.md, builds the system prompt, and dispatches tool calls (`list_dir`, `read_file`, `search_text`, `write_file`, `finish`). After the main loop it runs a single **critique pass** asking the model to find and fix defects in its own output.
- **LLM client** (`src/utils/llmClient.ts`) abstracts Claude Sonnet and OpenAI Codex/GPT behind a common interface. Tool schemas are translated automatically.
- **MCP clients** (`src/mcp/jira.ts`, `src/mcp/bitbucket.ts`) speak JSON-RPC to remote MCP servers using the standard `tools/call` method.

## State machine

```
analyze
  ↓
docs (requires latest inventory artifact; may trigger analyze if missing)
  ↓
reviewDocs (GATE, must be approved)
  ↓
convertApi ─┐
            ├─> reviewCode (GATE, requires both API and UI complete)
convertUi ──┘
  ↓
tests (requires reviewCode approved)
  ↓
cicd
  ↓
reviewCicd (GATE)
  ↓
done
```

Gate behavior:
- Each gate is a modal `showInformationMessage` with `Approve & Continue`, `Re-generate`, `Cancel`.
- `reviewDocs` blocks until `docs` has run (`awaiting-review` or `done`).
- `reviewCode` blocks until both `convertApi` and `convertUi` are `done`.
- `reviewCicd` blocks until `cicd` has run (`awaiting-review` or `done`).

Prerequisite behavior:
- Out-of-order clicks are blocked with a warning and step detail like `Blocked: ...`.
- `stepGenerateDocs` enforces `analyze` as a prerequisite by requiring a `_modernizer/inventory-*.json` artifact (or legacy `inventory.json`).

## File-system contract
- **legacyRoot** is read-only. The agent can `list_dir`, `read_file`, and `search_text` against it, but never `write_file`.
- **writeRoot** is the only place the agent can write. Path traversal (`..`) is rejected by `agentLoop.ts`.
- The orchestrator creates a `<writeRoot>/_modernizer/` folder for intermediate artefacts (`inventory-YYYYMMDD-HHMMSS.json`, `LEGACY_DOCUMENTATION-YYYYMMDD-HHMMSS.md`) and can still reuse legacy non-timestamped files.

## Skill files
Each agent has a SKILL.md describing:
1. **When this skill applies** — preconditions.
2. **Output layout** — exact folder structure to produce.
3. **Conversion mapping** — table of `legacy → modern`.
4. **Procedure** — step-by-step.
5. **Quality bar** — measurable criteria.
6. **Hard rules** — things the agent must never do.

The orchestrator concatenates SKILL.md and the user's optional architecture markdown into the system prompt for that step.

## Iteration & convergence
- Default `maxIterations = 5`. Most steps converge in 2–3.
- Self-critique pass runs once after the main loop; it can write further fixes via `write_file`.
- Human re-generate is the macro-iteration: the user re-runs the step after editing the architecture doc or the previous artefact.

## Why a webview menu instead of QuickPicks?
- Persistent, visible state (selected paths shown live, not hidden in a one-shot picker).
- Three buttons can be pressed without remembering command names or palette syntax.
- Works on a single screen with the status tree below.
