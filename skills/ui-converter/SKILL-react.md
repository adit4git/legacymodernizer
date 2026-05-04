# ASP.NET → React (TypeScript) SPA Converter Skill

You convert ASP.NET WebForms / classic MVC views / Razor pages into a modern **React 18 + TypeScript + Vite** SPA.

## When this skill applies
- The user's `targetUiFramework` is `react`.
- Server-rendered pages must become client-side components calling the new Spring Boot REST API.

## Output layout (under writeRoot/ui)
```
ui/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── routes.tsx                (React Router v6)
    ├── api/
    │   ├── client.ts              (axios + interceptors)
    │   └── <resource>.ts          (typed API per resource)
    ├── components/
    │   ├── ui/                    (shared primitives)
    │   └── <Feature>/
    ├── pages/                     (one per legacy WebForm / view)
    ├── hooks/
    ├── store/                     (Zustand or Redux Toolkit)
    ├── types/
    ├── styles/
    └── i18n/
```

## Conversion mapping

| ASP.NET                                          | React (TS)                                                 |
|--------------------------------------------------|------------------------------------------------------------|
| `<asp:TextBox>` / `<input runat="server">`       | controlled `<input>` with `useState` or React Hook Form    |
| `<asp:GridView>`                                 | `<DataGrid>` (TanStack Table) with API pagination          |
| `<asp:Button OnClick="Save_Click">`              | `<button onClick={handleSave}>` calling fetch/axios        |
| ViewState                                         | local state + URL params; never persisted invisibly        |
| Postback (`__doPostBack`)                         | REST call to Spring Boot then state update                 |
| MasterPage / `_Layout.cshtml`                     | `<AppLayout>` component with `<Outlet>`                    |
| `Page_Load`                                       | `useEffect` on mount; `react-query` for data fetching      |
| `User.IsInRole("X")`                              | role check via `useAuth().hasRole('X')`                    |
| Razor `@Html.ValidationSummary()`                 | React Hook Form + Zod validation                           |
| `Session["x"]`                                   | server-side session via JWT; never store secrets in store  |
| `Server.MapPath`                                 | static asset import from `/public`                         |
| `Response.Redirect`                               | `useNavigate()`                                            |
| `Page.IsPostBack`                                 | distinguish initial render via `useRef(true)` if needed    |

## Procedure
1. Read `inventory.json` for the list of UI pages, fields, and events.
2. Scaffold `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `main.tsx`, `App.tsx`.
3. Add foundational deps: `react`, `react-dom`, `react-router-dom`, `@tanstack/react-query`, `axios`, `react-hook-form`, `zod`, `@hookform/resolvers`, `zustand`, `tailwindcss`.
4. Generate `api/client.ts` with axios instance reading `VITE_API_BASE_URL`, attaching the JWT from auth store, and translating 401 → redirect to login.
5. For each entity/controller in the inventory generate `api/<resource>.ts` with typed CRUD calls.
6. For each WebForm/Razor view generate a `pages/<Page>.tsx` plus any feature components.
7. Build the auth flow: `pages/Login.tsx`, `store/auth.ts`, `hooks/useAuth.ts`, `<RequireAuth>` wrapper.
8. Add `routes.tsx` mapping legacy URLs (preserve where possible).
9. Add `.env.example` with `VITE_API_BASE_URL=http://localhost:8080`.
10. Add `README.md` with run/build instructions and a route map.
11. Run a self-critique pass.
12. `finish` with the list of pages created.

## Quality bar
- Strict TypeScript (`"strict": true`). No `any` outside narrowly justified spots.
- All forms use React Hook Form + Zod, never raw `useState` patchwork for complex forms.
- All data fetching goes through React Query (no naked `useEffect(fetch)`).
- Components are functional and ≤ 200 LOC; split otherwise.
- Tailwind for styling (or keep CSS modules — but be consistent).
- Accessibility: labels associated, focus order, `aria-*` on dialogs.
- Error boundaries at route level.

## Hard rules
- Never duplicate ViewState semantics on the client.
- Never put secrets in source.
- Preserve role-based visibility from the legacy app.
