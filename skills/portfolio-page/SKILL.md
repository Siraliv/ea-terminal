---
name: portfolio-page
description: |
  Build a "portfolio analytics" page that combines N time-series
  strategies/tests/assets into a portfolio, scores them on a
  risk-adjusted basis, and surfaces the result through a Composite
  Quality Score + validated optimisation. Trigger this when the user
  wants any of: "combine N strategies", "build a portfolio page",
  "risk-vs-return optimiser", "walk-forward validation", "Pareto
  frontier across combinations", "Sharpe / Sortino / Calmar scoring",
  "Markowitz weights", or anything that smells like Modern Portfolio
  Theory applied to a backtest library. Also use when the user asks
  for "ML insight" on a combination of strategies — the answer is a
  rules-based composite, not literal ML.
---

# Portfolio analytics page

A reusable recipe for building a portfolio-analytics page from a
library of time-series backtests (or any per-entity equity / NAV
curves). Captures the architecture, math, scoring rubric, validation
suite, and UX conventions that the EA-Terminal Portfolio page is
built on so a sibling project can rebuild it without re-deriving the
hard parts.

## When this skill applies

Use this skill whenever the user wants to:

- Combine 2–N backtest equity curves into one portfolio and score the
  result (Sharpe / Sortino / Calmar / Recovery).
- Search a candidate pool for the best combinations under a chosen
  score (an "AUTO" optimisation panel).
- Validate that the optimiser isn't curve-fitting (walk-forward, leave-
  one-out).
- Allocate capital across constituents with anything other than equal
  weights (inverse-vol, Markowitz mean-variance).
- Visualise risk-vs-return trade-offs (Pareto frontier, drawdown shape,
  monthly returns heatmap, per-constituent contribution).
- Produce an honest "quality rating" on a portfolio without making up
  a black-box ML model.

Do not use this skill when the user wants a single-strategy detail page,
a passive performance dashboard, or a buy-side execution tool — those
are different shapes.

---

## 1. Architectural principles

Three layers, strict separation:

### Layer A — Pure math library (`src/lib/portfolio.ts`)

All combination math, scoring, optimisation, validation, decomposition.
**Zero React imports**. Deterministic, side-effect-free, easily unit
tested. Every function takes inputs, returns outputs.

Anchor exports:

- `combinePortfolio(tests, weights, startCapital)` → curve + per-step
  returns + correlation matrix
- `computeMetrics(curve, startCapital, correlation)` → `PortfolioMetrics`
- `computeWeights(tests, scheme)` → weights vector for any scheme
- `findBestPortfolios(opts)` → top-N ranked combinations
- `searchAllPortfolios(opts)` → slim entries for every combo (Pareto)
- `walkForward(candidates, opts)` → per-fold IS/OOS scores
- `leaveOneOut(tests, ...)` → per-constituent fragility analysis
- `monthlyReturns(curve)` → year/month return grid
- `constituentContributions(tests, weights)` → stacked decomposition

### Layer B — Scoring / report library (`src/lib/portfolioReport.ts`)

Sits on top of the math layer. Takes a `PortfolioMetrics` (and
optionally a candidate pool for walk-forward) and produces a
`PortfolioReport` — composite score, sub-scores, narrative bullets,
strengths / concerns / recommendations / warnings, and the validation
results.

**Rules-based and deterministic**. No LLM call. Every sentence in the
report traces to a specific threshold defined in this file. Keep this
property — it's the single biggest credibility multiplier and it's what
makes the score auditable.

### Layer C — Feature components (`src/features/portfolio/*`)

React components: the page, the manual builder, the report summary and
deep-dive modal, plus the visualisation components (DrawdownChart,
ContributionChart, ParetoFrontier, MonthlyReturnsHeatmap,
CorrelationMatrix).

The components are dumb — they read from props and render. All math
lives upstream.

---

## 2. The math layer

### 2.1 Return-based combination, not dollar-additive

Never sum balances directly. Convert each constituent's curve to **% returns per step**, combine via weighted sum, then compound from a
chosen `startCapital`:

```ts
// pseudo
for each timestep i:
  portfolioReturn_i = sum_k(weight_k * return_k_i)
  portfolioEquity_i = portfolioEquity_{i-1} * (1 + portfolioReturn_i)
```

Why: a $10k strategy and a $100k strategy contribute equally on a return
basis, which is what you want. Dollar-additive biases toward whoever
was backtested on a bigger account.

### 2.2 Align curves on a unified timeline

Build the union of every constituent's timestamps. Forward-fill each
strategy's balance onto the unified timeline so every series has the
same length. Strategies whose data starts later sit at their initial
balance until they "go live" — equivalent to holding cash.

### 2.3 Annualise from actual span, not assumed cadence

Sharpe = `(mean / stdev) * sqrt(periodsPerYear)`. **Don't assume daily
samples** — backtest exports have wildly variable cadence (per-deal
points). Derive `periodsPerYear` from the actual span:

```ts
const yearsSpan = (lastTs - firstTs) / (365.25 * 86_400_000)
const periodsPerYear = returns.length / yearsSpan
```

Same goes for compounding the annualised return — use `(end/start)^(1/years) - 1`, not `totalReturn / years`.

### 2.4 The metric set

Always compute these and surface them in the UI. Don't drop one because
it's complex; the value is in their **combination**.

| Metric | What it measures | When it matters |
|---|---|---|
| Net % | Total return over period | Headline — but always cross-check against drawdown |
| Annualised return % | CAGR | Comparable across backtest lengths |
| Max DD % | Worst peak-to-trough drop | Depth of pain |
| Time underwater % | Fraction of time below a prior peak | Psychological survivability |
| Longest DD days | Longest single underwater stretch | The "are you patient enough?" number |
| Sharpe | Risk-adjusted return (total vol) | Standard, but penalises upside vol |
| Sortino | Same but downside-only vol | Better for asymmetric strategies |
| Calmar | Annualised return ÷ Max DD % | Reward-to-worst-case ratio |
| Recovery | Net PnL ÷ \|Max DD $\| | Below 1 means the drawdown exceeded the profit |
| Avg pairwise correlation | Constituent independence | High = concentration risk, low = real diversification |

**Drop**: per-deal "max consecutive losses" on a portfolio. It's
meaningless on a downsampled combined curve. Surface it only on
single-strategy pages.

---

## 3. The Composite Quality Score

Five weighted sub-scores, each 0–10, combined into a 0–10 headline:

| Sub-score | Drives off | Weight |
|---|---|---|
| Risk-adjusted return | Sortino (Sharpe fallback) | 30% |
| Drawdown depth & recovery | Max DD % + Recovery | 25% |
| Drawdown duration | Time underwater % + Longest DD | 15% |
| Diversification | Avg pairwise correlation | 15% |
| Return strength | Annualised return | 15% |

### Skepticism floors

Auto-cap suspiciously good numbers. Cap **and** emit a warning:

- Sortino > 3 → cap risk-adjusted at 9 + "typical of curve-fit"
- Annualised return > 40% → cap return-strength at 9 + same warning
- Backtest spans < 1 year → mark the whole report directional only

### Bands

```
≥ 9.0 Excellent · ≥ 7.5 Strong · ≥ 6.0 Solid · ≥ 4.5 Decent
≥ 3.0 Marginal · ≥ 1.5 Weak    · else      Poor
```

### Headline templates (context-aware)

Don't restate the band. Pick a one-liner based on which sub-scores
diverge most:

- High Sortino + high correlation → *"Strong numbers, concentrated bet
  — high correlation flatters the score."*
- Decent return + 75%+ underwater → *"Profitable but psychologically
  demanding (mostly underwater)."*
- Good diversification + weak risk-adjusted → *"Well-diversified, but
  the underlying strategies lack edge."*

These angles teach the reader something the score alone doesn't.

---

## 4. Validation suite

Two analyses, both deduct from the composite when they trip:

### 4.1 Walk-forward (anti-overfitting)

Split the timeline into K chronological folds (default 5). For each
fold k from 2..K:

1. In-sample = data before fold k
2. **Re-run the optimiser** on IS only → winning combination
3. Out-of-sample = score the same combo on fold k

Aggregate: `meanIS - meanOOS` = the **overfit gap**.

- Gap < 0.3 → healthy
- 0.3–1.0 → expected for any in-sample search
- ≥ 1.0 → optimiser is curve-fitting

Deductions: gap ≥ 0.6 (-0.5), ≥ 1.0 (-1.25), ≥ 1.5 (-2.0). Add an extra
-1 if a majority of OOS folds are negative.

### 4.2 Leave-one-out (fragility)

For a portfolio of N constituents, drop each one and recompute
Sharpe / Sortino on the remaining N-1. Reports:

- `stabilityRatio = min(Sharpe_without_k) / Sharpe_full`
- The "load-bearing" constituent (whose removal hurts most)

- Ratio ≥ 0.75 → robust
- 0.25–0.75 → fragile
- < 0.25 → single-strategy bet wearing N hats

Deductions: ratio < 0.75 (-0.5), < 0.5 (-1.0), < 0.25 (-2.0).

**Total validation deduction capped at -3** so a great raw score
can't be wiped out entirely by one bad signal. Expose
`rawCompositeScore` alongside the deducted `compositeScore` so the UI
can render `8.1 → 5.6` instead of hiding why the headline dropped.

---

## 5. Weighting schemes

Three modes, user-selectable:

### Equal (default)
`1/N` per constituent. The honest baseline; no view on which is better.

### Inverse-volatility
Weight ∝ `1/σ_k`, normalised. Steady strategies get more capital. Falls
back to equal weights when any σ rounds to zero.

### Markowitz (mean-variance tangency)

Closed-form `w = Σ⁻¹ μ`, then long-only via clip-and-renormalise:

1. Compute mean-return vector μ and covariance matrix Σ
2. Solve unconstrained: `w_raw = Σ⁻¹ μ`
3. Clip negatives to zero
4. Renormalise so weights sum to 1

Add a tiny diagonal regulariser to Σ before inversion (`ε = 1e-8`) to
survive near-singular cases. Use Gauss-Jordan for the inverter — for
N ≤ 5 it's ~30 lines and microsecond-fast.

**Failure-mode fallbacks**: singular Σ → inverse-vol; all-non-positive
raw weights → equal.

**Honesty**: Markowitz pumps in-sample scores and is overfit-prone.
Always run the walk-forward step alongside it. The validation will
catch and deduct.

---

## 6. Visualisations and when to use each

Stack them in this order in the manual builder's preview column:

| Component | Layout | Insight |
|---|---|---|
| Equity curve (%) | Top, wide | The arc |
| Drawdown chart | Below equity | Depth + duration |
| Contribution chart | Below drawdown | *Who* drives returns and when |
| KPI tiles | 4-col grid | At-a-glance metrics |
| Correlation matrix | Below KPIs | Cell-by-cell diversification |
| Monthly returns heatmap | Bottom (or left column) | Seasonality + consistency |
| Pareto frontier | Separate page panel | Where the AUTO picks sit in the broader risk/return space |

### Specific rules

- **Equity curve always in % return**, not dollars. Each series
  referenced to its own first non-null balance, so curves with
  different starting balances are directly comparable on the same
  axis.
- **Drawdown chart pinned to y ≤ 0**. Always reads as "depth from
  breakeven."
- **Contribution chart** = stacked area, one band per constituent.
  Sum equals portfolio cumulative return (exact — apply weights to
  per-step returns *before* compounding).
- **Pareto frontier** = scatter with three layers: all-combos dim
  base, frontier line dashed-green, top-N from AUTO highlighted.
  Memory-light: use a slim `SearchEntry` type without curves; ~5,000
  combos at 500 bytes = 2.5MB instead of 125MB.
- **Monthly heatmap** with green/red cell tints saturating at ±10%
  (so outliers don't desaturate the rest). YTD column compounds
  honestly (`prod(1+r)−1`), not naïve sum.
- **Correlation matrix**: green tint < 0.3, amber 0.3-0.7, red ≥ 0.7
  (with red overlay warning at portfolio level).

---

## 7. UX conventions

These small patterns add up to a coherent, trustworthy page:

### InfoChip on every non-obvious control

`[?]` icon next to control labels, hover opens a styled popover with a
brief explanation of the metric / option. Especially important for
domain terms (Sortino, Calmar, Walk-Forward, Pareto). Never use native
browser tooltips for these — the chip pattern keeps the aesthetic
consistent.

### Dashed-border framed panels

Every distinct section sits in a `FramedPanel` with a dashed border
(`--term-borderDim`) and a small uppercase title. The title can carry a
`titleRight` slot for a status chip (e.g. "VALIDATED" / "FRAGILE+OVERFIT").

### Scope chips next to controls

When a setting changes the meaning of downstream numbers (year range,
raw-vs-approx data, walk-forward status), surface a bracketed tag
adjacent to the relevant control so the user always knows what they're
looking at.

### Conditional warnings inline, not in console

High correlation, fragile portfolio, overfit walk-forward, suspiciously
high Sortino → surface inside the report, not as toasts or alerts.
Use coloured framed callouts that match the warning severity.

### Honest framing in disclaimers

Every panel where directional accuracy is uncertain gets an italic
caveat in dim text:

- *"Pool: top 15 by PF within the active range. Sizes searched: 2-5.
  Weights are equal (1/N) per constituent. Capital seeded at $100,000.
  Returns are derived from backtest curves — directional, not
  predictive."*

The user should never be in doubt about what the numbers mean.

---

## 8. Recommended implementation order

If building from scratch, ship in this order. Each tier produces a
usable page; later tiers extend rather than replace.

### Tier 1 — Honest metrics + workflow

1. Math layer with `combinePortfolio` + `computeMetrics`
2. Page with controls (Score, Year range, Pool criterion, Start $)
3. AUTO panel (top-N by score) + Manual Builder + Equity chart
4. Drop the broken "lose run on portfolio" metric
5. Add Sortino, time underwater, longest DD, avg correlation
6. Drawdown chart below equity
7. CorrelationMatrix component
8. ReportSummary with Composite Quality Score
9. localStorage-backed saved portfolios

### Tier 2 — Credibility + portfolio theory

1. Walk-forward validation + leave-one-out → composite deductions
2. Weighting schemes: equal / inverse-vol / Markowitz
3. Monthly returns heatmap
4. Constituent contribution chart
5. Pareto frontier scatter
6. Full deep-dive report modal with all of the above tied together

### Tier 3 — Advanced (per-feature commits)

1. Monte Carlo bootstrap → confidence intervals
2. Rolling Sharpe / rolling correlation charts
3. Side-by-side portfolio comparison view
4. Web Worker for parallel optimisation
5. Persist saved portfolios to a real DB
6. Stress-testing scenarios (apply -X% shocks)
7. Forecasting (Monte Carlo projection forward)

---

## 9. Anti-patterns (don't do these)

- **Don't call an LLM for the score.** Rules-based is more trustworthy
  for a financial number; you can audit the threshold that produced it.
  Reserve LLMs for narrative *prose* if you want them at all, and only
  after the rules-based score is rock solid.
- **Don't include the curve in the slim search-entry type.** ~5,000
  combinations × ~500-point curves = 125MB of garbage you don't need.
  Keep curves only for the top-N you'll render.
- **Don't run the optimiser on the main thread when the pool is large.**
  Web Worker it. (Top-15 pool × 5,000 combos is fine; top-30+ starts to
  jank.)
- **Don't use Sharpe alone for "good" judgments.** Always pair with
  Sortino. They diverge for asymmetric strategies and the divergence
  itself is information.
- **Don't fight the user with modal-of-modals.** One inline summary
  panel, one expandable full-report modal. Don't bury validation
  results three clicks deep.
- **Don't normalise equity curves on different starting balances by
  summing dollars.** Always go return-based first.
- **Don't run walk-forward on tiny pools** (fewer than `sizeMin`
  candidates) — return an empty result instead of pretending. Same for
  pools with < `2*folds` timestamps.

---

## 10. Future-proofing for LLM narrative

If a later phase wants richer prose, expose this signature alongside
the rules-based report:

```ts
export function serializeForPrompt(
  metrics: PortfolioMetrics,
  tests: readonly Test[],
  report: PortfolioReport,
): string;
```

Returns a clean context block (markdown). The rules-based composite
stays the source of truth for the rating; the LLM only replaces the
narrative bullets. This means the score doesn't drift between
sessions when the model updates.

---

## 11. Glossary (paste into the full-report modal)

| Term | Plain English |
|---|---|
| Sharpe | Annualised return ÷ total volatility |
| Sortino | Same, but only counts downside volatility |
| Calmar | Annualised return ÷ max drawdown % |
| Recovery | Net PnL ÷ \|max drawdown $\| (< 1 = pain exceeded gain) |
| Max DD % | Worst peak-to-trough drop as % of peak |
| Longest DD | Longest single stretch below a prior peak, in days |
| Time underwater | Fraction of time below a prior peak (30-50% normal, >80% heavy) |
| Avg corr | Mean pairwise Pearson correlation between constituents |
| Leave-one-out | Drop each constituent, re-score the rest |
| Stability ratio | Lowest LOO Sharpe ÷ full Sharpe; <0.25 = single-strategy bet |
| Walk-forward | Optimise on past data, evaluate on the next slice |
| IS / OOS gap | In-sample minus out-of-sample average — large = curve-fit |

---

End of skill.
