# Human Gate Checklists

These are quick checklists you can run through at each gate. Spending 15–30 minutes here saves days of regenerated code.

## Gate #1 — Legacy Documentation Review
Open the latest `<writeRoot>/_modernizer/LEGACY_DOCUMENTATION-*.md` (or legacy `LEGACY_DOCUMENTATION.md`).

- [ ] **System Overview** describes what the app actually does, not what the agent guessed.
- [ ] **Module Map** lists every project that exists. Anything missing means the inventory step missed source.
- [ ] **API Surface** — spot-check 3 endpoints against the .NET source: same path, same verb, same auth roles.
- [ ] **Data Model** entities and relations match your DB schema (or EF model).
- [ ] **UI Flows** for at least the login + one core CRUD flow are correct.
- [ ] **Business Rules** cite file:line. Click into one — is it real?
- [ ] **Integrations** lists every external service (queues, SOAP, SMTP, third-party APIs).
- [ ] **Open Questions** — answer them before continuing. Add answers to your architecture .md so the next steps see them.

If any item fails: click **Re-generate** and either expand the legacy root, fix the architecture markdown, or raise `modernizer.maxIterations`.

## Gate #2 — Generated Code Review
Open `<writeRoot>/api` and `<writeRoot>/ui`.

### API (Spring Boot)
- [ ] `mvn -q -DskipTests package` succeeds.
- [ ] Each legacy controller has a Java counterpart with matching routes/verbs/auth.
- [ ] DTOs are `record` types; entities use Bean Validation.
- [ ] No `// TODO` in business logic.
- [ ] `application.yml` has placeholders, not secrets.
- [ ] Flyway migrations exist and are idempotent.
- [ ] `GlobalExceptionHandler` returns RFC 7807 `ProblemDetail`.
- [ ] OpenAPI annotations present on every endpoint.

### UI (React or Angular)
- [ ] `npm install && npm run build` succeeds.
- [ ] Routes mirror the legacy URLs you care about.
- [ ] Forms use React Hook Form + Zod (React) / Reactive Forms (Angular).
- [ ] API calls go through a typed client, not inline fetch in components.
- [ ] Auth interceptor attaches JWT and handles 401.
- [ ] Role-based visibility from the legacy app is preserved.
- [ ] No secrets in source.

If any item fails: click **Re-generate API** or **Re-generate UI** with a sharpened goal in your architecture .md.

## Gate #3 — CI/CD Manifest Review
Open `<writeRoot>/deploy`.

- [ ] Dockerfiles are multi-stage with non-root final user.
- [ ] No `latest` tags in prod overlay.
- [ ] Liveness + readiness + startup probes are present and point at real endpoints.
- [ ] Resource requests are non-zero; limits are sensible.
- [ ] HPA min/max replicas suit your cluster's quota.
- [ ] NetworkPolicy denies by default; explicit allow for `openshift-ingress` and UI→API.
- [ ] Secrets are placeholders (SealedSecret/Vault), never plaintext.
- [ ] Tekton pipeline includes build → test → SAST → image scan → deploy.
- [ ] Bitbucket Pipelines yaml runs on PR with lint + unit + container scan.
- [ ] README explains `oc apply -k` / `helm upgrade` and rollback.

If any item fails: click **Re-generate CI/CD** after editing your architecture .md to specify the missing constraint.
