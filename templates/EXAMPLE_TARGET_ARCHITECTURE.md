# Target Architecture & Best Practices — Modernized Stack

Use this file as the single source of truth that the modernizer agent must respect when generating output.

## North Star
Modernize the legacy .NET application into a cloud-native, container-first system deployable to OpenShift, with a clear separation between API (Java Spring Boot) and SPA (TypeScript), backed by PostgreSQL, observable via Prometheus + OpenTelemetry, and deployed via GitOps.

## API service — Java 21 + Spring Boot 3.3
- Build: Maven multi-module (parent + `app/`).
- Layers: controller → service → repository → JPA entity. DTOs are `record` types. Mapping via MapStruct.
- Validation via `jakarta.validation` (`@Valid`, `@NotBlank`, `@Size`, etc.).
- Persistence: Spring Data JPA on PostgreSQL. Migrations via Flyway. **No Hibernate `ddl-auto: update` outside dev.**
- Security: Spring Security + OAuth2 Resource Server (JWT). Method-level `@PreAuthorize`. CSRF disabled for stateless API.
- Errors: `@ControllerAdvice` returning RFC 7807 `ProblemDetail`. Never leak stack traces.
- Logging: SLF4J + Logback JSON encoder. Correlation ID via `MDC` with a servlet filter.
- Observability: `spring-boot-starter-actuator` + Micrometer + OpenTelemetry exporter. Endpoints `/actuator/health`, `/actuator/prometheus`.
- API docs: springdoc-openapi at `/swagger-ui.html`.
- Resilience: Resilience4j circuit breakers on outbound HTTP.
- Testing: JUnit 5 + Mockito + Testcontainers (PostgreSQL). Coverage gate ≥ 80%.

## SPA — React 18 + TypeScript (or Angular 17 if selected)
- Build: Vite. Strict TS. ESLint + Prettier.
- Routing: React Router v6 with code-split routes.
- State: TanStack Query (server state) + Zustand (UI state). No Redux unless complexity demands it.
- Forms: React Hook Form + Zod resolver.
- API client: axios instance with JWT attached and 401 → logout interceptor.
- Styling: Tailwind CSS. Components small and accessible (WCAG 2.1 AA).
- i18n: react-i18next with English baseline.
- Tests: Vitest + Testing Library + MSW.

## Data
- PostgreSQL 15. Each service owns its schema. No cross-service joins.
- Migrations versioned (Flyway).
- PII fields encrypted at the column level via `pgcrypto` where applicable.

## Containers & OpenShift
- Distroless JRE 21 image for API; UBI9 nginx-unprivileged image for SPA.
- Run as `nonroot` UID. Read-only root filesystem with `/tmp` emptyDir.
- Liveness `/actuator/health/liveness`, Readiness `/actuator/health/readiness`, Startup probe with longer timeout for JVM.
- HPA: CPU 70% target, min 2 / max 10 replicas in prod.
- NetworkPolicy: deny-all default; ingress from `openshift-ingress`; UI → API only on port 8080.
- Routes: TLS edge termination, HSTS, redirect HTTP→HTTPS.
- Secrets: SealedSecrets or HashiCorp Vault Agent. **Never** plaintext in git.

## CI/CD
- Bitbucket Pipelines for PR validation (lint, test, SAST, container scan via Trivy).
- Tekton on OpenShift for build → image push → deploy. ArgoCD for GitOps to dev/qa/prod.
- Image tags pinned to digest in prod overlays.

## Coding standards (must follow)
- No `TODO` in committed code.
- No hardcoded secrets, hostnames, or URLs.
- All public methods have Javadoc / TSDoc.
- Cyclomatic complexity ≤ 10 per method.
- Method length ≤ 60 lines, file length ≤ 500 lines.
- Logging: never `e.printStackTrace()` — use `log.error("...", e)`.

## Out of scope for the agent
- Producing real production secrets.
- Performance tuning beyond sensible defaults.
- Choosing between Helm and Kustomize (generate both; team picks).
