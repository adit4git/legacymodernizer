# Templates

Static, deterministic boilerplate that the orchestrator copies into the target output before the LLM agents fill in the project-specific code. This is the **template half** of the hybrid template + generation approach (see `docs/HYBRID_TEMPLATES_AND_GENERATION.md`).

## What's in here

```
templates/
├── EXAMPLE_TARGET_ARCHITECTURE.md      Sample target architecture .md (user-selectable in the menu)
│
├── springboot/                         Spring Boot 3.x scaffolding
│   ├── .gitignore                       Verbatim copy
│   ├── .editorconfig                    Verbatim copy
│   ├── pom.xml.template                 Parent pom — has {{groupId}}, {{artifactId}} placeholders
│   └── app/
│       ├── pom.xml.template             Module pom — placeholders for groupId/artifactId/version
│       └── src/main/
│           ├── java/
│           │   ├── Application.java.template            {{basePackage}}
│           │   ├── config/CorrelationIdFilter.java.template
│           │   └── exception/GlobalExceptionHandler.java.template
│           └── resources/
│               └── application.yml.template
│
├── react/                              React 18 + TS + Vite scaffolding
│   ├── .gitignore                       Verbatim copy
│   ├── .env.example                     Verbatim copy
│   ├── package.json.template
│   ├── tsconfig.json                    Verbatim copy
│   ├── tsconfig.node.json               Verbatim copy
│   ├── vite.config.ts                   Verbatim copy
│   ├── index.html.template              {{appTitle}}
│   ├── tailwind.config.js               Verbatim copy
│   ├── postcss.config.js                Verbatim copy
│   └── src/api-client.ts.template       Verbatim copy (no placeholders)
│
├── angular/                            Angular 18 standalone scaffolding
│   ├── .gitignore                       Verbatim copy
│   ├── tsconfig.json                    Verbatim copy
│   └── package.json.template
│
└── openshift/                          OpenShift CI/CD scaffolding
    ├── docker/
    │   ├── Dockerfile.api.template
    │   └── Dockerfile.ui.template
    ├── helm/modernized-app/
    │   ├── Chart.yaml.template
    │   ├── values.yaml.template
    │   ├── values-dev.yaml.template
    │   ├── values-qa.yaml.template
    │   ├── values-prod.yaml.template
    │   └── templates/                  Helm templates use double-curly via {{ "{{ ... }}" }} escape
    │       ├── api-deployment.yaml
    │       ├── api-service.yaml
    │       ├── api-route.yaml
    │       ├── api-hpa.yaml
    │       └── networkpolicy.yaml
    ├── tekton/
    │   ├── pipeline.yaml.template
    │   └── tasks/
    │       ├── maven-build.yaml.template
    │       ├── npm-build.yaml.template
    │       └── oc-deploy.yaml.template
    ├── Jenkinsfile.template
    └── bitbucket-pipelines.yml.template
```

## What's intentionally NOT in here

These belong to the LLM agent because they vary per legacy codebase:

- Domain entities, DTOs, mappers
- Controllers, services, repositories
- React pages and feature components
- Angular feature components and routing modules
- Flyway migrations (derived from the legacy data model)
- Security config (auth strategy depends on what the legacy used)
- Tests (depend on what was generated)

## Placeholder convention

- Templates ending in `.template` go through string substitution. `{{var}}` patterns are replaced; the `.template` suffix is stripped from the output filename.
- Templates without `.template` are copied verbatim (typical for `tsconfig.json`, `.gitignore`, `vite.config.ts`).

Available variables (see `src/utils/templateCopier.ts` and the target architecture .md):

| Variable                | Source                                                     | Example                          |
|-------------------------|------------------------------------------------------------|----------------------------------|
| `{{groupId}}`           | Architecture .md → `groupId:` field, or `com.example`      | `com.contoso`                    |
| `{{artifactId}}`        | Architecture .md → `artifactId:`, or derived from project  | `contoso-store`                  |
| `{{version}}`           | Architecture .md → `version:`, or `1.0.0-SNAPSHOT`         | `1.0.0`                          |
| `{{javaVersion}}`       | Architecture .md → `javaVersion:`, or `21`                 | `21`                             |
| `{{springBootVersion}}` | Architecture .md → `springBootVersion:`, or `3.3.5`        | `3.3.5`                          |
| `{{basePackage}}`       | Derived from `{{groupId}}.{{artifactId}}` lower-snake      | `com.contoso.contosostore`       |
| `{{appTitle}}`          | Architecture .md → `appTitle:`, or `{{artifactId}}`        | `Contoso Store`                  |
| `{{maintainer}}`        | Architecture .md → `maintainer:`, or `Modernization Team`  | `Platform Team`                  |

## Helm template escaping note

Helm itself uses `{{ ... }}` for its templating, which clashes with our placeholder syntax. Helm files in `templates/openshift/helm/.../templates/` use the escape form `{{ "{{ .Values.foo }}" }}` so our copier passes the raw `{{ .Values.foo }}` through untouched and Helm renders it at chart-install time.

## Adding a new template

1. Create the file under the right subfolder.
2. Decide whether it varies per project. If yes, add `.template` and use `{{var}}` placeholders. If no, copy verbatim.
3. If you need a new variable, add it to `src/utils/templateCopier.ts` and document it in the table above.
4. Update the orchestrator step that should consume it — typically `stepConvertApi`, `stepConvertUi`, or `stepGenerateCicd`.

## When a template stops being a template

If you find yourself adding so many placeholders that the file is mostly variables, that file should probably move from template into generation. Templates are for **stable boilerplate**; if it's not stable, the agent should produce it freshly each run based on the architecture .md.

## Extending the system
- [Adding a new agent / skill / target stack](docs/EXTENDING.md)
- [From SKILL.md to agent classes — when and how](docs/EXTENDING_AGENT_CAPABILITY.md)

## Troubleshooting
- [Incomplete API → Spring Boot conversion](docs/troubleshooting/TROUBLESHOOTING_INCOMPLETE_CONVERSION.md)
- [Agent output channels & artifact write semantics](docs/troubleshooting/TROUBLESHOOTING_AGENT_OUTPUT_CHANNELS.md)
- [Quota exhaustion & cost control](docs/troubleshooting/TROUBLESHOOTING_QUOTA_AND_COST.md)
- [Throttling without lobotomizing the agent](docs/troubleshooting.TROUBLESHOOTING_THROTTLING.md)
