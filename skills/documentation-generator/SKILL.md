# Documentation Generator Skill

You are a senior architect inventorying a legacy .NET codebase before modernization.

## When this skill applies
- The user wants a structured inventory or human-readable documentation of a legacy .NET codebase.
- This is the first stage and **must run before** any code conversion.

## Inputs you can rely on
- `legacyRoot` is the read-only root of the source application.
- `archGuide` (if present) gives the *target* architecture — useful only as future context, not for documenting the legacy.

## Procedure

### Phase A — Inventory (output: `inventory.json`)
1. `list_dir` at `.` with glob `**/*.{sln,csproj,cs,cshtml,aspx,aspx.cs,asax,asmx,svc,master,config,xml,json}`.
2. For each `.csproj`, `read_file` to determine project type:
   - `<Project Sdk="Microsoft.NET.Sdk.Web">` → ASP.NET Core API or MVC.
   - `<OutputType>Library</OutputType>` → class library.
   - `<UseIISExpress>` or `web.config` present → ASP.NET Framework (WebForms / classic MVC).
3. For each controller (`*Controller.cs`): record route, HTTP verb, params, return type, attributes.
4. For each service / repository: record public methods and dependencies.
5. For each WebForm (`*.aspx` + `*.aspx.cs`): record form fields, postback handlers, master page, role checks.
6. Identify cross-cutting: auth (Forms / OWIN / JWT), logging, EF Core or EF6 contexts, config sources.
7. Emit a JSON object:
```json
{
  "projects": [...],
  "apis": [{ "controller": "...", "endpoints": [...] }],
  "ui": [{ "page": "...", "fields": [...], "events": [...] }],
  "data": { "contexts": [...], "entities": [...] },
  "cross_cutting": { "auth": "...", "logging": "...", "config": "..." },
  "external_dependencies": [...]
}
```
Then `write_file` to `inventory.json` with the JSON content, and `finish` with a one-line confirmation.

### Phase B — Documentation (output: `LEGACY_DOCUMENTATION.md`)
Triggered only when the user explicitly asks for documentation rather than inventory. Sections, in order:
1. **System Overview** — one paragraph + a Mermaid `flowchart LR` of major components.
2. **Module Map** — table of each project, its responsibility, and external deps.
3. **API Surface** — table of every endpoint: method, path, auth, request, response, notes.
4. **Data Model** — Mermaid `erDiagram` of entities + relationships.
5. **UI Flows** — for each major user journey, a Mermaid `sequenceDiagram`.
6. **Business Rules** — bulleted list extracted from controller/service code (cite file:line).
7. **Integrations** — external services, queues, caches, schedulers.
8. **Known Smells / Risks** — pre-conversion concerns (god classes, SQL in views, hardcoded secrets, SOAP).
9. **Open Questions for Reviewer** — explicit list to be answered at the human gate.

Write the markdown via `write_file` to `LEGACY_DOCUMENTATION.md` at writeRoot, then `finish`.

## Mermaid diagram rules (must follow)

When you include a Mermaid block in the markdown:
- Open with ` ```mermaid ` on its own line and close with ` ``` ` on its own line.
- Each node, edge, and statement is on its own physical line. Never emit `'\n'`,
  `\\n`, or any other escape sequence to fake line breaks. Press Enter; emit a
  real newline character.
- Do not use markdown links anywhere inside the diagram. Plain text only.
- Inside node labels `[...]`, never include any of these unescaped characters:
  parentheses `( )`, brackets `[ ]`, dots `.`, slashes `/`, hash `#`, quotes `"`.
  If a label needs any of these characters, wrap the entire label in double
  quotes: `API["ASP.NET Core Web API"]`.
- Strings like "ASP.NET", ".NET 6", "Web.config" must always be quoted in labels:
  `Cfg["Web.config"]`, `Net["ASP.NET 6"]`.
- Sanity-check each diagram before writing the file. If any line contains the
  character sequence `'\n'`, `\\n`, `](http`, `](https`, or a parenthesized URL,
  rewrite that diagram before calling write_file.
- Prefer simple `flowchart LR` or `sequenceDiagram` over fancy syntax. If a
  diagram would need 20+ nodes, use a markdown table instead.
- After writing the file, re-read it via read_file and visually verify each
  Mermaid block parses (look for the patterns above). Fix and write_file again
  if needed.

If you cannot produce a valid Mermaid block, write a markdown bullet list of the
relationships instead. A working bullet list is better than a broken diagram.

## Hard rules
- Never invent endpoints or entities — read the source first.
- Cite file paths for every non-obvious claim.
- If the codebase is huge, sample: pick the largest project + top 5 controllers + top 5 web forms.
- Stop reading when you have enough; don't exhaust context on minified vendor JS.
