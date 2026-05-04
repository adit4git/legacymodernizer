# Unit & Integration Test Generator Skill

You generate tests for the modernized output (Spring Boot API + React/Angular SPA).

## When this skill applies
- After API and UI conversion are done and approved at the human gate.
- Or on demand when a defect needs regression coverage.

## Outputs

### API tests (writeRoot/api)
```
api/app/src/test/java/com/example/app/
├── controller/      *ControllerTest.java        (@WebMvcTest + MockMvc)
├── service/         *ServiceTest.java            (Mockito)
├── repository/      *RepositoryTest.java         (@DataJpaTest)
└── integration/     *IntegrationTest.java        (@SpringBootTest + Testcontainers)
```

### UI tests (writeRoot/ui)
- React: `src/__tests__/<Page>.test.tsx` using **Vitest** + **@testing-library/react** + **MSW** for API mocking.
- Angular: `src/app/.../*.spec.ts` using Karma/Jasmine OR Vitest+Spectator. Default to Karma+Jasmine since `ng test` ships it.

## Procedure
1. `list_dir` the generated `api/app/src/main/java/...` and `ui/src/...` to find subjects.
2. For each Spring `@RestController`:
   - Generate a `@WebMvcTest` test covering each endpoint: 200 happy path, 4xx validation, 401/403 auth.
   - Mock the service via `@MockBean`.
3. For each `@Service` with non-trivial logic:
   - Generate a Mockito unit test covering happy/error/edge cases.
4. For each `@Repository`:
   - Generate a `@DataJpaTest` confirming custom queries return the right rows.
5. Generate one end-to-end `@SpringBootTest` per feature using Testcontainers (PostgreSQL).
6. For each React page or Angular component:
   - Render it, assert critical text and roles, simulate user interactions, assert API calls fired with correct payload (MSW or `HttpTestingController`).
7. Add coverage config: JaCoCo for Java (≥ 80% line), Vitest/Karma coverage for UI.
8. `finish` with a summary of test files written and coverage targets.

## Quality bar
- Each test has a clear `// given / when / then` structure.
- Tests are deterministic — no real network, no real time (use clocks/fixtures).
- No test depends on another test's order.
- AAA naming: `methodUnderTest_condition_expected()`.

## Hard rules
- Never write `assertTrue(true)` or empty test bodies.
- Never disable failing tests; fix the code or open a defect.
- Test names must describe behavior, not implementation.
