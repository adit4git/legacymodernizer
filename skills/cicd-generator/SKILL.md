# OpenShift CI/CD Manifest Generator Skill

You generate everything needed to build, test, and deploy the modernized API + SPA on **OpenShift Container Platform**.

## Output layout (under writeRoot/deploy)
```
deploy/
├── docker/
│   ├── Dockerfile.api               (multi-stage: maven build -> distroless JRE 21)
│   └── Dockerfile.ui                (multi-stage: node build -> nginx unprivileged)
├── helm/
│   └── modernized-app/
│       ├── Chart.yaml
│       ├── values.yaml
│       ├── values-dev.yaml
│       ├── values-qa.yaml
│       ├── values-prod.yaml
│       └── templates/
│           ├── api-deployment.yaml
│           ├── api-service.yaml
│           ├── api-route.yaml
│           ├── ui-deployment.yaml
│           ├── ui-service.yaml
│           ├── ui-route.yaml
│           ├── configmap.yaml
│           ├── secret.yaml          (placeholders only — real secrets via Sealed Secrets / Vault)
│           ├── hpa.yaml
│           ├── networkpolicy.yaml
│           └── servicemonitor.yaml
├── kustomize/                       (alternative to Helm)
│   ├── base/
│   └── overlays/{dev,qa,prod}/
├── tekton/
│   ├── pipeline.yaml                (clone -> build -> test -> sast -> image -> deploy)
│   ├── tasks/{maven-build.yaml, npm-build.yaml, buildah.yaml, oc-deploy.yaml}
│   └── triggers/{event-listener.yaml, trigger-template.yaml, trigger-binding.yaml}
├── jenkins/
│   └── Jenkinsfile                  (declarative; same pipeline as Tekton fallback)
├── bitbucket-pipelines.yml          (per-PR build, integration tests, image push)
└── README.md
```

## Procedure
1. Inspect what was generated (api + ui).
2. Write Dockerfiles:
   - **api**: stage 1 `maven:3.9-eclipse-temurin-21` builds the jar; stage 2 `gcr.io/distroless/java21-debian12:nonroot` runs as `nonroot`.
   - **ui**: stage 1 `node:20-alpine` builds; stage 2 `registry.access.redhat.com/ubi9/nginx-124` (rootless, OpenShift-friendly) serves `dist/`.
3. Generate the Helm chart with sensible defaults:
   - resources requests/limits, readiness/liveness probes (`/actuator/health/readiness` and `/actuator/health/liveness`).
   - HPA on CPU 70%.
   - NetworkPolicy: only allow ingress from `openshift-ingress` and from the UI to the API.
   - ServiceMonitor for Prometheus on `/actuator/prometheus`.
   - Routes with TLS edge termination + HSTS.
4. Generate Kustomize overlays mirroring the Helm values (some teams prefer either tool).
5. Generate Tekton pipeline + tasks (preferred on OpenShift Pipelines).
6. Generate Jenkinsfile fallback.
7. Generate `bitbucket-pipelines.yml` (because the org uses Bitbucket):
   - `default`: `mvn verify` + `npm ci && npm run build && npm test`.
   - `pull-requests`: SAST via SonarCloud + Trivy.
   - `branches.main`: build + push image to OpenShift internal registry.
8. README documents `oc apply -k`, `helm upgrade --install`, and rollback.

## Quality bar
- Containers run as non-root; no `privileged: true`; no `hostNetwork`.
- Read-only root filesystem where possible; writable volume mounted at `/tmp`.
- Image tags pinned to digests in prod overlay.
- Probes have correct timeouts; startup probe for slow JVM warmup.
- Resource requests > 0 to satisfy OpenShift quota.
- ConfigMap/Secret naming consistent across api + ui.
- Routes use `tls.termination: edge` and `insecureEdgeTerminationPolicy: Redirect`.

## Hard rules
- Never bake secrets into images or values files. Use placeholder `${VAR}` and reference SealedSecret/Vault.
- Never use `latest` image tags in prod overlays.
- Never expose `/actuator` publicly — restrict via NetworkPolicy and Spring Security.
