# Throttling Without Lobotomizing the Agent

## Problem

When agentic pipelines hit per-minute or per-token rate limits from the model provider (Anthropic 429/529, OpenAI 429, Copilot quota), the natural reaction is to add defenses that reduce token pressure. **Some of those defenses preserve agent quality. Others quietly destroy it.** This doc separates the two so anyone extending this pipeline knows which knobs are safe to turn and which are traps.

The triggering incident: after rate-limit errors, defenses were added that included aggressive caps:

```json
{
  "modernizer.anthropicMaxTokens": 1200,
  "modernizer.interRequestDelayMs": 1500,
  "modernizer.historyTurns": 2,
  "modernizer.toolResultMaxChars": 8000,
  "modernizer.readFileDefaultMaxBytes": 40000,
  "modernizer.readFileHardMaxBytes": 120000,
  "modernizer.enableCritiquePass": false
}
```

Result: the API conversion step produced **one entity file** (`Product.java`) and stopped. No services, no repositories, no controllers. The agent ran but produced nothing useful.

The retry/backoff and inter-request delay were good additions. The output cap and history trim were destructive. This doc explains why.

---

## The mental model

Two distinct things get rate-limited:

1. **Calls per minute** — provider counts how many requests hit the API in a sliding window.
2. **Tokens per minute** — provider counts total tokens (input + output) consumed in that window.

Either can trigger a 429. The right defense depends on which limit you're hitting:

| Limit you're hitting       | Right defense                                  | Wrong defense                              |
|----------------------------|------------------------------------------------|---------------------------------------------|
| Calls per minute           | Sleep between requests; exponential backoff    | Reduce iterations (you'd just run slower)   |
| Output tokens per minute   | Sleep between requests; reduce iteration count | Reduce `max_tokens` per call ⚠️             |
| Input tokens per minute    | Sliding-window history; trim re-injected tool results | Drop the original goal ⚠️             |
| Quota / monthly cap        | Cache artifacts; mix providers per step        | Anything aggressive in-call                 |

The **wrong** defenses make individual calls dumber. They produce broken output that requires more retry iterations, which costs more tokens, which trips the same limit again. It's a doom loop.

---

## The principle

> **Don't make the agent dumber to slow it down. Make it slower while staying smart.**

Throttling lives **between** requests. Each individual call should still have everything it needs to produce useful output. Three things that should never be sacrificed inside a call:

1. **Output budget** — the model needs room to actually write a Java file (1500–3000 tokens) or a multi-section Markdown doc. Capping output below that guarantees truncation, which guarantees the next iteration repeats work or skips it.
2. **The original goal** — the very first user message tells the agent what it's doing. If history trimming drops it, the agent forgets the task between iterations and either re-plans wastefully or stops early thinking it's done.
3. **The plan** — if the agent wrote a plan in iteration 1, that plan must survive in context until iteration N. Otherwise the verifier has no idea whether the agent finished.

---

## What each setting actually does

### `anthropicMaxTokens` (output cap per call)

**What it controls:** the maximum tokens the model can emit in a single response. This is a *cap*, not a target — you only pay for tokens actually generated.

**Safe range:** 4096 – 8192. Sonnet supports 8192; some models 16K+. Use 8192 unless you have a specific reason.

**Trap:** values below 4096 truncate code mid-method. The model can't produce a valid Java service, a multi-page React component, or a working `pom.xml` in 1200 tokens. It will either stop mid-file, cut import sections, or omit error handlers — all of which surface as "incomplete conversion" failures.

**Why people lower it anyway:** they confuse cost with cap. The cap doesn't pre-charge you; it's a ceiling. A model asked for max 8192 that emits 600 tokens costs the same as if max were 600. Setting the cap low only matters when it forces truncation, which is what we want to avoid.

**Recommended:** keep at 8192. Don't touch.

### `historyTurns` (sliding-window history size)

**What it controls:** how many recent conversation turns get re-sent to the model on each call.

**Safe range:** 10 – 20.

**Trap:** values below 8 cause the agent to forget its plan and the original goal. Symptoms: agent re-reads the inventory every iteration, re-plans every iteration, writes one file at a time and then stops, claims success on partial work.

**Critical caveat:** even with a low `historyTurns`, **the first user message must always be preserved**. That message is the original goal. Without it the agent literally doesn't know what task it was given after a few iterations. The trimmer must keep `messages[0]` plus the recent N turns:

```ts
function trimMessages(
  messages: Array<{role: 'user'|'assistant', content: string}>,
  keepRecent: number
): typeof messages {
  if (messages.length <= keepRecent + 1) return messages;
  const goal = messages[0];
  const tail = messages.slice(-keepRecent * 2); // each turn ≈ 1 assistant + 1 user
  return [goal, ...tail];
}
```

If your trimmer is just `messages.slice(-N)`, that's a bug. Fix it before tuning anything else.

**Recommended:** 12 with a goal-preserving trimmer.

### `toolResultMaxChars` (tool result re-injection size)

**What it controls:** when a tool returns a big payload (a 50KB controller file, the inventory JSON), how much of that gets put back into the conversation as the next user message.

**Safe range:** 25000 – 60000 characters.

**Trap:** below 15000 truncates important payloads. If `inventory.json` is 30KB and you cap at 8000, the agent sees only a third of the inventory and confidently proceeds with one-third coverage.

**Important nuance:** this is different from how big the *original tool call output* can be. That's controlled by `readFileDefaultMaxBytes` etc. This setting is about how much of that output survives into the next prompt. Often you want the read to succeed (so the agent observes "this file is 60KB and starts with X") even if you only re-inject a summarized form.

**Recommended:** 30000.

### `readFileDefaultMaxBytes` and `readFileHardMaxBytes` (file read caps)

**What they control:** the most bytes the `read_file` tool will return. Default is the tool's own default; hard max overrides any caller request.

**Safe ranges:**
- `readFileDefaultMaxBytes`: 80000 – 150000
- `readFileHardMaxBytes`: 200000 – 500000

**Trap:** below 50000 cuts off non-trivial controllers and config files. The agent then converts a partial controller, missing endpoints below the cut.

**When low values are fine:** for the inventory step where you read many small files. For conversion where you read whole controllers, raise these.

**Recommended:** 100000 default, 250000 hard.

### `interRequestDelayMs` (sleep between calls)

**What it controls:** wall-clock delay inserted between successive model calls.

**Safe range:** 0 – 5000 ms.

**This is the right knob for rate-limit pressure.** It throttles your call rate without making any individual call dumber. The model still gets full output budget and full context — there's just slightly more wall-clock time between iterations.

**Trap:** there isn't one for output quality. The only downside is wall-clock time per pipeline run.

**Recommended starting point:** 1000 ms. Raise to 2000–3000 ms if you still hit 429s.

### `enableCritiquePass` (post-loop self-fix)

**What it controls:** whether the agent runs a verification pass after `finish` to catch missing files and compile errors.

**Trap:** disabling this removes the safety net that would have noticed "you only wrote 1 file but the inventory had 12 endpoints." It's the single biggest predictor of incomplete output.

**When to disable:** never for production runs. Maybe during early debugging when you're testing whether the main loop produces anything at all and don't want to wait for critique.

**Recommended:** true. Always.

### Retry/backoff with `retry-after` (in `llmClient.ts`)

**What it does:** when the API returns 429 or 529, sleep for the duration the server suggests in the `retry-after` header (or fall back to exponential), then retry.

**This is unambiguously good.** Add it. It costs nothing. The only thing to watch: cap retries at 3–5 to avoid hanging forever on a permanently-broken endpoint.

---

## Three preset configurations

### Balanced (recommended default)

```json
{
  "modernizer.anthropicMaxTokens": 8192,
  "modernizer.historyTurns": 12,
  "modernizer.toolResultMaxChars": 30000,
  "modernizer.readFileDefaultMaxBytes": 100000,
  "modernizer.readFileHardMaxBytes": 250000,
  "modernizer.interRequestDelayMs": 1000,
  "modernizer.enableCritiquePass": true,
  "modernizer.maxIterations": 40
}
```

Starting point. Use this unless you have a specific reason to deviate.

### Aggressive (when 429s persist on Balanced)

```json
{
  "modernizer.anthropicMaxTokens": 4096,
  "modernizer.historyTurns": 8,
  "modernizer.toolResultMaxChars": 15000,
  "modernizer.readFileDefaultMaxBytes": 60000,
  "modernizer.readFileHardMaxBytes": 150000,
  "modernizer.interRequestDelayMs": 2500,
  "modernizer.enableCritiquePass": true,
  "modernizer.maxIterations": 30
}
```

Tightens history and tool results, slows the call rate. Output cap is still high enough to write a whole Java class. Use only if Balanced still trips limits after a couple of runs.

### Quality (best output, slowest, highest cost)

```json
{
  "modernizer.anthropicMaxTokens": 8192,
  "modernizer.historyTurns": 20,
  "modernizer.toolResultMaxChars": 60000,
  "modernizer.readFileDefaultMaxBytes": 150000,
  "modernizer.readFileHardMaxBytes": 500000,
  "modernizer.interRequestDelayMs": 500,
  "modernizer.enableCritiquePass": true,
  "modernizer.maxIterations": 60
}
```

For when you've moved off Copilot or a metered API and you want maximum agent quality.

---

## Diagnostic flowchart for "agent produced too little"

When a step produces partial output, walk through this in order. Stop at the first match.

1. **One file produced and then stopped?**
   → Output cap is starving the agent. Check `anthropicMaxTokens` ≥ 4096.

2. **Each iteration re-reads the inventory and re-plans?**
   → History trimming is dropping the plan. Raise `historyTurns` to 12+ and verify the trimmer preserves `messages[0]`.

3. **Plan is correct but only the first vertical slice gets generated?**
   → `maxIterations` is too low for the plan size. Raise to 40 or split the work into vertical slices.

4. **Tool results show "...truncated" markers?**
   → `toolResultMaxChars` or `readFileDefaultMaxBytes` is too low for your codebase. Raise both.

5. **Agent claims success but disk shows partial work?**
   → `enableCritiquePass` is false. Re-enable.

6. **None of the above and you keep hitting 429?**
   → Real rate limit. Raise `interRequestDelayMs` to 2500–3000. Don't lower the other caps.

---

## What "throttling" should never include

Anti-patterns that look like throttling but aren't:

| Anti-pattern                                            | Why it's wrong                                              |
|---------------------------------------------------------|-------------------------------------------------------------|
| Reducing `max_tokens` to under 4096                     | Truncates output mid-file, doesn't help with rate limits    |
| Setting `historyTurns` below 6                          | Causes amnesia; agent re-plans every iteration              |
| Dropping `messages[0]` (the original goal) when trimming| Agent forgets what task it was given                        |
| Disabling the critique pass                             | Removes the verifier that catches incomplete work           |
| Capping tool results at < 10000 chars                   | Inventory and source files get sliced; partial conversions  |
| Skipping `read_file` calls "to save tokens"             | Agent hallucinates file content; output looks plausible but doesn't compile |
| Lowering `maxIterations` below 25 for full conversion   | Multi-file work needs 30+ turns; truncation looks like a quota issue but is just impatience |

If a proposed defense falls into one of these patterns, it's not really a rate-limit defense — it's a quality-reduction defense in disguise. Reject it and find a between-call lever instead.

---

## What "throttling" should include

Patterns that genuinely reduce rate-limit pressure without reducing quality:

| Pattern                                                  | Mechanism                                                |
|----------------------------------------------------------|----------------------------------------------------------|
| `interRequestDelayMs` between calls                      | Spreads token consumption across the rate-limit window   |
| Retry-with-backoff honoring `retry-after`                | Recovers from transient 429s without losing work         |
| Goal-preserving sliding-window history                   | Reduces input tokens without amnesia                     |
| Hard cap on tool result re-injection (but read still succeeds) | Reduces input tokens without losing observability  |
| Caching stable artifacts (`inventory.json`, docs)        | Skips entire steps when nothing changed                  |
| Per-step model selection (cheap models for cheap work)   | Spreads load across providers/quotas                     |
| Vertical-slice conversion (one slice end-to-end first)   | Cuts conversion calls 70–80% on first iteration          |

---

## Why this matters beyond this one bug

Rate-limit defenses are an opportunity to make wrong choices that masquerade as engineering rigor. Capping output looks responsible. Trimming history looks efficient. Disabling the critique pass looks like trust in the agent. All three are footguns.

The principle worth internalizing: **per-call quality is non-negotiable; throttling lives between calls**. If you can't reduce pressure without reducing per-call quality, you have a different problem — too much work, wrong model choice, missing caching — and the solution is architectural, not parametric.

When extending this pipeline, audit any new "defense" you add against this principle. If it shrinks the model's capability inside a single call, replace it with a between-call mechanism. The Balanced preset above is the canonical example: every limit it imposes is either between calls (`interRequestDelayMs`, `maxIterations`) or preserves per-call quality (`anthropicMaxTokens` high, `historyTurns` adequate, critique on, goal preserved in trimming).

Apply this audit to any future agent step in the pipeline. If a future contributor proposes lowering output caps or disabling critique to "save tokens," point them here.
