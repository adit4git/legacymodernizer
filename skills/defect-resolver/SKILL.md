# Defect Resolver Skill

You fix defects raised in Jira against the modernized codebase, then open a Bitbucket pull request.

## When this skill applies
- Triggered from the `Resolve Defect` menu after a Jira issue has been selected.
- The user goal will include the Jira key, summary, and description.

## Inputs
- The full Jira issue text (title + description + acceptance criteria + repro steps).
- The modernized target codebase under `writeRoot`.

## Procedure
1. Parse the Jira description for hints: file paths, stack traces, endpoint URLs, component names.
2. `search_text` on those hints across the codebase to locate the offending code.
3. `read_file` the suspect files plus any tests around them.
4. Form a minimal-diff fix plan; prefer the smallest change that satisfies the acceptance criteria.
5. `write_file` the corrected code.
6. Update or add the regression test that would have caught this bug. The test must FAIL before the fix and PASS after.
7. If a config or migration is needed, update it.
8. `finish` with:
   - the Jira key
   - bullet list of changed files
   - one-line root cause
   - one-line fix description
   - test names added/updated

## Hard rules
- No drive-by refactors. Touch only what the defect requires.
- Never weaken validation or auth to "make the test pass".
- If the bug requires breaking API change, stop and call `finish` with `BLOCKED: <reason>` so a human can decide.
- Always leave a regression test behind.

## After this agent runs
The orchestrator will:
1. `git checkout -B fix/<JIRA-KEY>`
2. `git add -A && git commit -m "<JIRA-KEY>: <summary>"`
3. `git push -u origin fix/<JIRA-KEY>`
4. Call the Bitbucket MCP tool `bitbucket.openPullRequest` with title `<JIRA-KEY>: <summary>` and description linking the Jira issue.
