import type { Json } from '@/types/database';
import type { Test } from '@/types/domain';
import { ALL_YEARS, type YearFilter } from './yearFilter';

/**
 * Project a `Test` onto a single calendar year.
 *
 * Inputs:
 *   - `t`: a Test row with its persisted (LTTB-downsampled) curve.
 *   - `year`: the calendar year (UTC) to slice on.
 *
 * Outputs: a `Test`-shaped object whose `equity_curve` is clipped to
 * the year and whose headline / compound metrics are recomputed from
 * that clipped curve.
 *
 * **Caveat.** The persisted curve is ~500 points across the *full*
 * backtest period. A 1-year slice of a 10-year backtest is ~50
 * points, so Net PnL and max drawdown stay decent approximations
 * but profit factor / win rate / streak counts derived from
 * delta-by-delta walks are coarser than MT5's per-deal numbers.
 * Treat the scoped output as a directional comparison, not a
 * specification-grade audit. The UI surfaces this with a hint chip.
 */
export function projectToYear(t: Test, year: number): Test {
  const yStart = Date.UTC(year, 0, 1);
  const yEnd = Date.UTC(year + 1, 0, 1);
  const inYear = t.equity_curve.filter((p) => {
    const ts = Date.parse(p.t);
    return Number.isFinite(ts) && ts >= yStart && ts < yEnd;
  });

  if (inYear.length < 2) {
    // Not enough points to derive anything meaningful. Null out all
    // headline metrics so the test naturally drops out of any
    // `t[rankBy] != null` filter on the dashboard.
    return {
      ...t,
      equity_curve: inYear,
      total_net_profit: null,
      profit_factor: null,
      balance_dd_max_pct: null,
      equity_dd_max_pct: null,
      total_trades: null,
      win_rate: null,
      // Strip the consecutive-streak compound metrics so stale
      // full-period values don't leak into the histograms.
      results: stripConsecutive(t.results),
    };
  }

  // ── Walk deltas ──
  let posSum = 0;
  let negSum = 0;
  let wins = 0;
  let losses = 0;
  let maxStreakWins = 0;
  let maxStreakLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  let curWinsVal = 0;
  let curLossesVal = 0;
  let maxWinsVal = 0;
  let maxLossesVal = 0;
  for (let i = 1; i < inYear.length; i++) {
    const delta = inYear[i]!.b - inYear[i - 1]!.b;
    if (delta > 0) {
      wins++;
      posSum += delta;
      curWins++;
      curWinsVal += delta;
      if (curWins > maxStreakWins) {
        maxStreakWins = curWins;
        maxWinsVal = curWinsVal;
      }
      curLosses = 0;
      curLossesVal = 0;
    } else if (delta < 0) {
      losses++;
      negSum += -delta;
      curLosses++;
      curLossesVal += delta; // negative
      if (curLosses > maxStreakLosses) {
        maxStreakLosses = curLosses;
        maxLossesVal = curLossesVal;
      }
      curWins = 0;
      curWinsVal = 0;
    }
    // delta === 0 → ignored (no trade impact between samples).
  }

  const totalTrades = wins + losses;
  const netProfit =
    inYear[inYear.length - 1]!.b - inYear[0]!.b;
  const profitFactor = negSum > 0 ? posSum / negSum : null;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : null;

  // Peak-to-trough drawdown inside the window, as a % of the running
  // peak balance. Matches MT5's `Balance Drawdown Maximal` definition
  // applied to the scoped subset.
  let peak = inYear[0]!.b;
  let maxDD = 0;
  for (const p of inYear) {
    if (p.b > peak) peak = p.b;
    if (peak > 0) {
      const dd = ((peak - p.b) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }

  const scopedResults: Record<string, Json> = {
    ...stripConsecutive(t.results),
    'Maximum consecutive wins ($)': {
      count: maxStreakWins,
      value: round2(maxWinsVal),
    },
    'Maximum consecutive losses ($)': {
      count: maxStreakLosses,
      value: round2(maxLossesVal),
    },
  };

  return {
    ...t,
    equity_curve: inYear,
    total_net_profit: round2(netProfit),
    profit_factor: profitFactor != null ? round4(profitFactor) : null,
    balance_dd_max_pct: round2(maxDD),
    // MT5 distinguishes balance vs equity drawdown using intra-bar
    // equity dips we don't have access to from a balance curve.
    // Surface the same scoped balance DD under both keys — better
    // than a hard null when the user is comparing year over year.
    equity_dd_max_pct: round2(maxDD),
    total_trades: totalTrades,
    win_rate: winRate != null ? round2(winRate) : null,
    results: scopedResults,
  };
}

/**
 * Convenience wrapper: identity when `filter === ALL_YEARS`,
 * otherwise calls `projectToYear`.
 */
export function applyYearScope(t: Test, filter: YearFilter): Test {
  if (filter === ALL_YEARS) return t;
  return projectToYear(t, filter);
}

function stripConsecutive(
  results: Record<string, Json>,
): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(results)) {
    if (
      k === 'Maximum consecutive wins ($)' ||
      k === 'Maximum consecutive losses ($)'
    ) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
