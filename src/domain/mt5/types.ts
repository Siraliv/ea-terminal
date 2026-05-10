/**
 * Types for the MT5 Strategy Tester report parser.
 *
 * The two entry parsers (`parseMt5XlsxBuffer`, `parseMt5HtmlString`) both
 * produce `Mt5Normalised`, so downstream code (Upload page, persist hook)
 * is format-agnostic.
 */

/** Identity / "who, what, when" — one row's worth of headline columns. */
export interface Mt5Identity {
  /** "US_SD_CON_MPS_TP_LIN_(v020525)" */
  expertName: string;
  /** "v020525" — pulled from `(vDDMMYY)` suffix when present, else null. */
  eaVersion: string | null;
  /** "US30_SPREAD_MEDIUM" */
  symbol: string;
  /** "H1" — the timeframe token from the Period field, when present. */
  timeframe: string | null;
  /** ISO date "2015-01-01" or null. */
  periodStart: string | null;
  /** ISO date "2025-12-29" or null. */
  periodEnd: string | null;
  /** Broker company, e.g. "Raw Trading Ltd". */
  broker: string | null;
  /** Account currency, e.g. "USD". */
  currency: string | null;
  /** Initial account deposit, e.g. 100000. */
  initialDeposit: number | null;
  /** "1:100" */
  leverage: string | null;
}

/**
 * MT5 emits some metrics as compound strings like
 * `"42 524.84 (14.26%)"` — a numeric value followed by a percentage
 * in parens. We expose both pieces.
 */
export interface Mt5ValuePct {
  value: number;
  pct: number;
}

/** `"844 (59.36%)"` — a count followed by a percentage. */
export interface Mt5CountPct {
  count: number;
  pct: number;
}

/** `"16 (26 299.93)"` — a count followed by a numeric value. */
export interface Mt5CountValue {
  count: number;
  value: number;
}

export type Mt5MetricValue =
  | number
  | string
  | Mt5ValuePct
  | Mt5CountPct
  | Mt5CountValue
  | null;

/** Free-form bag of every metric row in the Results block. */
export type Mt5Results = Record<string, Mt5MetricValue>;

/** Single point on an equity curve. */
export interface EquityPoint {
  /** ISO 8601 timestamp e.g. "2015-01-02T16:00:03.000Z". */
  t: string;
  /** Running account balance after this deal. */
  b: number;
}

/**
 * Promoted metrics that get their own typed columns on the `tests`
 * Postgres row (so we can sort/rank without GIN-querying the JSONB).
 */
export interface Mt5Headline {
  totalNetProfit: number | null;
  profitFactor: number | null;
  expectedPayoff: number | null;
  recoveryFactor: number | null;
  sharpeRatio: number | null;
  /** Balance Drawdown Maximal — the percentage component. */
  balanceDdMaxPct: number | null;
  /** Equity Drawdown Maximal — the percentage component. */
  equityDdMaxPct: number | null;
  totalTrades: number | null;
  /** profit_trades_count / total_trades, 0..100. */
  winRate: number | null;
}

export interface Mt5Normalised {
  identity: Mt5Identity;
  /** Parsed `key=value` inputs from the EA. */
  inputs: Record<string, string | number | boolean>;
  /** All ~50 results metrics in their parsed forms. */
  results: Mt5Results;
  /** Promoted columns. */
  headline: Mt5Headline;
  /** Full-resolution equity curve, one point per deal. */
  equityCurveRaw: EquityPoint[];
  /** LTTB-downsampled equity curve, ~500 points. */
  equityCurveDownsampled: EquityPoint[];
  sourceFormat: 'xlsx' | 'html';
  sourceFilename: string;
}
