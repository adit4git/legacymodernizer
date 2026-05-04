# Legacy .NET Modernizer — Agentic VS Code Extension

End-to-end, click-driven, iterative agent that converts legacy .NET applications into:

- **Java 21 + Spring Boot 3.3** REST APIs
- **React 18 + TypeScript** *or* **Angular 17 + TypeScript** SPAs
- **OpenShift-ready** Dockerfiles, Helm charts, Kustomize overlays, Tekton pipelines, Jenkinsfile, and Bitbucket Pipelines manifests
- **JUnit + Mockito + Testcontainers** API tests and **Vitest/Karma** UI tests

It runs **inside VS Code** with either **Claude Sonnet** or **OpenAI Codex/GPT** as the agent brain, includes **three human review gates**, and integrates with **Jira and Bitbucket via MCP** to close the defect loop.

The whole thing is driven from a click-only menu — the user only ever picks two folders and one optional architecture markdown.

---

## Why this exists

Legacy .NET modernization usually fails for three reasons:
1. **No documentation of the legacy** before the rewrite begins, so behaviour is silently lost.
2. **No human-in-the-loop checkpoints**, so the team finds out about wrong assumptions only after thousands of lines of generated code.
3. **No closed defect loop** — generated code accumulates issues that never make it back into the model's context.

This tool addresses all three with a deliberate pipeline that pauses at three points for human approval, and a Jira/Bitbucket loop that lets the model fix its own bugs after deployment.

---

## How it works at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  Activity Bar  →  🚀 Legacy Modernizer                      │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
[ 1. Analyze Legacy ] ──► inventory-YYYYMMDD-HHMMSS.json
       │
       ▼
[ 2. Generate Legacy Docs ] ──► LEGACY_DOCUMENTATION-YYYYMMDD-HHMMSS.md
       │
       ▼
⛔ HUMAN GATE #1: Review Documentation
       │ Approve
       ▼
[ 4. Convert API → Spring Boot ]    [ 5. Convert UI → SPA ]
       │                                     │
       └──────────────► writeRoot/api  &  writeRoot/ui
                              │
                              ▼
              ⛔ HUMAN GATE #2: Review Generated Code
                              │ Approve
                              ▼
[ 7. Generate Tests ] ──► api/src/test/...   &   ui/src/__tests__/...
       │
       ▼
[ 8. Generate CI/CD ] ──► writeRoot/deploy
       │
       ▼
⛔ HUMAN GATE #3: Review CI/CD
       │ Approve
       ▼
✨ Modernization complete
       │
       ▼
🐛 Defect loop: Jira (MCP) → fix code → Bitbucket PR (MCP)
```

Each step is an **agent** with its own SKILL.md playbook (under `skills/`). The orchestrator runs each agent in a **tool-use loop**: the model emits `read_file`, `list_dir`, `search_text`, `write_file`, or `finish` calls; the extension dispatches them; results feed back into the next turn. After each step the agent runs a **self-critique pass** to catch obvious defects.

---

## Quick start

### 1. Install (dev mode)
```bash
git clone <this-repo>
cd legacy-modernizer
npm install
npm run compile
# In VS Code:
#   F5 to launch the Extension Development Host
#   OR: vsce package && code --install-extension legacy-modernizer-1.0.0.vsix
```

### 2. Configure
Open VS Code Settings → search "Modernizer" and set:

| Setting                             | Example                                            |
|-------------------------------------|----------------------------------------------------|
| `modernizer.modelProvider`          | `claude-sonnet` or `openai-codex`                  |
| `modernizer.anthropicApiKey`        | `sk-ant-...`                                       |
| `modernizer.openaiApiKey`           | `sk-...`                                           |
| `modernizer.jira.mcpEndpoint`       | `https://mcp.your-org.com/jira`                    |
| `modernizer.bitbucket.mcpEndpoint`  | `https://mcp.your-org.com/bitbucket`               |

You can also set most things via the menu webview in two clicks — no typing.

### 3. Run with the bundled sample
1. Click the rocket icon in the Activity Bar.
2. Click **📦 Load Bundled Sample Legacy Code**, pick a parent folder. The extension copies the `ContosoStore` ASP.NET sample there and sets it as the legacy root.
3. Click **📂 Pick Target Output Folder**, pick an empty folder.
4. (Optional) Click **📐 Pick Target Architecture .md** and choose `templates/EXAMPLE_TARGET_ARCHITECTURE.md`.
5. Click **🚀 Run Full Pipeline** — or step through each numbered button.

### 4. Bring your own legacy code
Replace step 2 above by clicking **📂 Pick Legacy .NET Codebase** and pointing at your repo. Anything from .NET Framework WebForms / WCF up through .NET 8 Minimal API is in-scope.

---

## The three human gates

| Gate | What you review                                     | Why it matters                                              |
|------|-----------------------------------------------------|-------------------------------------------------------------|
| #1   | Latest `_modernizer/LEGACY_DOCUMENTATION-*.md`     | Catch wrong assumptions about the legacy *before* converting any code. |
| #2   | Generated `api/` Spring Boot + `ui/` SPA            | Approve architecture, naming, security shape, error handling. |
| #3   | `deploy/` (Helm + Kustomize + Tekton + Jenkinsfile) | Approve resource limits, probes, network policies, secret strategy. |

Each gate is a modal dialog with Approve / Re-generate / Cancel.

---

## Defect loop (Jira ↔ Bitbucket via MCP)

After your modernized app is in QA, defects inevitably surface. To close the loop:

1. Click **🐛 Fetch Jira Defects** — the Jira MCP server returns open bugs. Pick one.
2. Click **🔧 Resolve Defect → Bitbucket PR** — the `defectResolver` agent reads the description, locates the offending code, fixes it, adds a regression test, then the extension:
   - Creates a `fix/<JIRA-KEY>` branch.
   - Commits and pushes.
   - Calls the Bitbucket MCP tool to open a PR linked to the Jira issue.

The same agent loop is reused — only the goal and skill change.

---

## Project layout

```
legacy-modernizer/
├── package.json                     VS Code extension manifest (commands, menus, settings)
├── tsconfig.json
├── src/
│   ├── extension.ts                 Activation
│   ├── commands/                    Command registrations (one menu item each)
│   ├── ui/                          Activity-bar webview menu + status tree
│   ├── orchestrator/
│   │   ├── orchestrator.ts          Pipeline state machine + human gates
│   │   └── agentLoop.ts             Generic tool-use loop with self-critique
│   ├── mcp/                         Jira + Bitbucket MCP clients
│   └── utils/llmClient.ts           Model abstraction (Sonnet & Codex)
├── skills/
│   ├── documentation-generator/SKILL.md
│   ├── api-converter/SKILL.md
│   ├── ui-converter/SKILL-react.md
│   ├── ui-converter/SKILL-angular.md
│   ├── test-generator/SKILL.md
│   ├── cicd-generator/SKILL.md
│   └── defect-resolver/SKILL.md
├── sample-legacy-code/              ContosoStore: .NET 6 API + ASP.NET WebForms UI
│   ├── ContosoStore.sln
│   ├── ContosoStore.Api/
│   └── ContosoStore.Web/
├── templates/
│   └── EXAMPLE_TARGET_ARCHITECTURE.md
└── docs/
    ├── ARCHITECTURE.md
    ├── HUMAN_GATES.md
    ├── MCP_SETUP.md
    └── EXTENDING.md
```

---

## Switching the model

Two clicks in the menu's "Model" dropdown:
- **Claude Sonnet** — default; better tool use and long-context refactors.
- **OpenAI Codex / GPT** — pick this if your org's data policy requires it.

Both providers go through the same `LlmClient` abstraction in `src/utils/llmClient.ts`. Tool schemas are translated automatically.

---

## Iterative behaviour

Each agent runs up to `modernizer.maxIterations` (default 5) tool-use turns. After the main loop, a **critique pass** asks the agent to find compile errors, missing imports, security issues, and architecture-doc violations in its own output and fix them with `write_file`. You can re-trigger any step from the menu — earlier artifacts persist on disk.

---

## Safety

- All file writes are **sandboxed** to the chosen `writeRoot`. Path traversal is rejected.
- The legacy folder is **read-only** to the agent.
- Secrets (API keys, MCP endpoints) live in VS Code settings, never in generated code.
- Generated CI/CD never bakes secrets into images or values files.

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — internal design of the extension.
- [`docs/HUMAN_GATES.md`](docs/HUMAN_GATES.md) — what to look for at each review.
- [`docs/MCP_SETUP.md`](docs/MCP_SETUP.md) — how to wire up Jira & Bitbucket MCP servers.
- [`docs/EXTENDING.md`](docs/EXTENDING.md) — adding a new agent / skill / target stack.

---

## License
MIT (replace with your org's license before distribution).
