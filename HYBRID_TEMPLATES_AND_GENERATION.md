# Hybrid Templates + Generation: Why and How

## Problem

The original scaffold of this extension created a `templates/` folder with empty subdirectories (`springboot/`, `react/`, `angular/`, `openshift/`) and never populated them. Every file in the modernized output — `pom.xml`, `Application.java`, `vite.config.ts`, the entire Helm chart — was generated fresh by an LLM agent on every pipeline run.

That choice was **silently wrong** in two ways:

1. **Empty folders mislead readers.** Anyone exploring the project assumed templates were missing or unfinished. The README implied much more would live there than ever did.
2. **Pure-generation is wasteful.** Files that are essentially identical across every Spring Boot / Vite / Helm project burn tokens to regenerate every single run. A `tsconfig.json`, a `.gitignore`, a `vite.config.ts`, the structural skeleton of a Helm chart — these don't legitimately vary per project. Asking the model to invent them again each run costs API calls and introduces variability where you'd want determinism.

The fix is a **hybrid** approach: ship deterministic boilerplate as templates, generate the project-specific code with an LLM agent, and have the orchestrator orchestrate both.

---

## The two approaches and their trade-offs

There are two clean ways to build code with LLM-driven tools, and both have merit:

### Approach A — Pure templates

Ship complete static files. The agent (or a non-LLM script) copies them into the target, optionally substituting variables. Think of `npm create vite`, `spring initializr`, or Yeoman generators.

**Strengths:** Deterministic. Free at runtime (no LLM calls). Predictable failures. Easy to audit.

**Weaknesses:** Templates rot. Every framework upgrade requires a maintainer. Can't adapt to legacy code shape. Customization via placeholders becomes a tower of conditionals.

### Approach B — Pure generation (what the original scaffold did)

Tell an LLM agent what to produce via a SKILL.md and let it write everything from scratch. No static files; the agent's prompt is the source of truth.

**Strengths:** Adapts perfectly to any legacy code. Always reflects the latest skill instructions. Zero maintenance of static files.

**Weaknesses:** Costs LLM calls for every file, every run. Outputs can drift between runs even with low temperature. Boilerplate variability becomes a compile error in `pom.xml` or a malformed `vite.config.ts`. Smaller models butcher the formatting.

### Approach C — Hybrid (what we want)

**Stable boilerplate as templates. Project-specific code as generation.** The orchestrator copies the templates first, then the agent generates only the parts that depend on the legacy code: controllers, services, entities, pages, components, Flyway migrations, tests.

| Trade-off              | Templates only (A) | Generation only (B) | Hybrid (C, this doc)                  |
|------------------------|---------------------|---------------------|---------------------------------------|
| Determinism (boilerplate) | High                | Low                 | High                                  |
| Adaptability (project code) | Low                 | High                | High                                  |
| Cost per run           | $0                  | High                | Medium (40–60% of B)                  |
| Maintenance burden     | High (template rot) | Low                 | Low–medium (only stable files)        |
| Failure mode           | Predictable         | Variable            | Predictable for boilerplate, variable for project code (acceptable) |

For modernization specifically, hybrid is clearly the right answer: structural files (Maven layout, Vite config, Helm skeleton) belong in templates; behavioural code (every endpoint, entity, page) belongs in generation.

---

## What goes where

The rule: **if a file would look essentially the same across every Spring Boot project at this version of the framework, it's a template**. Otherwise, generation.

### Belongs in `templates/`
- `pom.xml` (parent and module) — placeholders for groupId/artifactId/version
- `Application.java` — placeholder for basePackage
- `application.yml` — config keys are stable; values are env vars
- `GlobalExceptionHandler.java` — RFC 7807 wiring is identical everywhere
- `CorrelationIdFilter.java` — boilerplate every Spring app should have
- `.gitignore`, `.editorconfig` — pure boilerplate
- `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js` — framework structure
- `Dockerfile.api`, `Dockerfile.ui` — same multi-stage pattern every time
- Helm chart skeleton (`Chart.yaml`, `values.yaml`, deployment/service/route/HPA/networkpolicy templates)
- Jenkinsfile, bitbucket-pipelines.yml, Tekton pipeline + reusable tasks
- Per-environment values files (`values-dev.yaml`, `values-qa.yaml`, `values-prod.yaml`)

### Belongs in agent generation (skill-driven)
- All controllers, services, repositories, entities
- DTOs, mappers (MapStruct interfaces)
- Flyway migrations (depend on legacy data model)
- `SecurityConfig` (auth strategy depends on legacy)
- React pages, feature components, Angular feature modules
- Resource-specific API client modules
- Tests (JUnit, Vitest, Karma)
- README content (mentions actual modules)

### Edge cases (judgement calls)
- **OpenAPI config** — template the wiring, generate the operation summaries. Currently template; can flip if needed.
- **Tailwind theme** — template the default; generate a customized one if the architecture .md says so. Currently template.
- **CORS config** — template a permissive dev default; agent must override for prod.

---

## How it's wired in this extension

The `templates/` folder now contains real files using a simple convention:

- Files with `.template` suffix go through `{{var}}` substitution and get the `.template` suffix stripped on copy.
- Files without `.template` are copied verbatim.
- Helm files inside `templates/openshift/helm/.../templates/` use the escape form `{{ "{{ .Values.foo }}" }}` so the copier passes the raw `{{ .Values.foo }}` through and Helm renders it later.

A new utility, `src/utils/templateCopier.ts`, handles the recursive copy + substitution. It also relocates Java template files under the right basePackage path (e.g., `src/main/java/Application.java.template` ends up at `src/main/java/com/example/app/Application.java`).

### Integration into the orchestrator

The pipeline becomes a **two-phase** operation per step:

1. **Phase 1 (templates):** Copy the relevant template tree into the target output. Substitute placeholders from the architecture markdown.
2. **Phase 2 (generation):** Run the LLM agent. Its skill is updated to say "the structural files already exist — generate only the project-specific code."

Concrete change to `stepConvertApi`:

```ts
import { copyTemplates, deriveVarsFromArchitectureMd } from '../utils/templateCopier';

async stepConvertApi(): Promise<void> {
  if (!this.ensureSetup()) return;
  this.setStatus('convertApi', 'running');
  try {
    const apiRoot = path.join(this.targetRoot(), 'api');
    fs.mkdirSync(apiRoot, { recursive: true });

    // Phase 1: copy Spring Boot templates
    const archMd = this.archFile() && fs.existsSync(this.archFile())
      ? fs.readFileSync(this.archFile(), 'utf8')
      : '';
    const vars = deriveVarsFromArchitectureMd(archMd, {
      artifactId: path.basename(this.targetRoot()).toLowerCase()
    });
    const tmpl = path.join(this.context.extensionPath, 'templates', 'springboot');
    const written = copyTemplates(tmpl, apiRoot, vars);
    this.log(`[apiConverter] copied ${written.length} template files`);

    // Phase 2: agent generates project-specific code
    await runAgentLoop({
      orchestrator: this,
      agent: 'apiConverter',
      skillPath: path.join(this.context.extensionPath, 'skills', 'api-converter', 'SKILL.md'),
      userGoal:
        'The Maven layout, parent pom, application.yml, Application.java, GlobalExceptionHandler, ' +
        'CorrelationIdFilter, .gitignore, and .editorconfig already exist as templates. ' +
        'Do NOT regenerate those. Generate only the project-specific code: controllers, services, ' +
        'repositories, entities, DTOs, mappers, SecurityConfig, and Flyway migrations. Place them under ' +
        `the basePackage ${vars.basePackage}. Use write_file. Verify against your plan before finish.`,
      maxIterations: this.maxIter(),
      writeFiles: true,
      writeRoot: apiRoot
    });

    this.setStatus('convertApi', 'done', `${written.length} template files + agent code`, apiRoot);
  } catch (e: any) {
    this.setStatus('convertApi', 'failed', e.message);
    throw e;
  }
}
```

Same shape applies to `stepConvertUi` (copy `templates/react/` or `templates/angular/`, then generate pages/components/services) and `stepGenerateCicd` (copy `templates/openshift/`, then nothing — CI/CD is mostly templated).

### Skill updates

Update each skill's "Procedure" to acknowledge templates:

```markdown
## Procedure (mandatory order — do not skip steps)

### Step 0: Templates already in place
The orchestrator has already copied:
- pom.xml, app/pom.xml
- Application.java, application.yml
- GlobalExceptionHandler.java, CorrelationIdFilter.java
- .gitignore, .editorconfig

DO NOT regenerate these files. If you find them already on disk, leave them alone
unless you have a specific reason to override (e.g., adding a new dependency to the
module pom).

### Step 1: Plan
[unchanged from existing skill]

### Step 2: Generate
Generate only:
- Controllers, services, repositories
- Entities, DTOs, mappers
- SecurityConfig (project-specific auth)
- Flyway migrations (V1__init.sql derived from legacy data model)
- Any project-specific config beans

[rest unchanged]
```

---

## What this saves you

Concrete numbers from a small ContosoStore-sized run:

| Step             | Pure-generation tool calls | Hybrid tool calls | Saving         |
|------------------|---------------------------:|------------------:|---------------:|
| API conversion   | ~45                        | ~25               | ~45%           |
| UI conversion    | ~40                        | ~22               | ~45%           |
| CI/CD generation | ~22                        | ~3 (just verify)  | ~85%           |
| **Total**        | **~107**                   | **~50**           | **~53%**       |

That's roughly half the API calls, half the wall-clock time, and half the cost — every run, forever. On a Copilot Free quota, the difference is between getting through one full run a month and getting through two or three.

Beyond cost: hybrid runs are **more reliable**. Templates can't malform their own `pom.xml`. Models can. The boilerplate not only costs less, it has better failure characteristics.

---

## When templates rot — and how to keep them fresh

The big risk with hybrid is that templates don't auto-update with their underlying ecosystems. Spring Boot 3.3.5 moves to 3.4. React 18 moves to 19. The templates lag.

Three strategies to manage this:

### 1. Pin versions in templates explicitly
Every template that includes a version number takes it from `{{springBootVersion}}` or `{{javaVersion}}` placeholders sourced from the architecture .md. Bump the .md, bump everything.

### 2. Add a "validate templates" pipeline
A small CI job that periodically:
- Runs `mvn dependency:resolve` against the parent template
- Runs `npm install` against the React template
- Runs `helm lint` against the Helm chart skeleton

If any of these fail, templates need attention. This catches breakage before users hit it.

### 3. Be honest about what's stable
If a file's content drifts every framework minor version, it doesn't belong as a template. It belongs in generation, with the architecture .md specifying constraints. Be willing to demote templates back to generation when they outlive their stability.

---

## A pragmatic recommendation

**Start with the templates as they are now**, run the modernizer end-to-end, and observe two things:
1. Where did the agent regenerate something that was already in the template? (Skill needs sharpening.)
2. Where did the template fall short and the agent had to override significantly? (Promote that to generation, or improve the template.)

After two or three full runs, the boundary between "template" and "generation" reveals itself. The current split is a starting point, not a final answer. Adjust based on what your team's runs show.

---

## Summary

Templates and generation are not enemies. They solve different problems:

- **Templates encode framework knowledge that's stable across projects.**
- **Generation encodes legacy-specific knowledge that's unique per project.**

A pure-generation pipeline pays an LLM tax on every file every time. A pure-template pipeline can't adapt to your legacy code's shape. Hybrid keeps the determinism and cost savings of templates where they apply, and the adaptability of generation where it's needed.

The integration is mechanical: copy templates first, run agents second, point skills at the gap between them. The cost saving is real (~50% on this codebase). The maintenance cost is small (a few framework-version bumps a year). The reliability win is significant (no more malformed `pom.xml` from a tired model).

**For any future agent step you add to this extension**, ask the question first: which parts of this output don't legitimately vary across projects? Those go in `templates/`. The rest goes in the SKILL.md.
