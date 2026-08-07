# Underwriting Copilot

A web application for personal-lines insurance underwriting. Five coordinated agents analyze
customer data, assess risk, generate policy recommendations, decide, and compliance-review a
submission. The UI provides interactive policy comparison, underwriting status, and explanation
dashboards, and the success metrics are measured by a labeled evaluation harness rather than
asserted.

```bash
npm install
npm run dev            # http://localhost:3000
npm run eval           # evaluation harness, exits non-zero if a target is missed
npm run typecheck
```

It runs with **no credentials**. Without an API key the agents fall back to deterministic output,
so the app is fully functional out of the box. Add a key to enable model narration and judgment:

```bash
cp .env.example .env
# ANTHROPIC_API_KEY=sk-ant-...
```

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | unset | Enables the Claude provider. |
| `UNDERWRITING_MODEL` | `claude-opus-5` | Model used by every agent. |
| `UNDERWRITING_LLM` | `auto` | `auto` \| `claude` \| `mock`. Forces a provider. |

---

## The central design decision

**The model never produces a number the business relies on.** Risk scores, premiums, product
eligibility, and rule outcomes come from a deterministic engine. The agents read that output and
produce judgment and language.

This is not a hedge — it is what makes the rest of the system work:

- The same submission scores identically on every run, so the evaluation harness measures the
  system rather than sampling noise.
- Every risk factor carries a signed contribution that sums to the score, so the explanation
  waterfall reconciles by construction instead of by decoration.
- Every rule cites a published manual reference, so a regulator asking "why was this consumer
  declined?" gets a traceable answer.

Three guardrails enforce it in code rather than in prompt text:

1. **Escalate-only decisions.** The underwriting agent may move a decision toward *more* human
   review — approve → refer, refer → decline — and the reverse is rejected by
   `applyEscalation()`. A model that can only ask for more review cannot quietly bind a risk the
   carrier declined.
2. **Deterministic compliance controls.** Prohibited-factor, notice-requirement, and provenance
   checks are code. A model-reported violation can *fail* the review; it cannot make a failing
   review pass.
3. **A fallback on every call.** No credential, an API error, or a safety refusal all resolve to
   deterministic output. The app degrades in quality, never in function.

---

## Architecture

```
src/lib/
  domain/types.ts          the vocabulary — applicant, application, risk, recommendation, decision
  data/                    seed book of business, product catalog, labeled evaluation set
  integrations/            ports for external systems + deterministic mock implementations
  engine/                  scoring · pricing · recommendation fit · underwriting rules
  agents/                  five agents, the LLM provider layer, the orchestrator
  eval/harness.ts          measures the two success metrics
src/app/                   Next.js routes (App Router) and the SSE endpoint
src/components/            timeline, waterfall, comparison table, decision panel, metrics
```

### Agent coordination

Agents declare what they read, and the orchestrator derives the execution plan from those
dependencies — it is a layered DAG, not a hardcoded list. Agents in the same stage run
concurrently. Adding a sixth agent means declaring its `consumes` and nothing else.

| Stage | Agent | Reads | Produces |
|---|---|---|---|
| 1 | Data Analysis | submission, external sources | enriched data, profile, findings, data-quality issues |
| 2 | Risk Assessment | data analysis | score, factor waterfall, narrative, rating gaps |
| 3 | Policy Recommendation | analysis, risk | rated + ranked products, customer-facing reasoning |
| 4 | Underwriting Decision | risk, recommendations | outcome, conditions, rule trace, confidence |
| 5 | Compliance Review | decision, recommendations | findings, adverse-action notice |

The orchestrator is the only writer of the shared case blackboard: an agent returns a patch and
the orchestrator merges it, so concurrent agents cannot observe each other's partial work. Runs
stream `OrchestratorEvent`s over SSE (`GET /api/underwrite?applicationId=…`), which is why the
timeline in the UI shows real concurrency rather than a replayed animation.

### External integrations

`src/lib/integrations/types.ts` defines a port per external system — credit bureau, MVR, claims
exchange, geospatial peril scoring, clinical aggregator, policy admin. Every method returns a
`DataSource` provenance record alongside its payload, so the explanation dashboard can say where a
factor came from, when it was pulled, and whether the vendor was degraded.

**The implementations in this repo are deterministic mocks.** There are no vendor credentials in
this environment, so live calls would be dead code. Swapping in a real vendor is a class
implementing the port plus one line in `registry.ts`; nothing upstream knows which implementation
it is talking to. Simulated latency is tens of milliseconds — the real multi-day wait for
third-party reports is modeled in the evaluation baseline, not faked in the adapter.

---

## Success metrics

Both targets are met on the current evaluation set. Run `npm run eval` or open `/metrics`.

| Metric | Target | Measured |
|---|---|---|
| Recommendation accuracy | 90% | **100%** (12/12) |
| Underwriting time reduction | 40% | **77%** (818 min → 190 min) |

**Recommendation accuracy is joint and strict**: a case counts only when the decision *and* the
rank-1 product both match the label. Component accuracies (decision, product, risk band) are
reported separately so a regression is attributable rather than merely visible.

### What the numbers rest on — read this before quoting them

- **12 labeled submissions across four lines.** This is a design-validation set and a regression
  gate, not a field measurement. 100% on twelve cases is a statement about internal consistency,
  not about production accuracy.
- **`baselineManualMinutes` is a desk estimate** of current-state human cycle time, not an
  observed timing study.
- **`assistedReviewMinutes` is an assumption** — the residual human time on a referred case when
  the underwriter opens a pre-assembled packet. It is the single largest lever on the
  time-reduction figure. Replace it with observed desk timings before quoting the number
  externally.
- **Time reduction is only meaningful if accuracy holds.** Approving a case that should have been
  referred saves time by being wrong, which is why the two metrics are always shown together.

Labels live in `src/lib/data/groundTruth.ts` and were authored against the appetite guide. Five
risk-*band* labels and one acceptable-product set were corrected after the first eval run — the
band corrections because the initial values were eyeballed and the engine's were internally
consistent, and `SUB-24004` because the Estate product is off-appetite at that score, making
Secure-with-a-wind-mitigation-condition the answer a desk would actually write. Decision labels
were not touched. Both changes are recorded in that file's `labelNote` fields.

---

## Model configuration

Calls go through `src/lib/agents/llm.ts` on `claude-opus-5`:

- **Adaptive thinking** (on by default on this model), with `effort` as the depth control —
  `medium` for the three narration agents, `high` for the two judgment agents. These are tuned
  defaults; sweep them against your own eval set before changing them.
- **Structured outputs** via `output_config.format` with a strict JSON schema per agent, so no
  response parsing or retry loop is needed.
- **Streaming**, to keep long generations off the request-timeout cliff.
- **Server-side refusal fallbacks** (`fallbacks: "default"`) are enabled, so a safety decline is
  re-served by Anthropic's recommended substitute instead of returning a dead turn. A refusal that
  survives that still resolves to the deterministic fallback.
- No sampling parameters — `temperature`, `top_p`, and `top_k` are rejected on this model.

---

## Design notes

The palette is the validated reference data-viz palette: a diverging blue↔red pair for the risk
waterfall (red adds risk, blue credits it), a single blue hue for magnitude bars, and a reserved
four-step status palette. Status is always carried by a dot **and** a text label, never by color
alone — two of the four status steps sit below 3:1 contrast on the light surface by design. Both
light and dark modes are separately stepped and validated against their own surface. The waterfall
and comparison table each offer a table view, so no encoding depends on color.

## Known gaps

- The evaluation set is small; the accuracy figure should be treated accordingly.
- Every external integration is mocked. Rate limiting, retry, and vendor error handling are
  out of scope for the adapters as written.
- There is no persistence: runs are computed on demand and the seed book is in memory. There is
  no authentication or per-user authorization.
- The prohibited-rating-factor list is global. A real deployment loads it per jurisdiction.
- `npm run eval` is the regression gate; there is no unit-test suite. `assertFactorsSumToScore`
  and `applyEscalation` are exported specifically so one can assert them directly.
