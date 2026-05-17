import type { EquityPoint, Test } from '@/types/domain';

/**
 * Portfolio math.
 *
 * The page treats a "portfolio" as a set of 2-5 EA tests run in
 * parallel with weighted capital allocation. We project each test's
 * persisted equity curve into % returns on a unified timeline,
 * combine with weights, then re-build a portfolio equity curve at a
 * chosen starting capital. All metrics derive from that combined
 * curve so swapping the score function or the weights is a single
 * re-walk away.
 *
 * Return-based combination (rather than dollar-additive) means a
 * $10k strategy and a $100k strategy contribute on the same scale —
 * we don't reward whoever happened to be backtested on the bigger
 * account.
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type ScoreKey = 'sharpe' | 'sortino' | 'calmar' | 'recovery';

export interface PortfolioMetrics {
  /** Combined curve value at last point − value at first point ($). */
  netPnl: number;
  /** Same as `netPnl` but as a percentage of starting capital. */
  netPnlPct: number;
  /** Worst peak-to-trough drop on the combined curve ($). */
  maxDrawdown: number;
  /** Same drop as % of the running peak. */
  maxDrawdownPct: number;
  /** Annualised Sharpe ratio. */
  sharpe: number;
  /**
   * Annualised Sortino — like Sharpe but the denominator is the
   * standard deviation of *negative* returns only. Doesn't punish
   * upside volatility; usually a better number for asymmetric
   * strategies (most EAs).
   */
  sortino: number;
  /** Annualised return ÷ max drawdown % — classic Calmar. */
  calmar: number;
  /** Net PnL ÷ |max drawdown $| — recovery factor. */
  recovery: number;
  /**
   * Longest continuous stretch the portfolio spent below a prior
   * peak (i.e. duration of the worst drawdown), measured in days.
   * Pairs with `maxDrawdownPct`: depth tells you about pain,
   * duration tells you about psychology.
   */
  longestUnderwaterDays: number;
  /**
   * Fraction of the portfolio's lifetime (0-100) spent below a
   * prior peak. Lower is better; a "smooth grinder" sits near 0%,
   * a strategy that mostly climbs out of holes sits north of 50%.
   */
  timeUnderwaterPct: number;
  /**
   * Mean of the off-diagonal entries of the per-strategy return
   * correlation matrix. Zero = perfectly diversifying; 1 = all
   * strategies move in lockstep (concentration risk). Above 0.7
   * the page surfaces a warning chip.
   */
  avgPairwiseCorrelation: number;
  /** Capital seeded at the first portfolio timestamp ($). */
  startCapital: number;
  /** Capital at the last portfolio timestamp ($). */
  endCapital: number;
}

export interface RankedPortfolio {
  /** Constituent test ids in display order. */
  testIds: string[];
  /** Allocation weights, same order as `testIds`. Sums to 1. */
  weights: number[];
  /** Equity curve of the combined portfolio at `startCapital`. */
  curve: EquityPoint[];
  metrics: PortfolioMetrics;
  /**
   * Per-strategy correlation matrix (rows/cols same order as
   * `testIds`). Diagonal is always 1. Used by the UI to render
   * the heatmap and the diversification warning.
   */
  correlation: number[][];
  /** Primary ranking number used by the current run. */
  score: number;
}

export interface OptimizeOptions {
  /** Pool to draw combinations from. */
  candidates: readonly Test[];
  /** Minimum portfolio size. */
  sizeMin: number;
  /** Maximum portfolio size. */
  sizeMax: number;
  /** Top N returned. */
  topN: number;
  /** Score function used for ranking. */
  score: ScoreKey;
  /** Starting capital for the combined portfolio. Default $100k. */
  startCapital?: number;
}

// ────────────────────────────────────────────────────────────────
// Curve combination
// ────────────────────────────────────────────────────────────────

/**
 * Align each test's curve onto a unified timeline (union of all
 * timestamps), forward-filling balances. Strategies whose data
 * starts later are held at their first known balance for earlier
 * timestamps — equivalent to "in cash" until the strategy goes
 * live. Yields one balance-series per test, ordered by `tests`.
 */
function alignCurves(tests: readonly Test[]): {
  timeline: number[];
  balances: number[][];
  initial: number[];
} {
  if (tests.length === 0) {
    return { timeline: [], balances: [], initial: [] };
  }
  // Union all timestamps.
  const tsSet = new Set<number>();
  for (const t of tests) {
    for (const p of t.equity_curve) {
      const ts = Date.parse(p.t);
      if (Number.isFinite(ts)) tsSet.add(ts);
    }
  }
  const timeline = Array.from(tsSet).sort((a, b) => a - b);
  const balances: number[][] = tests.map(() => new Array(timeline.length));
  const initial: number[] = tests.map(
    (t) => t.equity_curve[0]?.b ?? t.initial_deposit ?? 0,
  );

  // Forward-fill each strategy onto the unified timeline.
  tests.forEach((t, k) => {
    const curve = t.equity_curve;
    let lastBalance = initial[k]!;
    let i = 0;
    for (let ti = 0; ti < timeline.length; ti++) {
      const ts = timeline[ti]!;
      while (i < curve.length && Date.parse(curve[i]!.t) <= ts) {
        lastBalance = curve[i]!.b;
        i++;
      }
      balances[k]![ti] = lastBalance;
    }
  });

  return { timeline, balances, initial };
}

/**
 * Combination result with everything callers might need: the combined
 * curve, the per-strategy return arrays (aligned on the unified
 * timeline) and the per-strategy correlation matrix. Built once so
 * the page doesn't re-walk the same curves multiple times to surface
 * diversification metrics.
 */
export interface CombinationResult {
  curve: EquityPoint[];
  /** Aligned timeline (epoch ms), shared by all return arrays. */
  timeline: number[];
  /** Per-strategy per-step returns, one row per test in `tests`. */
  returnsPerStep: number[][];
  /** N×N Pearson correlation of `returnsPerStep`. Diagonal = 1. */
  correlation: number[][];
}

/**
 * Combine N tests into a portfolio equity curve plus the by-products
 * the page needs to surface diversification (per-strategy returns,
 * correlation matrix). Each test's per-step return is
 * `b[i] / b[i-1] - 1`; the portfolio return is the weighted sum,
 * compounded from `startCapital`.
 */
export function combinePortfolio(
  tests: readonly Test[],
  weights: readonly number[],
  startCapital = 100_000,
): CombinationResult {
  if (tests.length === 0) {
    return { curve: [], timeline: [], returnsPerStep: [], correlation: [] };
  }
  if (tests.length !== weights.length) {
    throw new Error('weights length must match tests length');
  }
  const { timeline, balances, initial } = alignCurves(tests);
  if (timeline.length === 0) {
    return { curve: [], timeline: [], returnsPerStep: [], correlation: [] };
  }

  // Per-step return arrays per strategy.
  const returnsPerStep: number[][] = balances.map((bal, k) => {
    const out = new Array(bal.length);
    out[0] = 0;
    for (let i = 1; i < bal.length; i++) {
      const prev = bal[i - 1] ?? initial[k] ?? 0;
      const cur = bal[i] ?? prev;
      out[i] = prev > 0 ? cur / prev - 1 : 0;
    }
    return out;
  });

  // Combine.
  const port = new Array(timeline.length);
  let equity = startCapital;
  port[0] = equity;
  for (let i = 1; i < timeline.length; i++) {
    let r = 0;
    for (let k = 0; k < tests.length; k++) {
      r += (weights[k] ?? 0) * (returnsPerStep[k]![i] ?? 0);
    }
    equity = equity * (1 + r);
    port[i] = equity;
  }

  const curve = timeline.map((ts, i) => ({
    t: new Date(ts).toISOString(),
    b: port[i]!,
  }));

  const correlation = correlationMatrix(returnsPerStep);

  return { curve, timeline, returnsPerStep, correlation };
}

/**
 * Backwards-compat wrapper that just returns the combined curve.
 * Prefer `combinePortfolio` when you also need correlation or the
 * per-strategy returns.
 */
export function combineCurves(
  tests: readonly Test[],
  weights: readonly number[],
  startCapital = 100_000,
): EquityPoint[] {
  return combinePortfolio(tests, weights, startCapital).curve;
}

/**
 * Pearson correlation matrix over equal-length return series. Empty
 * or single-strategy inputs produce a 0-or-1 element matrix as
 * appropriate. NaN guards: when any strategy has zero variance
 * (perfectly flat) the row/col against it is set to 0 (undefined
 * correlation by convention).
 */
export function correlationMatrix(
  returnsPerStep: readonly (readonly number[])[],
): number[][] {
  const n = returnsPerStep.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  );
  if (n === 0) return matrix;
  const means = returnsPerStep.map((r) => mean(r));
  const stds = returnsPerStep.map((r) => stdev(r));
  for (let i = 0; i < n; i++) {
    matrix[i]![i] = 1;
    for (let j = i + 1; j < n; j++) {
      const a = returnsPerStep[i]!;
      const b = returnsPerStep[j]!;
      const len = Math.min(a.length, b.length);
      if (len < 2 || stds[i]! === 0 || stds[j]! === 0) {
        matrix[i]![j] = 0;
        matrix[j]![i] = 0;
        continue;
      }
      let cov = 0;
      for (let k = 0; k < len; k++) {
        cov += (a[k]! - means[i]!) * (b[k]! - means[j]!);
      }
      cov /= len;
      const r = cov / (stds[i]! * stds[j]!);
      matrix[i]![j] = r;
      matrix[j]![i] = r;
    }
  }
  return matrix;
}

/**
 * Average of the off-diagonal entries of the correlation matrix.
 * Zero for a 1-strategy portfolio (no pairs).
 */
export function avgPairwiseCorrelation(matrix: number[][]): number {
  const n = matrix.length;
  if (n < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += matrix[i]![j]!;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ────────────────────────────────────────────────────────────────
// Metrics
// ────────────────────────────────────────────────────────────────

/**
 * All metrics from a combined portfolio curve.
 *
 * `correlation` is optional — when omitted (or a 0/1 sized matrix is
 * passed) `avgPairwiseCorrelation` reports 0. Callers that already
 * have the per-strategy returns (via `combinePortfolio`) should pass
 * the correlation matrix in so the metric is meaningful.
 */
export function computeMetrics(
  curve: readonly EquityPoint[],
  startCapital = 100_000,
  correlation: number[][] = [],
): PortfolioMetrics {
  if (curve.length < 2) {
    return zeroMetrics(startCapital);
  }
  const start = curve[0]!.b;
  const end = curve[curve.length - 1]!.b;
  const balances = curve.map((p) => p.b);
  const timestamps = curve.map((p) => Date.parse(p.t));

  // Drawdown depth + duration walk: at each point note whether we're
  // below the running peak; track the longest contiguous underwater
  // stretch and the total time spent underwater (in ms). Pairs with
  // the depth-only max DD that already lived here.
  let peak = balances[0]!;
  let maxDD = 0;
  let maxDDpct = 0;
  let underwaterStartIdx = -1;
  let longestUnderwaterMs = 0;
  let totalUnderwaterMs = 0;
  for (let i = 0; i < balances.length; i++) {
    const v = balances[i]!;
    if (v >= peak) {
      // Just hit (or stayed at) a new peak — close any open
      // underwater stretch.
      if (underwaterStartIdx >= 0) {
        const stretch =
          timestamps[i]! - timestamps[underwaterStartIdx]!;
        if (stretch > longestUnderwaterMs) {
          longestUnderwaterMs = stretch;
        }
        totalUnderwaterMs += stretch;
        underwaterStartIdx = -1;
      }
      peak = v;
    } else {
      if (underwaterStartIdx < 0) underwaterStartIdx = i;
      const dd = peak - v;
      const ddPct = peak > 0 ? dd / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (ddPct > maxDDpct) maxDDpct = ddPct;
    }
  }
  // Close a still-open underwater stretch at the end of the series.
  if (underwaterStartIdx >= 0) {
    const stretch =
      timestamps[balances.length - 1]! - timestamps[underwaterStartIdx]!;
    if (stretch > longestUnderwaterMs) longestUnderwaterMs = stretch;
    totalUnderwaterMs += stretch;
  }

  // Per-step returns
  const returns: number[] = new Array(balances.length - 1);
  for (let i = 1; i < balances.length; i++) {
    const prev = balances[i - 1]!;
    returns[i - 1] = prev > 0 ? balances[i]! / prev - 1 : 0;
  }

  // Annualisation factor: derived from the actual span (years between
  // first and last timestamp) rather than assuming daily samples,
  // because the unified timeline contains per-deal points whose
  // cadence varies wildly across portfolios.
  const spanMs =
    timestamps[timestamps.length - 1]! - timestamps[0]!;
  const yearsSpan = spanMs > 0 ? spanMs / (365.25 * 86_400_000) : 1;
  const periodsPerYear =
    yearsSpan > 0 ? returns.length / yearsSpan : returns.length;

  const meanR = mean(returns);
  const stdR = stdev(returns);
  const sharpe =
    stdR > 0 && periodsPerYear > 0
      ? (meanR / stdR) * Math.sqrt(periodsPerYear)
      : 0;

  // Sortino — same shape as Sharpe but downside-only volatility.
  // Treats only negative excess returns as risk; rewards strategies
  // with asymmetric (right-skewed) return distributions.
  const downsideRs = returns.filter((r) => r < 0);
  const downsideStd =
    downsideRs.length > 1
      ? Math.sqrt(
          downsideRs.reduce((acc, r) => acc + r * r, 0) / downsideRs.length,
        )
      : 0;
  const sortino =
    downsideStd > 0 && periodsPerYear > 0
      ? (meanR / downsideStd) * Math.sqrt(periodsPerYear)
      : 0;

  const totalReturn = start > 0 ? end / start - 1 : 0;
  const annualisedReturn =
    yearsSpan > 0 && start > 0
      ? Math.pow(end / start, 1 / yearsSpan) - 1
      : totalReturn;
  const calmar =
    maxDDpct > 0 ? (annualisedReturn * 100) / (maxDDpct * 100) : 0;
  const recovery = maxDD > 0 ? (end - start) / maxDD : 0;

  const avgCorr =
    correlation.length > 1 ? avgPairwiseCorrelation(correlation) : 0;

  return {
    netPnl: end - start,
    netPnlPct: totalReturn * 100,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDpct * 100,
    sharpe,
    sortino,
    calmar,
    recovery,
    longestUnderwaterDays: longestUnderwaterMs / (86_400_000),
    timeUnderwaterPct:
      spanMs > 0 ? (totalUnderwaterMs / spanMs) * 100 : 0,
    avgPairwiseCorrelation: avgCorr,
    startCapital: start,
    endCapital: end,
  };
}

function zeroMetrics(startCapital: number): PortfolioMetrics {
  return {
    netPnl: 0,
    netPnlPct: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    sharpe: 0,
    sortino: 0,
    calmar: 0,
    recovery: 0,
    longestUnderwaterDays: 0,
    timeUnderwaterPct: 0,
    avgPairwiseCorrelation: 0,
    startCapital,
    endCapital: startCapital,
  };
}

function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / xs.length);
}

// ────────────────────────────────────────────────────────────────
// Score
// ────────────────────────────────────────────────────────────────

export function pickScore(m: PortfolioMetrics, key: ScoreKey): number {
  switch (key) {
    case 'sharpe':
      return m.sharpe;
    case 'sortino':
      return m.sortino;
    case 'calmar':
      return m.calmar;
    case 'recovery':
      return m.recovery;
  }
}

export function scoreLabel(key: ScoreKey): string {
  switch (key) {
    case 'sharpe':
      return 'Sharpe';
    case 'sortino':
      return 'Sortino';
    case 'calmar':
      return 'Calmar';
    case 'recovery':
      return 'Recovery';
  }
}

// ────────────────────────────────────────────────────────────────
// Combinations + ranking
// ────────────────────────────────────────────────────────────────

/**
 * Yield every k-subset of `arr` lexicographically. Used by the
 * optimizer to walk the combination space without materialising it.
 */
function* combinations<T>(arr: readonly T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k < 1 || k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]!);
    // advance — find rightmost index that can be incremented
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i] = (idx[i] ?? 0) + 1;
    for (let j = i + 1; j < k; j++) idx[j] = (idx[j - 1] ?? 0) + 1;
  }
}

/**
 * Exhaustive search across all (sizeMin..sizeMax)-subsets of
 * `candidates`. Each subset is scored under equal weights; the top
 * `topN` are returned sorted by score descending.
 *
 * Caller is responsible for capping `candidates` to a tractable
 * pool (we recommend ≤15). C(15,5) = 3003 — runs in well under a
 * second on a modern laptop.
 */
export function findBestPortfolios(
  opts: OptimizeOptions,
): RankedPortfolio[] {
  const {
    candidates,
    sizeMin,
    sizeMax,
    topN,
    score,
    startCapital = 100_000,
  } = opts;
  if (candidates.length < sizeMin) return [];
  const all: RankedPortfolio[] = [];

  const upperK = Math.min(sizeMax, candidates.length);
  const lowerK = Math.max(sizeMin, 2);
  for (let k = lowerK; k <= upperK; k++) {
    for (const combo of combinations(candidates, k)) {
      const weights = new Array<number>(k).fill(1 / k);
      const { curve, correlation } = combinePortfolio(
        combo,
        weights,
        startCapital,
      );
      const metrics = computeMetrics(curve, startCapital, correlation);
      const s = pickScore(metrics, score);
      // Skip degenerate or NaN scores — they pollute the leaderboard.
      if (!Number.isFinite(s)) continue;
      all.push({
        testIds: combo.map((t) => t.id),
        weights,
        curve,
        correlation,
        metrics,
        score: s,
      });
    }
  }

  all.sort((a, b) => b.score - a.score);
  return all.slice(0, topN);
}
