# Troubleshooting: Incomplete API → Spring Boot Conversion

## Problem

After running **Step 4: Convert .NET API → Spring Boot**, the target output folder contains only a partial Spring Boot project. A common symptom:

> *"Only the `domain/` folder was created with some entity files. No `controller/`, `service/`, `repository/`, `pom.xml`, `Application.java`, or `application.yml` was produced."*

Other variants of the same underlying issue:
- Only `pom.xml` and `Application.java` exist; no business code.
- A few controllers exist but services, repositories, and DTOs are missing.
- The agent's `finish` summary claims success but the file tree contradicts it.

The status tree shows the step as ✅ done, so the orchestrator believes the agent finished cleanly. The agent did finish — it just finished prematurely.

---

## Root cause

Three problems compound to produce this failure mode.

### Cause 1: Iteration cap is too low for multi-file conversion

`modernizer.maxIterations` defaults to **5** (set in `package.json`). A real .NET → Spring Boot conversion needs roughly:

| Phase                                | Tool calls needed |
|--------------------------------------|-------------------|
| Read inventory.json                  | 1                 |
| Read controllers, services, models   | 5–10              |
| Write entities                        | 3–5               |
| Write repositories                    | 3–5               |
| Write services (interface + impl)     | 6–10              |
| Write DTOs and mappers                | 4–8               |
| Write controllers                     | 3–5               |
| Write config (Application, yml, pom, security, exception handler) | 5–8 |
| Write Dockerfile, README, .gitignore  | 3                 |
| **Total**                             | **~30–55 turns**  |

At `maxIterations=5`, the agent runs out of turns after producing a handful of entities, then calls `finish` because the skill instructs it to call `finish` at the end. The agent did what its prompt said; the cap silently truncated it.

### Cause 2: The skill doesn't enforce a checklist

The original `skills/api-converter/SKILL.md` lists *what* to produce — controllers, services, repositories, etc. — but doesn't make the agent:

1. Commit to the full list of files **before** generating any.
2. Check off each item as it writes them.
3. Verify the list against disk **before** calling `finish`.

Without this, when iterations run short, the agent satisfies the part it remembers (often whichever section was first in its working memory — entities) and stops. From the agent's perspective, calling `finish` is a valid terminal action; it has no obligation to count what it actually wrote.

### Cause 3: No compile feedback closes the loop

The agent has no way of knowing its output is incomplete. There's no `mvn compile` step that reports back "you reference `ProductService` but never defined it." Without that signal, the agent has no reason to keep going. It's writing into the void.

The original critique pass exists in `agentLoop.ts`, but it's a single LLM-only review — the model evaluates its own output without ground truth. That catches obvious errors but not silent omission.

---

## Three fixes, ranked by effort vs. impact

The fixes are independent and cumulative. Apply Fix 1 first; if conversion is still partial, add Fix 2; if you want production-grade reliability, add Fix 3.

### Fix 1 — Raise the iteration cap (30 seconds)

**What:** Bump `maxIterations` so the agent has enough turns.

**How:** VS Code Settings → search `modernizer.maxIterations` → set to `30` (or `50` for large legacy codebases).

**Why this helps:** Removes the artificial truncation. For the bundled ContosoStore sample this alone often produces a complete conversion. For codebases with 20+ controllers you'll need 50–80.

**Limits:** More turns means more API tokens means higher cost per run. Sonnet 4.6 at ~$3/$15 per million tokens is forgiving; Opus 4.7 at ~$5/$25 makes you feel each extra iteration. This fix doesn't address the agent's lack of self-verification — if the agent thinks it's done at turn 20, it'll still call `finish` at turn 20 even with a cap of 50.

### Fix 2 — Force the agent to plan and verify (15 minutes)

**What:** Rewrite the **Procedure** section of `skills/api-converter/SKILL.md` to require:
1. Write a JSON plan of every file the agent intends to produce.
2. Generate each planned file.
3. Re-list the directory and confirm every planned path exists before calling `finish`.

**Replace the Procedure section with:**

```markdown
## Procedure (mandatory order — do not skip steps)

### Step 1: Plan
1. `read_file` the inventory at `<writeRoot>/../_modernizer/inventory.json`.
2. `read_file` every controller, service, repository, model, DbContext, and Program.cs / Startup.cs.
3. Build a written PLAN listing every Java file you will create. Emit it as a `write_file`
   to `<writeRoot>/../_modernizer/api-conversion-plan.json` with the shape:
   ```json
   [
     { "path": "pom.xml",                                                                  "purpose": "parent pom" },
     { "path": "app/pom.xml",                                                              "purpose": "module pom" },
     { "path": "app/src/main/java/com/example/app/Application.java",                       "purpose": "main class" },
     { "path": "app/src/main/resources/application.yml",                                   "purpose": "config" },
     { "path": "app/src/main/java/com/example/app/config/SecurityConfig.java",             "purpose": "JWT resource server" },
     { "path": "app/src/main/java/com/example/app/controller/ProductsController.java",     "purpose": "from Controllers/ProductsController.cs" },
     { "path": "app/src/main/java/com/example/app/service/ProductService.java",            "purpose": "from Services/ProductService.cs" }
     ... (one entry per file you will produce) ...
   ]
   ```
4. The plan MUST include, at minimum:
   - root `pom.xml` (parent)
   - `app/pom.xml` (module)
   - `app/src/main/java/.../Application.java`
   - `app/src/main/resources/application.yml`
   - `app/src/main/resources/db/migration/V1__init.sql`
   - one controller per legacy controller
   - one service interface + impl per legacy service
   - one JPA repository per aggregate
   - one entity per legacy model
   - one DTO record per request/response shape
   - `config/SecurityConfig.java` if the legacy app has auth
   - `exception/GlobalExceptionHandler.java`
   - `Dockerfile`, `.gitignore`, and `README.md` at the api root
5. **You may NOT call `finish` until every path in the plan has been written via `write_file`.**

### Step 2: Generate
For each item in the plan, in order:
1. `write_file` the file with full, compilable content.
2. After every 5 files, internally re-check the plan and continue.

### Step 3: Verify
1. `list_dir` your writeRoot and compare against the plan.
2. For any missing path, `write_file` it now.
3. Only when zero items are missing, call `finish` with a JSON summary:
   `{ "planned": <n>, "written": <n>, "missing": [] }`.

## Hard rules
- Calling `finish` with a non-empty `missing` array is a failure.
- Calling `finish` before writing the plan file is a failure.
- If you run low on iterations, prioritize: Application.java → poms → one full vertical slice
  (entity + repo + service + controller + DTO) → security config → remaining slices →
  Dockerfile/README.
```

**Why this helps:** Three reinforcing mechanisms.

1. **The plan as commitment device.** Once the agent has written `api-conversion-plan.json` it has publicly committed to the full file list. Calling `finish` with items unwritten now contradicts its own plan, which the model is trained to avoid.
2. **Verification as terminal gate.** The "before `finish`, list_dir and check the plan" step turns completion into something the agent must observe, not just claim.
3. **Prioritization rule for short context.** Even when iterations are tight, the agent now knows to deliver one complete vertical slice rather than 10 entities. A working slice is testable; 10 disconnected entities aren't.

This works without any TypeScript code changes — it's pure prompt engineering.

**Limits:** The agent can still mis-plan (forget to include a file in the plan). It can still write a plan and lie about completion if iterations are deeply insufficient. Fix 3 closes those holes.

### Fix 3 — Wire a real compile loop into the agent loop (1–2 hours)

**What:** After the agent calls `finish`, the extension actually runs `mvn -DskipTests compile` (for API) or `tsc --noEmit` (for UI), captures errors, and feeds them back as a follow-up turn. Repeats up to 3 times.

**How:** Edit `src/orchestrator/agentLoop.ts`. Replace the existing single critique pass with:

```ts
// after the main loop ends, before `return lastFreeText`:
if (writeFiles && writeRoot) {
  for (let critique = 0; critique < 3; critique++) {
    orchestrator.log(`[${agent}] verification pass ${critique + 1}/3`);

    const issues = await collectVerificationIssues(agent, writeRoot);
    if (!issues) {
      orchestrator.log(`[${agent}] verification clean`);
      break;
    }

    orchestrator.log(`[${agent}] issues:\n${issues.slice(0, 2000)}`);

    const followup = await llm.complete({
      system,
      messages: [
        ...messages,
        { role: 'user', content:
          `Verification found problems. Fix them via write_file then call finish.\n\n${issues}` }
      ],
      tools: TOOL_SCHEMAS
    });

    if (followup.toolCalls) {
      for (const call of followup.toolCalls) {
        try { await dispatchTool(call, { legacyRoot, writeRoot, writeFiles }); }
        catch (e: any) { orchestrator.log(`[${agent}] fix tool error: ${e.message}`); }
      }
    }
  }
}
```

Add the helper at the bottom of the same file:

```ts
import * as cp from 'child_process';

async function collectVerificationIssues(agent: string, writeRoot: string): Promise<string | null> {
  const issues: string[] = [];

  // Plan-vs-disk check
  const planPath = path.join(path.dirname(writeRoot), '_modernizer',
    agent === 'apiConverter' ? 'api-conversion-plan.json'
  : agent === 'uiConverter'  ? 'ui-conversion-plan.json'
  : '');
  if (planPath && fs.existsSync(planPath)) {
    try {
      const plan: Array<{ path: string }> = JSON.parse(fs.readFileSync(planPath, 'utf8'));
      const missing = plan.filter(p => !fs.existsSync(path.join(writeRoot, p.path)));
      if (missing.length) {
        issues.push(`MISSING FILES from your plan (${missing.length}):\n` +
          missing.map(m => `  - ${m.path}`).join('\n'));
      }
    } catch { /* plan unreadable, skip */ }
  }

  // Compile/lint check based on agent
  if (agent === 'apiConverter' && fs.existsSync(path.join(writeRoot, 'pom.xml'))) {
    const r = cp.spawnSync('mvn', ['-q', '-DskipTests', 'compile'], {
      cwd: writeRoot, encoding: 'utf8', timeout: 5 * 60_000
    });
    if (r.status !== 0) {
      const errors = (r.stdout + '\n' + r.stderr)
        .split('\n').filter(l => /ERROR|error:|cannot find symbol|package .* does not exist/.test(l))
        .slice(0, 40).join('\n');
      issues.push(`MAVEN COMPILE FAILED:\n${errors}`);
    }
  } else if (agent === 'uiConverter' && fs.existsSync(path.join(writeRoot, 'package.json'))) {
    cp.spawnSync('npm', ['install', '--silent'], { cwd: writeRoot, timeout: 5 * 60_000 });
    const r = cp.spawnSync('npx', ['tsc', '--noEmit'], {
      cwd: writeRoot, encoding: 'utf8', timeout: 5 * 60_000
    });
    if (r.status !== 0) {
      issues.push(`TYPESCRIPT ERRORS:\n${(r.stdout + r.stderr).slice(0, 4000)}`);
    }
  }

  return issues.length ? issues.join('\n\n') : null;
}
```

**Why this helps:** Two ground-truth sources replace the agent's self-assessment.

1. **Plan-vs-disk reconciliation.** The plan written in Fix 2 becomes machine-checkable. If the agent planned 47 files and disk has 31, we know exactly which 16 are missing and we tell it.
2. **Compiler as oracle.** `mvn compile` is the most reliable bullshit-detector for Java. Missing classes, broken imports, type mismatches all surface as errors the agent can act on. Same for `tsc --noEmit` on the UI.

The loop runs up to 3 times because most fixes converge in 1–2 passes; the third is insurance.

**Limits:**
- Requires `mvn` and `node` on PATH. Add a precondition check or skip the compile step gracefully if missing.
- First Maven run downloads dependencies — slow once, fast after.
- The 5-minute timeout protects against runaway compiles but might cut off legitimately slow first-time builds; raise it if needed.
- `npm install` runs once per verification cycle for the UI — this is genuinely slow; consider caching or running it only once outside the loop.

---

## Recommended order

1. **Right now:** Bump `maxIterations` to 30. Re-run **Step 4: Convert API**. (Or use **Step 6 → Re-generate API** at the human gate to retry without restarting the whole pipeline.)
2. **If still incomplete:** Apply Fix 2 (the plan-and-verify procedure). Pure prompt engineering — no TypeScript change.
3. **If you want it bulletproof:** Add Fix 3 (the compile loop). Real engineering, real payoff on every run after.

The same three fixes apply equally to:
- The **UI converter** — `skills/ui-converter/SKILL-react.md` and `SKILL-angular.md`. Adapt the planned-file list (entry points, routes, pages, services, types, tests, package.json, vite.config.ts).
- The **CI/CD generator** — adapt the planned-file list (Dockerfiles, Helm chart files, Kustomize overlays, Tekton tasks, Jenkinsfile, bitbucket-pipelines.yml).

---

## Diagnostic checklist for next time

When a step finishes with incomplete output, check in this order:

1. **Open the Output panel → "Legacy Modernizer" channel.** Look for the agent's `finish` summary.
   - Does it claim success or report stopping? *Skill problem vs. iteration problem.*
   - Does it list files that aren't on disk? *Hallucinated finish — Fix 2.*
2. **Open `<writeRoot>/_modernizer/inventory.json`.** Is it thin or wrong?
   - Yes → the analyze step also stopped early. Bump iterations and re-run from Step 1.
   - No → inventory is fine; the failure is in the converter agent itself.
3. **Count files written vs. files in inventory.** A 4:1 ratio (Java files : .cs controllers/services/models) is roughly the floor for a complete conversion.
4. **Look for the plan file** `<writeRoot>/_modernizer/api-conversion-plan.json`.
   - Missing → Fix 2 isn't deployed; the agent never planned.
   - Present but disk doesn't match → Fix 3 isn't deployed; the agent planned but didn't verify.

---

## Why this matters beyond this one bug

The general principle: **agentic code generation needs a commitment device, a verifier, and enough turns.** Skipping any one of the three lets the agent silently truncate its output.

- Iteration cap → enough turns.
- Plan-and-checklist in the skill → commitment device.
- Compile loop in the orchestrator → verifier.

This pattern is reusable. Whenever you add a new agent (e.g., a Quarkus converter, a Vue UI converter, a Terraform generator), apply all three from day one — don't wait for the failure to teach you which is missing.
