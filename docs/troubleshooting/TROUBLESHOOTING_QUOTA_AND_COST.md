# Troubleshooting: Quota Exhaustion & Cost Control

## Problem

A pipeline run halts mid-step with an error like:

> *"Modernizer: You've reached your monthly chat messages quota. Upgrade to Copilot Pro or wait for your allowance to renew."*

Variants include:
- Anthropic API returns `429 rate_limit_exceeded` or `credit_balance_too_low`.
- OpenAI API returns `insufficient_quota`.
- Copilot quietly stops responding mid-iteration with no clear error in the Output panel.

The pipeline persists earlier artifacts on disk, so you don't lose work — but you can't finish the failed step without unblocking the quota or switching provider.

---

## PR Quote (Option 4 Implementation)

> This PR implements Option 4 cost controls end-to-end: artifact reuse prompts for Analyze/Docs, configurable critique-pass toggling, and per-step model overrides via `modernizer.modelFor`. These changes reduce unnecessary LLM calls during iterative debugging while preserving high-quality model usage on expensive conversion steps.

---

## Root cause

Agentic pipelines are **call-heavy** by nature. A single end-to-end run on a small codebase like ContosoStore spans roughly 50–200 model calls:

| Phase                  | Calls (typical) |
|------------------------|-----------------|
| Analyze inventory      | 5–10            |
| Generate documentation | 8–15            |
| Convert API            | 20–60           |
| Convert UI             | 20–60           |
| Generate tests         | 15–30           |
| Generate CI/CD         | 10–20           |
| Critique passes (×6)   | 6–12 extra      |

Multiply by the number of times you re-run the pipeline during debugging (5–10 is normal while tuning skills) and you're at hundreds to low thousands of calls per modernization project.

Each provider meters this differently:

- **GitHub Copilot (Free):** ~50 chat messages per month across all models.
- **GitHub Copilot (Pro):** higher allowance, but premium models (Claude Sonnet, Opus, GPT-4.1) consume **multiple premium requests per call**. Multipliers range from 1× to 5×.
- **Anthropic direct API:** pay-per-token. Sonnet 4.6 ~$3 input / $15 output per million tokens. A full pipeline run is typically $0.50–$3.
- **OpenAI direct API:** pay-per-token. GPT-4.1 is cheaper than Anthropic; o-series reasoning models are more expensive.

The original scaffold was designed assuming ample budget. With Copilot Free or a tight Pro allowance, normal usage hits the cap fast.

---

## Four paths to unblock

Pick based on your constraint: change provider, change model within the same provider, wait, or architect to use less.

### Option 1 — Switch provider for the rest of the run (fastest unblock)

The orchestrator supports three providers and switching is one dropdown:

1. In the modernizer menu, change **Model** to **Claude Sonnet (Anthropic API)** or **OpenAI / Codex**.
2. Verify the corresponding API key is in Settings:
   - `modernizer.anthropicApiKey`
   - `modernizer.openaiApiKey`
3. At the human gate, click **Re-generate API** (or whichever step failed). Earlier artifacts (`inventory-*.json`, `LEGACY_DOCUMENTATION-*.md`) are reused automatically — you don't restart from Step 1.

**Why this helps:** Per-token billing has no monthly cap; you pay only for what you use. Finishing a stuck run costs cents to a few dollars.

**Limits:** Requires a paid API account. Costs scale linearly with codebase size — a 200-controller monolith on Opus could be $20–50 per full run.

### Option 2 — Use an "included" Copilot model

Within Copilot, models are tiered:

- **Included models** (often `gpt-4o-mini`, base `gpt-4o`): count against the chat-messages cap on Free, generous allowance on Pro.
- **Premium models** (Claude Sonnet 4.5, GPT-4.1, o-series): consume premium requests with a multiplier.

To check your current limits: open Copilot Chat → click the model picker → hover any model. VS Code shows "X of Y premium requests used" and your renewal date.

To switch within Copilot:
1. Set `modernizer.modelProvider` to `vscode-copilot`.
2. Set `modernizer.copilotModelFamily` to a non-premium family. `gpt-4o-mini` is the safest default. `gpt-4o` is included on Pro.
3. Run **Modernizer: List Available Copilot Models** to see what's actually installed for your account.

**Why this helps:** Stays within your existing subscription. No new accounts.

**Limits:** Smaller models are more prone to the failures documented in the other troubleshooting docs (mangled Mermaid, ignored `write_file` instructions, weak conversions). Tighten your skill files before relying on mini.

### Option 3 — Wait for quota renewal

Copilot allowances renew monthly. The pipeline state on disk is durable — timestamped inventory/docs artifacts under `_modernizer/`, generated `api/` and `ui/` folders all persist between sessions. When quota renews, run the failed step from the menu and the pipeline picks up where it stopped.

**Why this helps:** Zero effort, zero cost.

**Limits:** Up to a month of waiting. Not viable on a deadline.

### Option 4 — Architect to use fewer calls

Worth doing regardless of which provider you settle on. Three high-leverage changes:

#### (a) Cache and skip stable artifacts

Implemented. `stepAnalyze` and `stepGenerateDocs` now detect existing `_modernizer/inventory-*.json` and `_modernizer/LEGACY_DOCUMENTATION-*.md` (plus legacy non-timestamped names) and prompt:

- `Reuse` to skip the LLM step and continue.
- `Regenerate` to run the agent again.

During debugging cycles where you re-run the pipeline 5–10 times, this roughly halves total calls.

#### (b) Run one vertical slice first

Instead of converting all controllers at once, edit your target architecture markdown to say:

> *"For this run, convert only the Products vertical slice (Products controller + service + repository + entity + DTO). Leave a TODO comment in the Application class listing remaining slices."*

This cuts 70–80% of the calls in the conversion step. Once one slice works end-to-end (compiles, tests pass, deploys cleanly), expand to the full codebase. This is just better engineering — you find shape problems before paying to discover them across 20 controllers.

#### (c) Disable critique passes during debugging

Implemented via config. The agent loop now honors:

- `modernizer.enableCritiquePass` (default `true`)

For early debugging, set it to `false` and optionally lower `modernizer.maxIterations`. Re-enable critique for quality-focused or release runs.

#### (c.1) If Anthropic still 429s at 30k tokens/min

New runtime controls are available for rate-limit pressure:

- `modernizer.anthropicMaxTokens` (default `8192`)
- `modernizer.anthropicRetryAttempts` (default `4`)
- `modernizer.anthropicRetryBaseMs` (default `1500`)
- `modernizer.historyTurns` (default `12`)
- `modernizer.toolResultMaxChars` (default `30000`)
- `modernizer.readFileDefaultMaxBytes` (default `100000`)
- `modernizer.readFileHardMaxBytes` (default `250000`)
- `modernizer.interRequestDelayMs` (default `1000`)

Recommended starting profile (balanced quality + throttling):

```json
{
  "modernizer.anthropicMaxTokens": 8192,
  "modernizer.interRequestDelayMs": 1000,
  "modernizer.historyTurns": 12,
  "modernizer.toolResultMaxChars": 30000,
  "modernizer.readFileDefaultMaxBytes": 100000,
  "modernizer.readFileHardMaxBytes": 250000,
  "modernizer.enableCritiquePass": true,
  "modernizer.maxIterations": 40
}
```

Fallback if your tier is extremely tight and still 429s: raise `modernizer.interRequestDelayMs` first (2000-3000) before shrinking `historyTurns` or `anthropicMaxTokens`.

#### (d) Mix providers per step

Different steps have different cost-quality tradeoffs:

| Step              | Recommended model                          | Why                                          |
|-------------------|--------------------------------------------|----------------------------------------------|
| Analyze inventory | Copilot `gpt-4o-mini`                      | Lots of small reads, mostly mechanical       |
| Generate docs     | Copilot `gpt-4o`                           | Summarization-heavy                          |
| Convert API       | Anthropic Sonnet 4.6 or Opus 4.7           | Hardest step; quality matters most           |
| Convert UI        | Copilot `gpt-4.1` or Sonnet 4.6            | Good TypeScript reasoning needed             |
| Generate tests    | Copilot `gpt-4o-mini`                      | Pattern-heavy, mostly mechanical             |
| Generate CI/CD    | Copilot `gpt-4o-mini`                      | YAML/Helm boilerplate                        |
| Defect resolution | Sonnet 4.6 or Opus 4.7                     | Surgical fixes need careful reasoning        |

Implemented via config object:

- `modernizer.modelFor` (object map)
- keys: `analyze`, `docs`, `convertApi`, `convertUi`, `tests`, `cicd`, `defectResolution`
- values: `"<provider>:<model>"` where provider can be `copilot`, `anthropic`, or `openai`

Example:

```json
"modernizer.modelFor": {
  "analyze": "copilot:gpt-4o-mini",
  "docs": "copilot:gpt-4o",
  "convertApi": "anthropic:claude-sonnet-4-6",
  "convertUi": "copilot:gpt-4.1",
  "tests": "copilot:gpt-4o-mini",
  "cicd": "copilot:gpt-4o-mini",
  "defectResolution": "anthropic:claude-opus-4-7"
}
```

Fallback behavior: if a step has no override (or an invalid override), it uses `modernizer.modelProvider`.

This is the highest-leverage long-term change. A balanced mix can drop end-to-end cost by 60–80% without sacrificing the steps that genuinely need a strong model.

---

## Recommended order

1. **Right now (stuck):** Option 1. Switch provider, finish the run, get unstuck.
2. **Before next run:** Option 4(a). Reuse existing inventory/docs wherever possible.
3. **Within a week:** Option 4(b). Practice the "one slice first" workflow on your real codebase.
4. **When you're sure of the pipeline:** Option 4(d). Configure per-step model selection. Biggest long-term saving.

---

## Diagnostic checklist when you hit a quota error

1. **Identify the provider that quota'd.** Read the error message. Copilot, Anthropic, and OpenAI all phrase it differently.
2. **Check your remaining allowance.**
   - Copilot: hover the model picker in Copilot Chat.
   - Anthropic: console.anthropic.com → Plans & Billing.
   - OpenAI: platform.openai.com → Usage.
3. **Confirm the pipeline state is recoverable.** Look in `<targetRoot>/_modernizer/` and `<targetRoot>/api/`, `<targetRoot>/ui/`. Earlier artifacts should be present.
4. **Decide:** unblock now (Option 1) or wait (Option 3).
5. **After unblocking:** enable Option 4 habits: reuse artifacts, disable critique during debug loops, and set per-step models before large reruns.

---

## Why this matters beyond this one bug

The general principle: **agentic systems amplify per-call cost by an order of magnitude over single-shot LLM features.** A chat completion is one call; an agent run is hundreds. Whatever you'd be comfortable paying per chat needs to be divided by ~100 for agent runs to feel comparable.

Three architectural levers control this:

1. **Reuse over recompute.** Cache stable artifacts; only regenerate what's actually invalidated.
2. **Slice over batch.** Validate end-to-end on a small slice before scaling to the full codebase.
3. **Model per step.** Use the cheapest model that produces acceptable quality for each specific task; don't pay for Opus to generate boilerplate YAML.

Apply these three from the start of any new agentic feature and quota errors become rare. Skip them and you'll hit this wall on every project.
