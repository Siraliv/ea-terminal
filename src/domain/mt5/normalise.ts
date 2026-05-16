import type {
  EquityPoint,
  Mt5CountPct,
  Mt5CountValue,
  Mt5Headline,
  Mt5Identity,
  Mt5MetricValue,
  Mt5Normalised,
  Mt5Results,
  Mt5ValuePct,
} from './types';
import { downsampleEquityCurve } from './lttb';

/**
 * Intermediate shape both parsers (xlsx and html) produce. The
 * normalisation step turns this into the persisted `Mt5Normalised`
 * record (with typed identity, headline metrics, and a downsampled
 * curve).
 */
export interface Mt5Raw {
  /** D4 — "US_SD_CON_MPS_TP_LIN_(v020525)" */
  expert: string;
  /** D5 — "US30_SPREAD_MEDIUM" */
  symbol: string;
  /** D6 — "H1 (2015.01.01 - 2025.12.29)" */
  period: string;
  broker: string | null;
  currency: string | null;
  initialDeposit: number | null;
  leverage: string | null;

  /** Map of EA input name → string value (left as raw strings; we
   *  coerce numbers/booleans during normalisation). */
  inputsRaw: Record<string, string>;

  /** Label → value, with values still in mixed forms (numbers, raw
   *  parenthetical strings). The normaliser parses the strings. */
  resultsRaw: Record<string, string | number>;

  /** Equity curve points pulled from the deals table, full resolution. */
  equityCurveRaw: EquityPoint[];

  sourceFormat: 'xlsx' | 'html';
  sourceFilename: string;
}

/**
 * Match a `vDDMMYY` version token anywhere in the EA name.
 *
 * Convention: a lower-case `v` followed by exactly six digits where
 * the digits encode a day-month-year (`040525` = 4 May '25). Lives
 * inside parens, after an underscore, after a hyphen, or as the
 * leading token — any non-letter boundary on the left side works.
 *
 *   ✓ `US_SD_CON_MPS_TP_LIN_(v020525)` → 020525
 *   ✓ `SD_REV_MPS_SL_LIN_v040525`      → 040525
 *   ✓ `v040525_VARIANT`                → 040525
 *   ✗ `mover123456`                    → letter before `v` blocks it
 *   ✗ `v1234567`                       → 7th digit blocks it
 *   ✗ `v999999`                        → caught by the DDMMYY validator
 */
const VERSION_RE = /(?:^|[^A-Za-z])v(\d{6})(?!\d)/i;

/** Day 01-31, month 01-12, year 00-99 — guards against false `vNNNNNN` matches. */
function isValidDdmmyy(s: string): boolean {
  if (s.length !== 6) return false;
  const d = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  const y = Number(s.slice(4, 6));
  return (
    Number.isInteger(d) &&
    Number.isInteger(m) &&
    Number.isInteger(y) &&
    d >= 1 &&
    d <= 31 &&
    m >= 1 &&
    m <= 12 &&
    y >= 0 &&
    y <= 99
  );
}
const PERIOD_RE =
  /^\s*([A-Za-z0-9]+)\s*\(\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*-\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*\)/;

/** Robust number parse — tolerates `"42 524.84"` (NBSP/space thousands). */
export function parseLooseNumber(s: string): number | null {
  if (s == null) return null;
  // Strip thousands separators (regular space, NBSP, NNBSP, comma).
  const cleaned = s.replace(/[\s\u00A0\u202F,]/g, '').replace(/^\+/, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse a percentage like `"14.26%"`. */
function parsePercent(s: string): number | null {
  return parseLooseNumber(s.replace('%', ''));
}

/**
 * Parse `"42 524.84 (14.26%)"` → `{value: 42524.84, pct: 14.26}`.
 * Returns null if the shape doesn't match.
 */
export function parseValuePct(s: string): Mt5ValuePct | null {
  const m = s.match(/^([\d\s\u00A0.,\-+]+)\s*\(([\d.,\-+]+)\s*%\s*\)/);
  if (!m) return null;
  const value = parseLooseNumber(m[1]!);
  const pct = parseLooseNumber(m[2]!);
  if (value == null || pct == null) return null;
  return { value, pct };
}

/** Parse `"844 (59.36%)"` → `{count: 844, pct: 59.36}`. */
export function parseCountPct(s: string): Mt5CountPct | null {
  const m = s.match(/^(\d+)\s*\(([\d.,\-+]+)\s*%\s*\)/);
  if (!m) return null;
  const count = parseInt(m[1]!, 10);
  const pct = parseLooseNumber(m[2]!);
  if (!Number.isFinite(count) || pct == null) return null;
  return { count, pct };
}

/**
 * Parse `"16 (26 299.93)"` (count first) OR `"26 299.93 (16)"`
 * (value first) — both shapes appear in MT5's "Maximum/Maximal
 * consecutive..." rows.
 *
 * MT5's label tells us which is which:
 *   - Label ends `($)`     → outer side is count, parens hold the $.
 *   - Label ends `(count)` → outer side is the $, parens hold count.
 *
 * When the caller can't supply the label (legacy call sites), we fall
 * back to an integer-side heuristic — fine for one-off display, but
 * fragile when both halves happen to be integers, which is why the
 * label hint is preferred.
 */
export function parseCountValue(
  s: string,
  order?: 'count-first' | 'value-first',
): Mt5CountValue | null {
  const m = s.match(/^([\d\s\u00A0.,\-+]+)\s*\(([\d\s\u00A0.,\-+]+)\)/);
  if (!m) return null;
  const left = parseLooseNumber(m[1]!);
  const right = parseLooseNumber(m[2]!);
  if (left == null || right == null) return null;

  if (order === 'count-first') return { count: left, value: right };
  if (order === 'value-first') return { count: right, value: left };

  // No hint — fall back to "integer side is the count".
  if (Number.isInteger(left) && !Number.isInteger(right)) {
    return { count: left, value: right };
  }
  if (Number.isInteger(right) && !Number.isInteger(left)) {
    return { count: right, value: left };
  }
  // Both integers (e.g. "Average consecutive...") — match MT5's most
  // common count-first layout.
  return { count: left, value: right };
}

/** Inspect an MT5 label to decide the count/value ordering, if any. */
function countValueOrderFromLabel(
  label?: string,
): 'count-first' | 'value-first' | undefined {
  if (!label) return undefined;
  // "Maximum consecutive wins ($)"   / "... losses ($)" → count (value$)
  if (/\(\s*\$\s*\)\s*$/u.test(label)) return 'count-first';
  // "Maximal consecutive profit (count)" / "... loss (count)" → value$ (count)
  if (/\(\s*count\s*\)\s*$/iu.test(label)) return 'value-first';
  return undefined;
}

/**
 * Coerce a raw string from the Results column into the appropriate
 * shape: number, ValuePct, CountPct, CountValue, or fallback string.
 *
 * `label` (the MT5 metric key) is optional but recommended — it lets
 * us disambiguate `CountValue` ordering deterministically rather than
 * relying on which half happens to be integer.
 */
export function coerceMetric(
  raw: string | number,
  label?: string,
): Mt5MetricValue {
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (s === '') return null;

  // Try compound shapes first (they're string-only).
  const vp = parseValuePct(s);
  if (vp) return vp;
  const cp = parseCountPct(s);
  if (cp) return cp;
  if (s.includes('(') && s.includes(')')) {
    const cv = parseCountValue(s, countValueOrderFromLabel(label));
    if (cv) return cv;
  }
  // Bare percentage like "4339.44%".
  if (/^[\d.,\-+\s\u00A0]+%$/.test(s)) {
    const pct = parsePercent(s);
    if (pct != null) return pct;
  }
  // Bare number.
  const n = parseLooseNumber(s);
  if (n != null && /^[\d.,\-+\s\u00A0]+$/.test(s)) return n;
  // Otherwise leave as string (e.g. "100% real ticks", "5:17:29").
  return s;
}

/** Normalise EA-input value: `"3.25"` → `3.25`, `"false"` → `false`. */
export function coerceInputValue(raw: string): string | number | boolean {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = parseLooseNumber(s);
  if (n != null && /^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(s)) return n;
  return s;
}

function parseIdentity(raw: Mt5Raw): Mt5Identity {
  const versionMatch = raw.expert.match(VERSION_RE);
  const candidate = versionMatch?.[1] ?? null;
  const eaVersion =
    candidate && isValidDdmmyy(candidate) ? candidate : null;

  let timeframe: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  const periodMatch = raw.period.match(PERIOD_RE);
  if (periodMatch) {
    timeframe = periodMatch[1] ?? null;
    const [, , sy, sm, sd, ey, em, ed] = periodMatch;
    periodStart = `${sy}-${pad2(sm!)}-${pad2(sd!)}`;
    periodEnd = `${ey}-${pad2(em!)}-${pad2(ed!)}`;
  }

  return {
    expertName: raw.expert,
    eaVersion,
    symbol: raw.symbol,
    timeframe,
    periodStart,
    periodEnd,
    broker: raw.broker,
    currency: raw.currency,
    initialDeposit: raw.initialDeposit,
    leverage: raw.leverage,
  };
}

function pad2(s: string): string {
  return s.length === 1 ? `0${s}` : s;
}

/** Build the typed `headline` block from the parsed Results map. */
function buildHeadline(results: Mt5Results): Mt5Headline {
  const num = (k: string): number | null => {
    const v = results[k];
    return typeof v === 'number' ? v : null;
  };
  const valuePctOrNull = (k: string): Mt5ValuePct | null => {
    const v = results[k];
    return v && typeof v === 'object' && 'value' in v && 'pct' in v
      ? (v as Mt5ValuePct)
      : null;
  };

  const balDdMax = valuePctOrNull('Balance Drawdown Maximal');
  const eqDdMax = valuePctOrNull('Equity Drawdown Maximal');

  const totalTrades = num('Total Trades');
  const profitTrades = results['Profit Trades (% of total)'];
  let winRate: number | null = null;
  if (
    profitTrades &&
    typeof profitTrades === 'object' &&
    'pct' in profitTrades
  ) {
    winRate = (profitTrades as Mt5CountPct).pct;
  }

  return {
    totalNetProfit: num('Total Net Profit'),
    profitFactor: num('Profit Factor'),
    expectedPayoff: num('Expected Payoff'),
    recoveryFactor: num('Recovery Factor'),
    sharpeRatio: num('Sharpe Ratio'),
    balanceDdMaxPct: balDdMax?.pct ?? null,
    equityDdMaxPct: eqDdMax?.pct ?? null,
    totalTrades,
    winRate,
  };
}

/** Convert an `Mt5Raw` into the persisted `Mt5Normalised` shape. */
export function normaliseMt5Raw(raw: Mt5Raw): Mt5Normalised {
  const identity = parseIdentity(raw);

  const inputs: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw.inputsRaw)) {
    inputs[k] = coerceInputValue(v);
  }

  const results: Mt5Results = {};
  for (const [k, v] of Object.entries(raw.resultsRaw)) {
    results[k] = coerceMetric(v, k);
  }

  const headline = buildHeadline(results);
  const equityCurveDownsampled = downsampleEquityCurve(raw.equityCurveRaw, 500);

  return {
    identity,
    inputs,
    results,
    headline,
    equityCurveRaw: raw.equityCurveRaw,
    equityCurveDownsampled,
    sourceFormat: raw.sourceFormat,
    sourceFilename: raw.sourceFilename,
  };
}
