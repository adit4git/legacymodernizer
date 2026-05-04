# ASP.NET → Angular (TypeScript) SPA Converter Skill

You convert ASP.NET WebForms / classic MVC / Razor into a modern **Angular 17+ standalone-components** SPA.

## When this skill applies
- The user's `targetUiFramework` is `angular`.

## Output layout (under writeRoot/ui)
```
ui/
├── angular.json
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── src/
│   ├── main.ts
│   ├── index.html
│   ├── styles.css
│   └── app/
│       ├── app.config.ts            (provideRouter, provideHttpClient with interceptors)
│       ├── app.routes.ts
│       ├── app.component.ts
│       ├── core/
│       │   ├── auth/                (auth service, JWT interceptor, guard)
│       │   ├── http/                (error interceptor)
│       │   └── api/<resource>.service.ts
│       ├── shared/                   (UI primitives, pipes, directives)
│       ├── features/<feature>/
│       │   ├── pages/
│       │   ├── components/
│       │   └── <feature>.routes.ts
│       └── models/
└── .env.example                     (read via Angular environment.ts)
```

## Conversion mapping

| ASP.NET                                          | Angular 17                                                  |
|--------------------------------------------------|-------------------------------------------------------------|
| `<asp:TextBox>` etc.                             | `[(ngModel)]` Template-driven OR `FormControl` Reactive (preferred) |
| `<asp:GridView>`                                 | Angular Material `mat-table` or PrimeNG `p-table`           |
| `<asp:Button OnClick="...">`                     | `(click)="handleSave()"` calling an `HttpClient` service    |
| ViewState                                         | Component state; never invisible persistence                |
| Postback                                          | REST call via injected `<Resource>Service`                  |
| MasterPage                                        | Root `<app-shell>` with `<router-outlet>`                   |
| `Page_Load`                                       | `ngOnInit` + RxJS observables                               |
| `User.IsInRole("X")`                              | `*ngIf="auth.hasRole('X') | async"` + `RoleGuard`           |
| Server validation                                 | Reactive Forms validators + custom async validators         |
| Session                                           | JWT in memory; refresh via interceptor                      |

## Procedure
1. Read `inventory.json`.
2. Scaffold `angular.json`, `package.json`, `tsconfig*.json`, `main.ts`, `app.component.*`, `app.config.ts`, `app.routes.ts`.
3. Use **standalone components** everywhere (no NgModules unless unavoidable).
4. Generate `core/auth/*` (login, JWT interceptor, AuthGuard, RoleGuard).
5. Generate `core/api/<resource>.service.ts` with typed methods returning `Observable<T>`.
6. Generate `features/<feature>/pages/*.component.{ts,html,css}` for each legacy view.
7. Add error interceptor + global toast.
8. Add `environment.ts` with `apiBaseUrl`, plus `.env.example` documenting it.
9. Add `README.md` with run/build instructions.
10. Self-critique.
11. `finish` with summary.

## Quality bar
- Standalone components, no zone-disabling unless explicit.
- Reactive Forms for any non-trivial form.
- No `any`; lean on type inference.
- All API calls through services, never inline in components.
- Accessibility: ARIA, focus management on dialog open.
- Lazy-load feature routes via `loadChildren` / `loadComponent`.
