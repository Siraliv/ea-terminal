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

/**
 * Allocation scheme used when combining N constituents into a
 * portfolio.
 *
 *   - `equal` — `1/N` per constituent. The simplest baseline; no
 *     view on which strategy is "better" than another.
 *   - `inverseVol` — weights proportional to `1 / σ_i` then
 *     normalised to sum to 1. Steady (low-vol) strategies get more
 *     capital; volatile ones get less. A pragmatic risk-parity-lite.
 *   - `markowitz` — mean-variance tangency portfolio that maximises
 *     in-sample Sharpe given the empirical return covariance.
 *     **Long-only via project-and-renormalise**: negative raw
 *     weights are clipped to zero and the rest re-normalised. Not
 *     truly optimal under the constraint (a real QP would be), but
 *     close enough for 2-5 strategy portfolios. Notoriously
 *     overfit-prone — the walk-forward step will surface this when
 *     it bites.
 */
export type WeightScheme = 'equal' | 'inverseVol' | 'markowitz';

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
  /**
   * Span of the combined curve in calendar years. Used by the
   * report layer to convert raw `netPnlPct` into an annualised
   * return (and to flag suspiciously-short backtest windows).
   */
  years: number;
  /**
   * Compound annual growth rate (CAGR) over `years`, expressed as
   * a percentage. Honest version of "return per year" — accounts
   * for compounding rather than naïve `netPnlPct / years`.
   */
  annualisedReturnPct: number;
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
  /**
   * How capital is allocated across constituents in each candidate
   * combination. Default `equal`. Markowitz / inverseVol can lift
   * raw in-sample scores but are typically more overfit-prone —
   * the walk-forward step in the report will surface this.
   */
  weightScheme?: WeightScheme;
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
 * Build the unified-timeline per-strategy return arrays without
 * combining them. Used by weight-computation routines (Markowitz,
 * inverse-vol) that need each strategy's return series before any
 * weights exist.
 */
function alignReturns(tests: readonly Test[]): {
  timeline: number[];
  returnsPerStep: number[][];
  initial: number[];
} {
  const { timeline, balances, initial } = alignCurves(tests);
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
  return { timeline, returnsPerStep, initial };
}

// ────────────────────────────────────────────────────────────────
// Weighting schemes
// ────────────────────────────────────────────────────────────────

/**
 * Inverse-volatility weights: each constituent gets capital
 * proportional to `1 / σ_i`, then we normalise so the weights sum
 * to 1. Steady strategies are larger; high-vol strategies get
 * fewer dollars. Falls back to equal weights when any σ is
 * effectively zero (no variation in returns).
 */
export function inverseVolWeights(
  returnsPerStep: readonly (readonly number[])[],
): number[] {
  const n = returnsPerStep.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const sigmas = returnsPerStep.map((r) => stdev(r));
  const anyZero = sigmas.some((s) => s < 1e-10);
  if (anyZero) return new Array(n).fill(1 / n);
  const inv = sigmas.map((s) => 1 / s);
  const sum = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / sum);
}

/**
 * Markowitz mean-variance tangency portfolio — the long-only
 * project-and-renormalise approximation:
 *
 *   1. Compute mean-return vector μ and covariance matrix Σ.
 *   2. Solve unconstrained: w_raw = Σ⁻¹ μ.
 *   3. Clip negatives to zero (no short selling).
 *   4. Re-normalise so weights sum to 1.
 *
 * For 2-5 constituent portfolios this approximation is close
 * enough; a true QP would be slightly better but adds substantial
 * complexity for marginal gains.
 *
 * Failure modes (fallback to inverse-vol):
 *   - Σ is singular (perfectly correlated strategies).
 *   - All raw weights are non-positive (no positive Markowitz
 *     solution under the long-only constraint).
 */
export function markowitzWeights(
  returnsPerStep: readonly (readonly number[])[],
): number[] {
  const n = returnsPerStep.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const mu = returnsPerStep.map((r) => mean(r));
  const sigma = covarianceMatrix(returnsPerStep, mu);

  // Tiny diagonal regulariser — prevents singular-matrix failures
  // when constituents are very highly correlated. ε is small enough
  // that it doesn't materially change weights in well-conditioned
  // cases.
  const eps = 1e-8;
  for (let i = 0; i < n; i++) sigma[i]![i] += eps;

  const sigmaInv = matInv(sigma);
  if (!sigmaInv) return inverseVolWeights(returnsPerStep);

  const raw = sigmaInv.map((row) =>
    row.reduce((acc, v, j) => acc + v * mu[j]!, 0),
  );
  const clipped = raw.map((x) => Math.max(0, x));
  const sum = clipped.reduce((a, b) => a + b, 0);
  if (sum < 1e-10) return inverseVolWeights(returnsPerStep);
  return clipped.map((x) => x / sum);
}

/**
 * Top-level entry point: pick a weighting scheme by name and
 * compute the actual weights for the given tests. Returns
 * `[1, 1, ..., 1] / N` as the safe fallback for any error path.
 */
export function computeWeights(
  tests: readonly Test[],
  scheme: WeightScheme,
): number[] {
  const n = tests.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  if (scheme === 'equal') return new Array(n).fill(1 / n);
  const { returnsPerStep } = alignReturns(tests);
  if (scheme === 'inverseVol') return inverseVolWeights(returnsPerStep);
  if (scheme === 'markowitz') return markowitzWeights(returnsPerStep);
  return new Array(n).fill(1 / n);
}

/** Pearson covariance matrix from aligned per-strategy returns. */
function covarianceMatrix(
  returnsPerStep: readonly (readonly number[])[],
  meansOpt?: readonly number[],
): number[][] {
  const n = returnsPerStep.length;
  const means = meansOpt ?? returnsPerStep.map((r) => mean(r));
  const out: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0),
  );
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const a = returnsPerStep[i]!;
      const b = returnsPerStep[j]!;
      const len = Math.min(a.length, b.length);
      if (len === 0) continue;
      let cov = 0;
      for (let k = 0; k < len; k++) {
        cov += (a[k]! - means[i]!) * (b[k]! - means[j]!);
      }
      cov /= len;
      out[i]![j] = cov;
      out[j]![i] = cov;
    }
  }
  return out;
}

/**
 * Gauss-Jordan matrix inversion for small N (≤ 16). Returns null
 * when the matrix is singular (within tolerance). Caller is
 * expected to apply a tiny diagonal regulariser before invoking if
 * the input could be near-singular.
 */
function matInv(m: readonly (readonly number[])[]): number[][] | null {
  const n = m.length;
  if (n === 0) return [];
  // Build the [M | I] augmented matrix as a mutable working copy.
  const aug: number[][] = m.map((row, i) => {
    const id = new Array(n).fill(0) as number[];
    id[i] = 1;
    return [...row, ...id];
  });
  for (let i = 0; i < n; i++) {
    let rowI = aug[i]!;
    let pivot = rowI[i]!;
    if (Math.abs(pivot) < 1e-12) {
      let swapped = false;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k]![i]!) > 1e-12) {
          const tmp = aug[i]!;
          aug[i] = aug[k]!;
          aug[k] = tmp;
          rowI = aug[i]!;
          pivot = rowI[i]!;
          swapped = true;
          break;
        }
      }
      if (!swapped) return null;
    }
    for (let j = 0; j < 2 * n; j++) rowI[j] = rowI[j]! / pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const rowK = aug[k]!;
      const factor = rowK[i]!;
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) {
        rowK[j] = rowK[j]! - factor * rowI[j]!;
      }
    }
  }
  return aug.map((row) => row.slice(n));
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
    years: yearsSpan,
    annualisedReturnPct: annualisedReturn * 100,
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
    years: 0,
    annualisedReturnPct: 0,
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
    weightScheme = 'equal',
  } = opts;
  if (candidates.length < sizeMin) return [];
  const all: RankedPortfolio[] = [];

  const upperK = Math.min(sizeMax, candidates.length);
  const lowerK = Math.max(sizeMin, 2);
  for (let k = lowerK; k <= upperK; k++) {
    for (const combo of combinations(candidates, k)) {
      const weights = computeWeights(combo, weightScheme);
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

// ────────────────────────────────────────────────────────────────
// Search: enumerate all combos (slim, metrics-only)
// ────────────────────────────────────────────────────────────────

export interface SearchEntry {
  /** Constituent test ids in display order. */
  testIds: string[];
  /** Allocation weights matching `testIds`. */
  weights: number[];
  /** Computed metrics for this combo at equal-or-chosen weights. */
  metrics: PortfolioMetrics;
  /** Primary ranking score (under the supplied `score` key). */
  score: number;
}

/**
 * Enumerate every combination in the search space and return a slim
 * entry per combo (metrics + score, no curve/correlation). Used by
 * the Pareto frontier chart which needs all ~5,000 combos but can't
 * afford to keep their full equity curves in memory.
 *
 * Same loop semantics as `findBestPortfolios`; the heavier function
 * is now just `searchAllPortfolios` + augment-with-curve on the
 * surviving top-N.
 */
export function searchAllPortfolios(opts: OptimizeOptions): SearchEntry[] {
  const {
    candidates,
    sizeMin,
    sizeMax,
    score,
    startCapital = 100_000,
    weightScheme = 'equal',
  } = opts;
  if (candidates.length < sizeMin) return [];
  const out: SearchEntry[] = [];
  const upperK = Math.min(sizeMax, candidates.length);
  const lowerK = Math.max(sizeMin, 2);
  for (let k = lowerK; k <= upperK; k++) {
    for (const combo of combinations(candidates, k)) {
      const weights = computeWeights(combo, weightScheme);
      const { curve, correlation } = combinePortfolio(
        combo,
        weights,
        startCapital,
      );
      const metrics = computeMetrics(curve, startCapital, correlation);
      const s = pickScore(metrics, score);
      if (!Number.isFinite(s)) continue;
      out.push({
        testIds: combo.map((t) => t.id),
        weights,
        metrics,
        score: s,
      });
    }
  }
  return out;
}

/**
 * Walk a flat list of (risk, return) points and return only those
 * on the upper-left Pareto frontier — for each risk level, no
 * other point achieves a higher return at equal or lower risk.
 *
 * Used by the Pareto frontier chart to connect "efficient" portfolios
 * with a line that traces the achievable risk/return frontier.
 *
 * Returns the frontier subset in ascending-risk order.
 */
export function paretoFrontier<T>(
  items: readonly T[],
  riskOf: (t: T) => number,
  returnOf: (t: T) => number,
): T[] {
  const sorted = items
    .slice()
    .sort((a, b) => riskOf(a) - riskOf(b));
  const frontier: T[] = [];
  let bestReturn = -Infinity;
  for (const it of sorted) {
    const r = returnOf(it);
    if (r > bestReturn) {
      frontier.push(it);
      bestReturn = r;
    }
  }
  return frontier;
}

// ────────────────────────────────────────────────────────────────
// Decomposition: monthly returns + constituent contributions
// ────────────────────────────────────────────────────────────────

export interface MonthlyReturn {
  year: number;
  /** 0 = Jan, 11 = Dec. */
  month: number;
  /** Return for that month as a percentage. */
  returnPct: number;
}

/**
 * Bucket an equity curve into calendar months (UTC) and compute
 * each month's return as `endBalance / prevMonthEndBalance - 1`.
 *
 * Returns one entry per month for which we can compute a return
 * (i.e. every month after the first). The first month of the
 * series has no prior to compare against and is omitted.
 */
export function monthlyReturns(
  curve: readonly EquityPoint[],
): MonthlyReturn[] {
  if (curve.length < 2) return [];
  // Keep the latest sample for each (year, month) bucket — that's
  // the "end-of-month" balance for return calculations.
  const lastInMonth = new Map<
    string,
    { ts: number; b: number; year: number; month: number }
  >();
  for (const p of curve) {
    const ts = Date.parse(p.t);
    if (!Number.isFinite(ts)) continue;
    const d = new Date(ts);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${month}`;
    const existing = lastInMonth.get(key);
    if (!existing || ts > existing.ts) {
      lastInMonth.set(key, { ts, b: p.b, year, month });
    }
  }
  const months = Array.from(lastInMonth.values()).sort(
    (a, b) => a.ts - b.ts,
  );
  const out: MonthlyReturn[] = [];
  for (let i = 1; i < months.length; i++) {
    const prev = months[i - 1]!;
    const cur = months[i]!;
    const ret = prev.b > 0 ? cur.b / prev.b - 1 : 0;
    out.push({ year: cur.year, month: cur.month, returnPct: ret * 100 });
  }
  return out;
}

export interface ConstituentContribution {
  testId: string;
  /** Cumulative % of starting capital this constituent has produced. */
  series: { t: string; v: number }[];
}

/**
 * Decompose a portfolio's cumulative return into per-constituent
 * contributions, in % of starting capital.
 *
 * At each timestep, each constituent's dollar gain is
 *   contribution_k = weight_k × return_k × portfolio_equity_prev
 * Accumulated over time, the sum of constituent contributions equals
 * the portfolio's cumulative dollar gain (exact, not approximate)
 * because the weights are applied to per-step returns before
 * compounding.
 *
 * The result is suitable for a stacked-area chart: stacking each
 * constituent's series gives the total portfolio return curve.
 */
export function constituentContributions(
  tests: readonly Test[],
  weights: readonly number[],
  startCapital = 100_000,
): ConstituentContribution[] {
  if (tests.length === 0) return [];
  if (tests.length !== weights.length) {
    throw new Error('weights length must match tests length');
  }
  const { timeline, returnsPerStep } = alignReturns(tests);
  if (timeline.length === 0) return [];

  const cum = new Array(tests.length).fill(0);
  let equity = startCapital;
  const out: ConstituentContribution[] = tests.map((t) => ({
    testId: t.id,
    series: [{ t: new Date(timeline[0]!).toISOString(), v: 0 }],
  }));

  for (let i = 1; i < timeline.length; i++) {
    let stepReturn = 0;
    for (let k = 0; k < tests.length; k++) {
      const r = returnsPerStep[k]?.[i] ?? 0;
      const dollarContrib = (weights[k] ?? 0) * r * equity;
      cum[k] += dollarContrib;
      stepReturn += (weights[k] ?? 0) * r;
    }
    equity = equity * (1 + stepReturn);
    const tIso = new Date(timeline[i]!).toISOString();
    for (let k = 0; k < tests.length; k++) {
      // Express in % of the original starting capital, so summing
      // bands gives portfolio total return %.
      out[k]!.series.push({
        t: tIso,
        v: startCapital > 0 ? (cum[k]! / startCapital) * 100 : 0,
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Validation: leave-one-out + walk-forward
// ────────────────────────────────────────────────────────────────

export interface LeaveOneOutEntry {
  /** Test id that was dropped from the portfolio. */
  droppedTestId: string;
  /** Sharpe of the remaining constituents (equal-weighted). */
  sharpe: number;
  /** Sortino of the remaining constituents. */
  sortino: number;
}

export interface LeaveOneOutResult {
  /** One entry per constituent. */
  entries: LeaveOneOutEntry[];
  /**
   * Stability ratio = (minimum Sharpe across leave-one-out drops) ÷
   * (Sharpe of the full portfolio). Close to 1 = robust (no single
   * constituent is load-bearing); close to 0 (or negative) = fragile
   * (the portfolio's score depends heavily on one constituent).
   */
  stabilityRatio: number;
  /** Sharpe of the full portfolio (denominator of stabilityRatio). */
  fullSharpe: number;
  /** Test id of the load-bearing constituent (whose removal hurts most). */
  loadBearingTestId: string | null;
}

/**
 * Drop each constituent in turn, recompute Sharpe & Sortino on the
 * remaining N-1 strategies (equal-weighted), and report which drops
 * hurt the score most.
 *
 * Single-constituent inputs return an empty result — there's nothing
 * to "drop" without going to zero strategies.
 */
export function leaveOneOut(
  tests: readonly Test[],
  startCapital = 100_000,
  weightScheme: WeightScheme = 'equal',
): LeaveOneOutResult {
  if (tests.length < 2) {
    return {
      entries: [],
      stabilityRatio: 1,
      fullSharpe: 0,
      loadBearingTestId: null,
    };
  }

  // Full-portfolio Sharpe as the denominator. Reweighting under the
  // same scheme keeps the comparison apples-to-apples: under
  // Markowitz, dropping a constituent re-derives weights for the
  // remaining set, which is what you'd actually do in practice.
  const fullWeights = computeWeights(tests, weightScheme);
  const full = combinePortfolio(tests, fullWeights, startCapital);
  const fullMetrics = computeMetrics(full.curve, startCapital, full.correlation);
  const fullSharpe = fullMetrics.sharpe;

  const entries: LeaveOneOutEntry[] = tests.map((dropped, i) => {
    const remaining = tests.filter((_, k) => k !== i);
    const weights = computeWeights(remaining, weightScheme);
    const { curve, correlation } = combinePortfolio(
      remaining,
      weights,
      startCapital,
    );
    const m = computeMetrics(curve, startCapital, correlation);
    return {
      droppedTestId: dropped.id,
      sharpe: m.sharpe,
      sortino: m.sortino,
    };
  });

  // Stability ratio: minimum Sharpe across drops vs full. Guard
  // against zero-Sharpe full portfolios (would explode the ratio);
  // in that case report 1 (everything's equally meaningless).
  const minSharpe = Math.min(...entries.map((e) => e.sharpe));
  const stabilityRatio =
    Math.abs(fullSharpe) > 0.001 ? minSharpe / fullSharpe : 1;

  // Load-bearing = constituent whose removal produces the lowest
  // remaining Sharpe. Null tie-breaker shouldn't happen in practice.
  let loadBearingTestId: string | null = null;
  let worst = Infinity;
  for (const e of entries) {
    if (e.sharpe < worst) {
      worst = e.sharpe;
      loadBearingTestId = e.droppedTestId;
    }
  }

  return { entries, stabilityRatio, fullSharpe, loadBearingTestId };
}

export interface WalkForwardFold {
  /** 1-based fold number. */
  fold: number;
  /** ISO date of the start of the out-of-sample window. */
  oosStart: string;
  /** ISO date of the end of the OOS window. */
  oosEnd: string;
  /** Test ids of the combination chosen on in-sample data. */
  chosenTestIds: string[];
  /** Score of the chosen combo on in-sample data. */
  inSampleScore: number;
  /** Score of the same combo on out-of-sample data. */
  outOfSampleScore: number;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  /** Mean IS score across folds. */
  meanInSample: number;
  /** Mean OOS score across folds. */
  meanOutOfSample: number;
  /**
   * IS − OOS. Large positive numbers signal in-sample over-fitting —
   * the optimiser is picking combos that work on training data but
   * don't generalise. Negative values suggest the optimiser is
   * conservative or the test windows have a regime tailwind.
   */
  overfitGap: number;
  /** Number of folds where the OOS score was non-positive. */
  negativeOosFolds: number;
}

/**
 * Walk-forward validation for portfolio optimisation.
 *
 * Splits the timeline into K chronological folds. For each fold k
 * from 2..K (the first fold is too thin to optimise on):
 *   1. In-sample window = all data from fold 1..k-1.
 *   2. Optimise the portfolio using only IS data — find the best
 *      combination via `findBestPortfolios` with the supplied
 *      candidates, sizes, and score.
 *   3. Take that combo's test ids and re-evaluate it on the fold k
 *      out-of-sample data.
 *   4. Record IS and OOS scores.
 *
 * The aggregate IS/OOS gap is the credibility number: a healthy
 * optimiser produces a gap close to 0; an over-fit one widens the
 * gap dramatically. Even a "decent" gap of 0.3-0.6 is the price of
 * any in-sample search, but anything above 1.0 is a red flag.
 *
 * Cost: K-1 optimiser runs of `findBestPortfolios`, each over a
 * slightly larger IS slice. With K=5 and the page-default pool of
 * 15 candidates × sizes 2-5, that's roughly 4 × 5,000 combos =
 * 20,000 portfolio evaluations — runs in well under 5s.
 */
export function walkForward(
  candidates: readonly Test[],
  options: {
    folds: number;
    sizeMin: number;
    sizeMax: number;
    score: ScoreKey;
    startCapital?: number;
    weightScheme?: WeightScheme;
  },
): WalkForwardResult {
  const {
    folds: foldCount,
    sizeMin,
    sizeMax,
    score,
    startCapital = 100_000,
    weightScheme = 'equal',
  } = options;

  // Bail when we don't have enough data to meaningfully split.
  if (candidates.length < sizeMin || foldCount < 2) {
    return {
      folds: [],
      meanInSample: 0,
      meanOutOfSample: 0,
      overfitGap: 0,
      negativeOosFolds: 0,
    };
  }

  // Build the full timeline from the union of candidate curves.
  const timeline = unionTimeline(candidates);
  if (timeline.length < foldCount * 2) {
    return {
      folds: [],
      meanInSample: 0,
      meanOutOfSample: 0,
      overfitGap: 0,
      negativeOosFolds: 0,
    };
  }

  // Chronological fold boundaries by equal time slicing (not equal
  // point counts) — keeps each fold a comparable calendar window
  // regardless of how the deals are distributed.
  const tStart = timeline[0]!;
  const tEnd = timeline[timeline.length - 1]!;
  const span = tEnd - tStart;
  const boundaries: number[] = Array.from(
    { length: foldCount + 1 },
    (_, i) => tStart + (span * i) / foldCount,
  );

  const fold_results: WalkForwardFold[] = [];

  for (let k = 1; k < foldCount; k++) {
    const isEnd = boundaries[k]!;
    const oosStart = boundaries[k]!;
    const oosEnd = boundaries[k + 1]!;

    // Build IS / OOS slices of each candidate's curve.
    const isCandidates = candidates
      .map((t) => sliceTestByTime(t, tStart, isEnd))
      .filter((t) => t.equity_curve.length >= 2);
    const oosCandidatesById = new Map(
      candidates
        .map((t) => sliceTestByTime(t, oosStart, oosEnd))
        .filter((t) => t.equity_curve.length >= 2)
        .map((t) => [t.id, t]),
    );

    if (isCandidates.length < sizeMin) continue;

    // Optimise on IS only — same weighting scheme the page is using.
    const isTop = findBestPortfolios({
      candidates: isCandidates,
      sizeMin,
      sizeMax,
      topN: 1,
      score,
      startCapital,
      weightScheme,
    });
    const winner = isTop[0];
    if (!winner) continue;

    // Re-evaluate the winning combo on the OOS slice. Skip the fold
    // entirely if any constituent has no OOS data — we can't fairly
    // score a portfolio that didn't trade in that window.
    const oosTests = winner.testIds.map((id) => oosCandidatesById.get(id));
    if (oosTests.some((t) => !t)) continue;

    // OOS weights are recomputed from the OOS slice under the same
    // scheme so the comparison is honest — equal-weight portfolios
    // stay equal; Markowitz reweights against the OOS covariance.
    const oosWeights = computeWeights(oosTests as Test[], weightScheme);
    const { curve: oosCurve, correlation: oosCorr } = combinePortfolio(
      oosTests as Test[],
      oosWeights,
      startCapital,
    );
    const oosMetrics = computeMetrics(oosCurve, startCapital, oosCorr);
    const oosScore = pickScore(oosMetrics, score);

    fold_results.push({
      fold: k,
      oosStart: new Date(oosStart).toISOString(),
      oosEnd: new Date(oosEnd).toISOString(),
      chosenTestIds: winner.testIds,
      inSampleScore: Number.isFinite(winner.score) ? winner.score : 0,
      outOfSampleScore: Number.isFinite(oosScore) ? oosScore : 0,
    });
  }

  if (fold_results.length === 0) {
    return {
      folds: [],
      meanInSample: 0,
      meanOutOfSample: 0,
      overfitGap: 0,
      negativeOosFolds: 0,
    };
  }

  const meanIS =
    fold_results.reduce((a, f) => a + f.inSampleScore, 0) /
    fold_results.length;
  const meanOOS =
    fold_results.reduce((a, f) => a + f.outOfSampleScore, 0) /
    fold_results.length;
  const negative = fold_results.filter(
    (f) => f.outOfSampleScore <= 0,
  ).length;

  return {
    folds: fold_results,
    meanInSample: meanIS,
    meanOutOfSample: meanOOS,
    overfitGap: meanIS - meanOOS,
    negativeOosFolds: negative,
  };
}

/**
 * Union of all timestamps across a candidate set. Same logic used
 * by `alignCurves`; exposed here as a helper so walk-forward can
 * partition the same timeline the combiner uses.
 */
function unionTimeline(tests: readonly Test[]): number[] {
  const s = new Set<number>();
  for (const t of tests) {
    for (const p of t.equity_curve) {
      const ts = Date.parse(p.t);
      if (Number.isFinite(ts)) s.add(ts);
    }
  }
  return Array.from(s).sort((a, b) => a - b);
}

/**
 * Return a shallow-cloned Test whose `equity_curve` is restricted
 * to points in `[startMs, endMs)`. Used by walk-forward to slice
 * candidates into IS / OOS windows without mutating the originals.
 */
function sliceTestByTime(t: Test, startMs: number, endMs: number): Test {
  const clipped = t.equity_curve.filter((p) => {
    const ts = Date.parse(p.t);
    return Number.isFinite(ts) && ts >= startMs && ts < endMs;
  });
  return { ...t, equity_curve: clipped };
}
