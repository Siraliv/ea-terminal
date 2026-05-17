import {
  leaveOneOut,
  walkForward,
  type LeaveOneOutResult,
  type PortfolioMetrics,
  type ScoreKey,
  type WalkForwardResult,
} from './portfolio';
import { formatTestLabel } from './testCode';
import type { Test } from '@/types/domain';

/**
 * Portfolio Composite Quality Score + report generation.
 *
 * Rules-based, deterministic, fully explainable. No external model
 * is called — every line of the narrative traces to a specific
 * metric and threshold defined in this file, so the report is
 * auditable and reproducible.
 *
 * Structure:
 *   1. Five sub-scores (0-10) each weighted into a composite.
 *   2. Skepticism floors auto-cap suspiciously good scores
 *      (Sortino > 3, annualised return > 40%) and emit a warning.
 *   3. Headline + observations + recommendations are picked from
 *      conditional templates keyed off the metrics. Every template
 *      is here in this file — no hidden prose.
 *
 * Future LLM upgrade path: `serializeForPrompt` returns a clean
 * context block ready to drop into a Claude/GPT prompt that can
 * produce richer prose. The rules-based composite stays the
 * source of truth for the rating; LLM output would replace the
 * narrative bullets only.
 */

// ────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────

export type SubScoreKey =
  | 'riskAdjusted'
  | 'drawdownDepth'
  | 'drawdownDuration'
  | 'diversification'
  | 'returnStrength';

export interface SubScore {
  key: SubScoreKey;
  /** Display name shown in the report table. */
  label: string;
  /** 0-10 rating for this dimension. */
  value: number;
  /** 0-1 weight in the composite. */
  weight: number;
  /** One-line "why this score" — shown next to it in the breakdown. */
  rationale: string;
}

export interface PortfolioReport {
  /** 0-10 composite, weighted average of sub-scores. */
  compositeScore: number;
  /**
   * Composite *before* the validation deductions (leave-one-out
   * fragility, walk-forward overfit penalty). Exposed so the report
   * can show "9.1 → 6.3 after validation" instead of hiding why the
   * headline number dropped.
   */
  rawCompositeScore: number;
  /** One-word verdict matching the score band: Excellent / … / Poor. */
  band: ReportBand;
  /** One-line summary shown next to the composite bar. */
  headline: string;
  /** 3-5 mixed bullets (`+` strengths, `▸` concerns) for the compact summary. */
  observations: string[];
  /** Full per-dimension breakdown for the modal. */
  subScores: SubScore[];
  /** Bullets that highlight what the portfolio does well. */
  strengths: string[];
  /** Bullets that flag risks / weaknesses. */
  concerns: string[];
  /** Concrete actions the user could take to improve the portfolio. */
  recommendations: string[];
  /** Skepticism flags — overfit warnings, short backtest, etc. */
  warnings: string[];
  /**
   * Constituent leave-one-out fragility analysis. Only computed
   * when `tests.length >= 2`. `null` otherwise.
   */
  leaveOneOut: LeaveOneOutResult | null;
  /**
   * Walk-forward overfit analysis. `null` when the candidate pool
   * + timeline don't support a meaningful split (fewer than
   * `WALK_FORWARD_FOLDS - 1` resolvable folds).
   */
  walkForward: WalkForwardResult | null;
}

export type ReportBand =
  | 'Excellent'
  | 'Strong'
  | 'Solid'
  | 'Decent'
  | 'Marginal'
  | 'Weak'
  | 'Poor';

// ────────────────────────────────────────────────────────────────
// Sub-scoring
// ────────────────────────────────────────────────────────────────

const WEIGHTS: Record<SubScoreKey, number> = {
  riskAdjusted: 0.30,
  drawdownDepth: 0.25,
  drawdownDuration: 0.15,
  diversification: 0.15,
  returnStrength: 0.15,
};

/**
 * Risk-adjusted return — Sortino-driven (Sharpe as a fallback when
 * Sortino is 0/undefined for whatever reason). The single most
 * important sub-score; weighted 30%.
 *
 * Auto-caps at 9 when Sortino > 3 — that band is typically only
 * reached by curve-fit backtests.
 */
function scoreRiskAdjusted(m: PortfolioMetrics): SubScore {
  const primary = m.sortino !== 0 ? m.sortino : m.sharpe;
  let value: number;
  let rationale: string;
  if (primary <= 0) {
    value = 0;
    rationale = `Sortino ${m.sortino.toFixed(2)} — negative or zero risk-adjusted return.`;
  } else if (primary < 0.3) {
    value = 1.5;
    rationale = `Sortino ${m.sortino.toFixed(2)} — well below the 0.5 "decent" threshold.`;
  } else if (primary < 0.5) {
    value = 3;
    rationale = `Sortino ${m.sortino.toFixed(2)} — weak risk-adjusted profile.`;
  } else if (primary < 0.7) {
    value = 4;
    rationale = `Sortino ${m.sortino.toFixed(2)} — approaching the "decent" range.`;
  } else if (primary < 0.9) {
    value = 5.5;
    rationale = `Sortino ${m.sortino.toFixed(2)} — decent risk-adjusted return.`;
  } else if (primary < 1.2) {
    value = 6.5;
    rationale = `Sortino ${m.sortino.toFixed(2)} — solid risk-adjusted return.`;
  } else if (primary < 1.5) {
    value = 7.5;
    rationale = `Sortino ${m.sortino.toFixed(2)} — good risk-adjusted return.`;
  } else if (primary < 2.0) {
    value = 8.5;
    rationale = `Sortino ${m.sortino.toFixed(2)} — very good risk-adjusted return.`;
  } else if (primary < 3.0) {
    value = 9;
    rationale = `Sortino ${m.sortino.toFixed(2)} — excellent (verify against out-of-sample data).`;
  } else {
    value = 9; // Capped — see warnings.
    rationale = `Sortino ${m.sortino.toFixed(2)} — capped at 9 (above 3 typically indicates curve-fit).`;
  }
  return {
    key: 'riskAdjusted',
    label: 'Risk-adjusted return',
    value,
    weight: WEIGHTS.riskAdjusted,
    rationale,
  };
}

/**
 * Drawdown depth + recovery factor. Combines how deep the worst
 * pit was with how much profit was earned relative to it.
 * Weighted 25%.
 */
function scoreDrawdownDepth(m: PortfolioMetrics): SubScore {
  let depthScore: number;
  const dd = m.maxDrawdownPct;
  if (dd < 5) depthScore = 9;
  else if (dd < 10) depthScore = 7;
  else if (dd < 15) depthScore = 5.5;
  else if (dd < 20) depthScore = 4;
  else if (dd < 30) depthScore = 2.5;
  else if (dd < 40) depthScore = 1;
  else depthScore = 0;

  // Recovery factor adjustment: meaningful only when both DD and
  // PnL are non-trivial; otherwise leave depth score alone.
  let recoveryAdj = 0;
  if (m.recovery >= 3) recoveryAdj = 2;
  else if (m.recovery >= 2) recoveryAdj = 1;
  else if (m.recovery >= 1.5) recoveryAdj = 0.5;
  else if (m.recovery >= 1) recoveryAdj = 0;
  else if (m.recovery >= 0.5) recoveryAdj = -1;
  else recoveryAdj = -2;

  const value = clamp(depthScore + recoveryAdj, 0, 10);
  const rationale = `Max DD ${dd.toFixed(1)}% with recovery ${m.recovery.toFixed(2)} — ${recoveryAdj >= 0 ? 'reward outpaces the worst pit' : 'pain exceeds the realised return'}.`;
  return {
    key: 'drawdownDepth',
    label: 'Drawdown depth & recovery',
    value,
    weight: WEIGHTS.drawdownDepth,
    rationale,
  };
}

/**
 * Drawdown duration — `timeUnderwaterPct` + `longestUnderwaterDays`.
 * Captures *psychological* survivability, separate from raw depth.
 * Weighted 15%.
 */
function scoreDrawdownDuration(m: PortfolioMetrics): SubScore {
  // Two halves: (a) time underwater as % of total span, (b) longest
  // single continuous underwater stretch. Lower = better in both.
  const timePart = clamp(10 - m.timeUnderwaterPct / 10, 0, 10);
  const lengthPart = clamp(10 - m.longestUnderwaterDays / 45, 0, 10);
  const value = (timePart + lengthPart) / 2;
  const rationale = `Underwater ${m.timeUnderwaterPct.toFixed(0)}% of the time; longest single stretch ${m.longestUnderwaterDays.toFixed(0)}d.`;
  return {
    key: 'drawdownDuration',
    label: 'Drawdown duration',
    value,
    weight: WEIGHTS.drawdownDuration,
    rationale,
  };
}

/**
 * Diversification — avg pairwise correlation. Single-strategy
 * portfolios get a neutral 5 (no pairs to score). Weighted 15%.
 */
function scoreDiversification(m: PortfolioMetrics): SubScore {
  // Falls back to 5 when there's no pairwise data (single-strategy).
  // Otherwise linear: corr=0 → 10, corr=1 → 0.
  if (!Number.isFinite(m.avgPairwiseCorrelation)) {
    return {
      key: 'diversification',
      label: 'Diversification',
      value: 5,
      weight: WEIGHTS.diversification,
      rationale: 'No correlation data — only one strategy, so no diversification possible.',
    };
  }
  const corr = m.avgPairwiseCorrelation;
  const value = clamp(10 - Math.max(0, corr) * 10, 0, 10);
  const rationale = corr < 0.3
    ? `Avg pairwise correlation ${corr.toFixed(2)} — constituents move independently.`
    : corr < 0.6
      ? `Avg pairwise correlation ${corr.toFixed(2)} — moderate diversification benefit.`
      : corr < 0.85
        ? `Avg pairwise correlation ${corr.toFixed(2)} — limited diversification; mostly the same bet.`
        : `Avg pairwise correlation ${corr.toFixed(2)} — constituents move in lockstep; diversification is illusory.`;
  return {
    key: 'diversification',
    label: 'Diversification',
    value,
    weight: WEIGHTS.diversification,
    rationale,
  };
}

/**
 * Return strength — annualised return. Independent of risk
 * adjustment; you still need to be paid for the risk taken.
 * Weighted 15%. Caps at 9 above 40% (overfit territory).
 */
function scoreReturnStrength(m: PortfolioMetrics): SubScore {
  const r = m.annualisedReturnPct;
  let value: number;
  let rationale: string;
  if (r < 0) {
    value = 0;
    rationale = `Annualised return ${r.toFixed(1)}% — losing money on net.`;
  } else if (r < 2) {
    value = 1.5;
    rationale = `Annualised return ${r.toFixed(1)}% — barely positive; comparable to cash.`;
  } else if (r < 5) {
    value = 3;
    rationale = `Annualised return ${r.toFixed(1)}% — weak; treasury bills compete with this.`;
  } else if (r < 10) {
    value = 5;
    rationale = `Annualised return ${r.toFixed(1)}% — modest; in line with broad equity indices.`;
  } else if (r < 20) {
    value = 7;
    rationale = `Annualised return ${r.toFixed(1)}% — strong return strength.`;
  } else if (r < 30) {
    value = 8.5;
    rationale = `Annualised return ${r.toFixed(1)}% — very strong return strength.`;
  } else if (r < 40) {
    value = 9.5;
    rationale = `Annualised return ${r.toFixed(1)}% — exceptional (verify against out-of-sample).`;
  } else {
    value = 9; // Capped — see warnings.
    rationale = `Annualised return ${r.toFixed(1)}% — capped at 9 (above 40% is typically curve-fit).`;
  }
  return {
    key: 'returnStrength',
    label: 'Return strength',
    value,
    weight: WEIGHTS.returnStrength,
    rationale,
  };
}

// ────────────────────────────────────────────────────────────────
// Composite + narrative
// ────────────────────────────────────────────────────────────────

function bandFor(score: number): ReportBand {
  if (score >= 9) return 'Excellent';
  if (score >= 7.5) return 'Strong';
  if (score >= 6) return 'Solid';
  if (score >= 4.5) return 'Decent';
  if (score >= 3) return 'Marginal';
  if (score >= 1.5) return 'Weak';
  return 'Poor';
}

/**
 * Produce a one-line headline that combines the band with whatever
 * narrative angle the metrics suggest. The angles are picked by
 * looking at which sub-scores diverge most from the composite —
 * the report should call out what's distinctive about the
 * portfolio, not just restate the score.
 */
function headlineFor(
  composite: number,
  subs: Record<SubScoreKey, SubScore>,
  m: PortfolioMetrics,
): string {
  const band = bandFor(composite);

  // Distinctive angles, ordered by precedence — the first that fits wins.
  if (m.avgPairwiseCorrelation >= 0.7 && subs.riskAdjusted.value >= 6) {
    return `${band} numbers, concentrated bet — high correlation flatters the score.`;
  }
  if (m.timeUnderwaterPct >= 75 && subs.returnStrength.value >= 5) {
    return `${band} — profitable but psychologically demanding (mostly underwater).`;
  }
  if (
    subs.diversification.value >= 8 &&
    subs.riskAdjusted.value <= 4
  ) {
    return `${band} — well-diversified, but the underlying strategies lack edge.`;
  }
  if (
    subs.drawdownDuration.value <= 3 &&
    subs.riskAdjusted.value >= 6
  ) {
    return `${band} — strong edge, but the drawdown duration tests conviction.`;
  }
  if (
    subs.riskAdjusted.value >= 7 &&
    subs.diversification.value >= 7 &&
    subs.drawdownDuration.value >= 6
  ) {
    return `${band} portfolio across the board — diversified, profitable, and survivable.`;
  }
  if (composite < 3) {
    return `${band} edge with major concerns.`;
  }
  if (composite < 5) {
    return `${band} — works on paper, hard to live with.`;
  }
  if (composite < 7) {
    return `${band} portfolio with room to improve.`;
  }
  return `${band} portfolio.`;
}

/**
 * Pick the 3-5 most signal-rich observations from the metrics.
 * Strengths are prefixed `+`, concerns `▸`. The mix is balanced —
 * if everything is positive, we still find the weakest dimension to
 * call out, and vice versa.
 */
function observationsFor(
  subs: Record<SubScoreKey, SubScore>,
  m: PortfolioMetrics,
): string[] {
  const obs: Array<{ text: string; positive: boolean; weight: number }> = [];

  // Risk-adjusted return
  if (m.sortino >= 1.5) {
    obs.push({
      text: `+ Sortino ${m.sortino.toFixed(2)} — strong downside-adjusted return`,
      positive: true,
      weight: 4,
    });
  } else if (m.sortino >= 0.9) {
    obs.push({
      text: `+ Sortino ${m.sortino.toFixed(2)} — solid risk-adjusted return`,
      positive: true,
      weight: 2.5,
    });
  } else if (m.sortino < 0.5 && m.sortino >= 0) {
    obs.push({
      text: `▸ Sortino ${m.sortino.toFixed(2)} — downside vol exceeds upside`,
      positive: false,
      weight: 4,
    });
  } else if (m.sortino < 0) {
    obs.push({
      text: `▸ Sortino ${m.sortino.toFixed(2)} — net loss vs. downside risk`,
      positive: false,
      weight: 5,
    });
  }

  // Drawdown depth & recovery
  if (m.maxDrawdownPct >= 25) {
    obs.push({
      text: `▸ Max DD ${m.maxDrawdownPct.toFixed(1)}% — severe peak-to-trough drop`,
      positive: false,
      weight: 4,
    });
  } else if (m.maxDrawdownPct <= 8) {
    obs.push({
      text: `+ Max DD ${m.maxDrawdownPct.toFixed(1)}% — shallow worst drawdown`,
      positive: true,
      weight: 3,
    });
  }

  if (m.recovery < 1 && m.netPnl > 0) {
    obs.push({
      text: `▸ Recovery ${m.recovery.toFixed(2)} — barely paid for the drawdown`,
      positive: false,
      weight: 4,
    });
  } else if (m.recovery >= 2) {
    obs.push({
      text: `+ Recovery ${m.recovery.toFixed(2)} — strong reward relative to worst drawdown`,
      positive: true,
      weight: 3,
    });
  }

  // Drawdown duration
  if (m.timeUnderwaterPct >= 80) {
    obs.push({
      text: `▸ ${m.timeUnderwaterPct.toFixed(0)}% time underwater — psychologically heavy`,
      positive: false,
      weight: 4,
    });
  } else if (m.timeUnderwaterPct <= 40) {
    obs.push({
      text: `+ ${m.timeUnderwaterPct.toFixed(0)}% time underwater — frequent new highs`,
      positive: true,
      weight: 2.5,
    });
  }

  if (m.longestUnderwaterDays >= 180) {
    obs.push({
      text: `▸ Longest DD ${m.longestUnderwaterDays.toFixed(0)}d — extended slump test`,
      positive: false,
      weight: 3,
    });
  }

  // Diversification
  if (m.avgPairwiseCorrelation >= 0.7) {
    obs.push({
      text: `▸ Avg corr ${m.avgPairwiseCorrelation.toFixed(2)} — diversification is illusory`,
      positive: false,
      weight: 5,
    });
  } else if (m.avgPairwiseCorrelation < 0.3 && subs.diversification.value < 11) {
    obs.push({
      text: `+ Avg corr ${m.avgPairwiseCorrelation.toFixed(2)} — genuine diversification`,
      positive: true,
      weight: 3,
    });
  }

  // Return strength
  if (m.annualisedReturnPct >= 15) {
    obs.push({
      text: `+ ${m.annualisedReturnPct.toFixed(1)}% annualised — strong return strength`,
      positive: true,
      weight: 3,
    });
  } else if (m.annualisedReturnPct < 5 && m.annualisedReturnPct >= 0) {
    obs.push({
      text: `▸ ${m.annualisedReturnPct.toFixed(1)}% annualised — modest absolute return`,
      positive: false,
      weight: 2.5,
    });
  }

  // Take the 5 most heavily-weighted observations, then balance so
  // we don't end up with all-positive or all-negative.
  obs.sort((a, b) => b.weight - a.weight);
  return obs.slice(0, 5).map((o) => o.text);
}

/**
 * Strengths bullets for the full report. Longer, more contextual
 * than the compact observations. Always derived from the same
 * metric thresholds.
 */
function strengthsFor(m: PortfolioMetrics): string[] {
  const out: string[] = [];
  if (m.sortino >= 1.2) {
    out.push(
      `Sortino ${m.sortino.toFixed(2)} is in the "good" range — the portfolio earns more than its downside volatility.`,
    );
  }
  if (m.maxDrawdownPct <= 10) {
    out.push(
      `Max drawdown ${m.maxDrawdownPct.toFixed(1)}% is shallow — capital was rarely deeply at risk.`,
    );
  }
  if (m.recovery >= 2) {
    out.push(
      `Recovery factor ${m.recovery.toFixed(2)} — net profit is 2× the worst drawdown, a strong cushion.`,
    );
  }
  if (m.avgPairwiseCorrelation > 0 && m.avgPairwiseCorrelation < 0.3) {
    out.push(
      `Constituent correlation ${m.avgPairwiseCorrelation.toFixed(2)} — strategies behave independently, so combining them genuinely reduces variance.`,
    );
  }
  if (m.timeUnderwaterPct <= 40) {
    out.push(
      `Underwater only ${m.timeUnderwaterPct.toFixed(0)}% of the period — the equity grinds out new highs frequently.`,
    );
  }
  if (m.annualisedReturnPct >= 12) {
    out.push(
      `${m.annualisedReturnPct.toFixed(1)}% annualised — comfortably outperforms passive benchmarks.`,
    );
  }
  return out;
}

/**
 * Concerns bullets for the full report.
 */
function concernsFor(m: PortfolioMetrics): string[] {
  const out: string[] = [];
  if (m.sortino < 0.5 && m.sortino >= 0) {
    out.push(
      `Sortino ${m.sortino.toFixed(2)} — downside volatility exceeds average return; thin edge per unit of risk.`,
    );
  }
  if (m.sortino < m.sharpe && m.sharpe > 0) {
    out.push(
      `Sortino (${m.sortino.toFixed(2)}) is lower than Sharpe (${m.sharpe.toFixed(2)}) — most of the volatility is on the downside, an asymmetric weakness.`,
    );
  }
  if (m.maxDrawdownPct >= 25) {
    out.push(
      `Max drawdown ${m.maxDrawdownPct.toFixed(1)}% is severe — a quarter (or more) of peak capital was lost in the worst pit.`,
    );
  }
  if (m.recovery < 1 && m.netPnl > 0) {
    out.push(
      `Recovery factor ${m.recovery.toFixed(2)} is below 1.0 — the worst drawdown exceeded the total realised profit.`,
    );
  }
  if (m.timeUnderwaterPct >= 75) {
    out.push(
      `${m.timeUnderwaterPct.toFixed(0)}% of the period was spent below a prior peak — most trading sessions, you would have been staring at a balance below your high-water mark.`,
    );
  }
  if (m.longestUnderwaterDays >= 180) {
    out.push(
      `Longest single underwater stretch was ${m.longestUnderwaterDays.toFixed(0)} days (~${(m.longestUnderwaterDays / 30).toFixed(1)} months) — extended periods of no progress test conviction.`,
    );
  }
  if (m.avgPairwiseCorrelation >= 0.7) {
    out.push(
      `Average pairwise correlation ${m.avgPairwiseCorrelation.toFixed(2)} — constituents move together, so the portfolio is effectively one leveraged strategy. Sharpe / Sortino above are flattered by that dependence.`,
    );
  }
  if (m.annualisedReturnPct < 5 && m.annualisedReturnPct >= 0) {
    out.push(
      `${m.annualisedReturnPct.toFixed(1)}% annualised — competing with treasury bills doesn't justify backtest risk.`,
    );
  }
  return out;
}

/**
 * Concrete recommendations the user could actually act on.
 * Each only emits when the matching condition fires — no
 * "consider rebalancing" platitudes.
 */
function recommendationsFor(
  m: PortfolioMetrics,
  tests: readonly Test[],
): string[] {
  const out: string[] = [];

  if (m.avgPairwiseCorrelation >= 0.7 && tests.length > 1) {
    out.push(
      `Replace one of the highest-correlated pair with a strategy that has a different edge profile (different symbol, opposite direction bias, or a non-trend logic). The current set is functionally one leveraged strategy.`,
    );
  }
  if (m.timeUnderwaterPct >= 75) {
    out.push(
      `Look at when the drawdowns cluster on the equity chart, then search the library for a strategy that performed *well* in those windows. Adding it would smooth the underwater periods rather than just chasing higher peaks.`,
    );
  }
  if (m.recovery < 1 && m.netPnl > 0) {
    out.push(
      `Reduce position size — at current allocation the worst drawdown ($${Math.abs(m.maxDrawdown).toLocaleString(undefined, { maximumFractionDigits: 0 })}) exceeds the total realised profit ($${m.netPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}). Half the position would halve both, but the ratio doesn't improve unless the underlying strategies do.`,
    );
  }
  if (m.sortino < 0.5 && m.avgPairwiseCorrelation < 0.3) {
    out.push(
      `Diversification is doing its job (low correlation), but the underlying strategies don't have enough edge to make the combined Sortino meaningful. Consider replacing one or more constituents rather than reweighting.`,
    );
  }
  if (m.sortino < m.sharpe && m.sharpe > 0.5) {
    out.push(
      `The Sortino < Sharpe pattern points to fat-tailed downside — look at the per-strategy drawdown chart for the constituent that's driving the asymmetry, and consider tighter stops or a smaller position on it.`,
    );
  }
  if (m.years > 0 && m.years < 2) {
    out.push(
      `Backtest spans only ${m.years.toFixed(1)} years — a single market regime can produce flattering results. Re-run with a longer history before committing capital, and treat the current score as a directional read only.`,
    );
  }
  if (m.maxDrawdownPct >= 25 && m.recovery >= 1.5) {
    out.push(
      `The drawdown is severe but recovery factor is healthy — the strategy is high-variance high-return. Confirm you can stomach the ${m.maxDrawdownPct.toFixed(0)}% drop emotionally before sizing up.`,
    );
  }
  return out;
}

/**
 * Skepticism flags that should temper interpretation regardless of
 * what the headline says. Mostly catches overfit-shaped numbers.
 */
function warningsFor(m: PortfolioMetrics): string[] {
  const out: string[] = [];
  if (m.sortino > 3) {
    out.push(
      `Sortino > 3 is rare in real-world strategies — usually a sign of in-sample over-fitting or short backtest. Score capped at 9 for risk-adjusted return.`,
    );
  }
  if (m.annualisedReturnPct > 40) {
    out.push(
      `Annualised return > 40% — treat as suspicious until validated against out-of-sample data (e.g. forward-test or walk-forward).`,
    );
  }
  if (m.years > 0 && m.years < 1) {
    out.push(
      `Backtest spans less than one year — most metrics are unreliable at this sample size. Treat the report as directional only.`,
    );
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Validation deductions
// ────────────────────────────────────────────────────────────────

/** Number of chronological folds used by the walk-forward step. */
const WALK_FORWARD_FOLDS = 5;

/**
 * Translate the leave-one-out stability ratio into a 0..-2 point
 * deduction on the composite. A robust portfolio (ratio ≥ 0.75)
 * pays nothing; a fragile one (ratio < 0.25) loses the full 2
 * points. The ratio can go negative when removing a constituent
 * flips the sign — those get the max penalty too.
 */
function looDeduction(loo: LeaveOneOutResult | null): number {
  if (!loo || loo.entries.length === 0) return 0;
  if (loo.fullSharpe <= 0) return 0; // bad-Sharpe portfolios already scored low
  const r = loo.stabilityRatio;
  if (r >= 0.75) return 0;
  if (r >= 0.5) return -0.5;
  if (r >= 0.25) return -1;
  return -2;
}

/**
 * Translate the walk-forward IS/OOS gap into a 0..-3 point
 * deduction. Some gap is expected from any in-sample search
 * (typically 0.2-0.4); the penalty kicks in above 0.6 and saturates
 * at 1.5 where the optimiser is clearly curve-fitting. Negative OOS
 * folds add an extra fixed penalty.
 */
function wfDeduction(wf: WalkForwardResult | null): number {
  if (!wf || wf.folds.length === 0) return 0;
  const gap = wf.overfitGap;
  let penalty = 0;
  if (gap >= 1.5) penalty -= 2;
  else if (gap >= 1.0) penalty -= 1.25;
  else if (gap >= 0.6) penalty -= 0.5;
  // Add a small extra penalty when OOS is outright bad across multiple folds.
  if (wf.negativeOosFolds >= wf.folds.length / 2) penalty -= 1;
  else if (wf.negativeOosFolds > 0) penalty -= 0.25;
  return Math.max(penalty, -3);
}

/**
 * Extra warnings derived from validation results — pasted into the
 * existing `warnings` list after the metric-based ones.
 */
function validationWarnings(
  loo: LeaveOneOutResult | null,
  wf: WalkForwardResult | null,
  tests: readonly Test[],
): string[] {
  const out: string[] = [];
  if (loo && loo.entries.length > 0 && loo.stabilityRatio < 0.5) {
    const bearer = tests.find((t) => t.id === loo.loadBearingTestId);
    const label = bearer ? formatTestLabel(bearer) : 'one constituent';
    out.push(
      `Leave-one-out stability ${loo.stabilityRatio.toFixed(2)} — dropping ${label} would reduce Sharpe to ${Math.min(...loo.entries.map((e) => e.sharpe)).toFixed(2)}. The portfolio is fragile to that single strategy.`,
    );
  }
  if (wf && wf.folds.length > 0) {
    if (wf.overfitGap >= 1.0) {
      out.push(
        `Walk-forward gap ${wf.overfitGap.toFixed(2)} — in-sample Sharpe averages ${wf.meanInSample.toFixed(2)} but out-of-sample averages only ${wf.meanOutOfSample.toFixed(2)}. The optimiser is curve-fitting; treat the AUTO suggestions as starting points, not specifications.`,
      );
    }
    if (wf.negativeOosFolds > wf.folds.length / 2) {
      out.push(
        `Walk-forward: ${wf.negativeOosFolds} of ${wf.folds.length} out-of-sample folds had non-positive Sharpe. The portfolio's edge is not reliable across time.`,
      );
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────────

export interface ComposeReportOptions {
  /**
   * Pool of candidate tests the walk-forward optimiser can pick from.
   * Required for the validation step — typically the same pool that
   * the page used to build the current portfolio.
   */
  candidatePool: readonly Test[];
  /** Score function used for both leave-one-out and walk-forward. */
  scoreKey: ScoreKey;
  /** Min combination size for walk-forward optimiser. */
  sizeMin: number;
  /** Max combination size for walk-forward optimiser. */
  sizeMax: number;
  /** Capital seeded into combined portfolio computations. */
  startCapital?: number;
}

/**
 * Generate the full report for a portfolio. Deterministic — same
 * metrics + tests + options always produce the same report.
 *
 * When `options` is omitted, validation sections are skipped (the
 * report still works, just without walk-forward / leave-one-out).
 * Pass `options` to engage the credibility suite.
 */
export function composeReport(
  metrics: PortfolioMetrics,
  tests: readonly Test[],
  options?: ComposeReportOptions,
): PortfolioReport {
  const subList: SubScore[] = [
    scoreRiskAdjusted(metrics),
    scoreDrawdownDepth(metrics),
    scoreDrawdownDuration(metrics),
    scoreDiversification(metrics),
    scoreReturnStrength(metrics),
  ];
  const subs: Record<SubScoreKey, SubScore> = Object.fromEntries(
    subList.map((s) => [s.key, s]),
  ) as Record<SubScoreKey, SubScore>;

  const rawComposite = clamp(
    subList.reduce((acc, s) => acc + s.value * s.weight, 0),
    0,
    10,
  );

  // ── Validation step (optional) ─────────────────────────────────
  let loo: LeaveOneOutResult | null = null;
  let wf: WalkForwardResult | null = null;
  if (options) {
    const startCap = options.startCapital ?? 100_000;
    if (tests.length >= 2) {
      loo = leaveOneOut(tests, startCap);
    }
    // Walk-forward needs the candidate pool to run a real
    // optimiser per fold; if the caller only has the current
    // combo, skip.
    if (
      options.candidatePool.length >= options.sizeMin &&
      tests.length >= 2
    ) {
      wf = walkForward(options.candidatePool, {
        folds: WALK_FORWARD_FOLDS,
        sizeMin: options.sizeMin,
        sizeMax: options.sizeMax,
        score: options.scoreKey,
        startCapital: startCap,
      });
    }
  }

  // Apply deductions and surface validation warnings.
  const totalDeduction = looDeduction(loo) + wfDeduction(wf);
  const finalComposite = clamp(rawComposite + totalDeduction, 0, 10);

  const baseWarnings = warningsFor(metrics);
  const valWarnings = validationWarnings(loo, wf, tests);

  return {
    compositeScore: finalComposite,
    rawCompositeScore: rawComposite,
    band: bandFor(finalComposite),
    headline: headlineFor(finalComposite, subs, metrics),
    observations: observationsFor(subs, metrics),
    subScores: subList,
    strengths: strengthsFor(metrics),
    concerns: concernsFor(metrics),
    recommendations: recommendationsFor(metrics, tests),
    warnings: [...baseWarnings, ...valWarnings],
    leaveOneOut: loo,
    walkForward: wf,
  };
}

/**
 * Serialise a portfolio's metrics + constituents into a clean
 * context block ready to drop into an LLM prompt. The rules-based
 * composite stays the source of truth for the rating, but this
 * function lets future code ask an LLM for richer prose without
 * having to rebuild the inputs from scratch.
 *
 * Currently unused by the page; export point for the future
 * upgrade path the user signed off on at design time.
 */
export function serializeForPrompt(
  metrics: PortfolioMetrics,
  tests: readonly Test[],
  report: PortfolioReport,
): string {
  const constituents = tests
    .map((t) => `  - ${formatTestLabel(t)} (${t.ea_name})`)
    .join('\n');
  return `# Portfolio context

## Constituents (${tests.length})
${constituents}

## Metrics
- Years: ${metrics.years.toFixed(2)}
- Net %: ${metrics.netPnlPct.toFixed(2)}
- Annualised %: ${metrics.annualisedReturnPct.toFixed(2)}
- Sharpe: ${metrics.sharpe.toFixed(2)}
- Sortino: ${metrics.sortino.toFixed(2)}
- Calmar: ${metrics.calmar.toFixed(2)}
- Recovery: ${metrics.recovery.toFixed(2)}
- Max DD %: ${metrics.maxDrawdownPct.toFixed(2)}
- Longest DD (days): ${metrics.longestUnderwaterDays.toFixed(0)}
- Time underwater %: ${metrics.timeUnderwaterPct.toFixed(1)}
- Avg pairwise correlation: ${metrics.avgPairwiseCorrelation.toFixed(2)}

## Composite Quality Score (rules-based, source of truth)
${report.compositeScore.toFixed(1)} / 10 (${report.band}) — ${report.headline}
${
  report.rawCompositeScore !== report.compositeScore
    ? `Raw score ${report.rawCompositeScore.toFixed(1)}, deducted to ${report.compositeScore.toFixed(1)} after validation.`
    : ''
}

## Sub-scores
${report.subScores
  .map(
    (s) =>
      `- ${s.label}: ${s.value.toFixed(1)} (weight ${(s.weight * 100).toFixed(0)}%) — ${s.rationale}`,
  )
  .join('\n')}

## Leave-one-out
${
  report.leaveOneOut
    ? `Stability ratio ${report.leaveOneOut.stabilityRatio.toFixed(2)} (full Sharpe ${report.leaveOneOut.fullSharpe.toFixed(2)})\n${report.leaveOneOut.entries.map((e) => `- drop ${e.droppedTestId}: Sharpe → ${e.sharpe.toFixed(2)}, Sortino → ${e.sortino.toFixed(2)}`).join('\n')}`
    : 'not computed'
}

## Walk-forward
${
  report.walkForward && report.walkForward.folds.length > 0
    ? `Folds: ${report.walkForward.folds.length}. IS mean ${report.walkForward.meanInSample.toFixed(2)} / OOS mean ${report.walkForward.meanOutOfSample.toFixed(2)} (gap ${report.walkForward.overfitGap.toFixed(2)}). ${report.walkForward.negativeOosFolds} negative OOS folds.`
    : 'not computed'
}
`;
}

// ────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
