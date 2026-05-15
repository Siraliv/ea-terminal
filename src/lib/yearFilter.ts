import type { Test } from '@/types/domain';

/** Sentinel for "show all years" — distinct from any actual year. */
export const ALL_YEARS = 'all' as const;
export type YearFilter = number | typeof ALL_YEARS;

/**
 * Extract the calendar year from an ISO date string like `"2015-01-02"`
 * or a full timestamp. Returns null when the string is missing or
 * can't be parsed.
 */
function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const y = Number.parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/**
 * Compute the descending union of calendar years covered by any
 * test's `[period_start, period_end]` range. Tests with no period
 * dates are skipped. The current year is always included even when
 * no test covers it, so the dropdown stays useful on a fresh DB.
 */
export function availableYears(tests: readonly Test[]): number[] {
  const set = new Set<number>();
  for (const t of tests) {
    const a = yearOf(t.period_start);
    const b = yearOf(t.period_end);
    if (a == null && b == null) continue;
    const start = a ?? b!;
    const end = b ?? a!;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    for (let y = lo; y <= hi; y++) set.add(y);
  }
  set.add(new Date().getUTCFullYear());
  return Array.from(set).sort((x, y) => y - x);
}

/**
 * Does this test's backtest period intersect the selected year?
 *
 * - `ALL_YEARS` → always true.
 * - Tests with no period dates only match `ALL_YEARS` (otherwise we'd
 *   have to guess; better to surface them only when the user has
 *   cleared the filter).
 */
export function matchesYear(t: Test, filter: YearFilter): boolean {
  if (filter === ALL_YEARS) return true;
  const a = yearOf(t.period_start);
  const b = yearOf(t.period_end);
  if (a == null && b == null) return false;
  const start = a ?? b!;
  const end = b ?? a!;
  return filter >= Math.min(start, end) && filter <= Math.max(start, end);
}

// ────────────────────────────────────────────────────────────────
// Range filter
// ────────────────────────────────────────────────────────────────

/**
 * Inclusive [from, to] year range. Either endpoint can be
 * `ALL_YEARS` to mean "open on that side" — e.g. `{from: 2020,
 * to: ALL_YEARS}` is "2020 onwards" and `{from: ALL_YEARS, to:
 * ALL_YEARS}` is "no filter".
 */
export interface YearRange {
  from: YearFilter;
  to: YearFilter;
}

export const ALL_RANGE: YearRange = { from: ALL_YEARS, to: ALL_YEARS };

export function isAllRange(r: YearRange): boolean {
  return r.from === ALL_YEARS && r.to === ALL_YEARS;
}

/**
 * Normalise a `YearRange` into resolved numeric bounds (`from <= to`)
 * with infinity for the open ends. Returns null when both ends are
 * open — caller should treat that as "no filter".
 */
export function normaliseRange(
  r: YearRange,
): { from: number; to: number } | null {
  if (isAllRange(r)) return null;
  const fromN = r.from === ALL_YEARS ? -Infinity : r.from;
  const toN = r.to === ALL_YEARS ? Infinity : r.to;
  return fromN <= toN
    ? { from: fromN, to: toN }
    : { from: toN, to: fromN }; // tolerate inverted picks
}

/**
 * Does this test's backtest period intersect the year range?
 *
 * - `ALL_RANGE` → always true.
 * - Tests with no period dates only match `ALL_RANGE` (see
 *   `matchesYear` for the same rationale).
 */
export function matchesYearRange(t: Test, r: YearRange): boolean {
  const w = normaliseRange(r);
  if (w == null) return true;
  const a = yearOf(t.period_start);
  const b = yearOf(t.period_end);
  if (a == null && b == null) return false;
  const start = Math.min(a ?? b!, b ?? a!);
  const end = Math.max(a ?? b!, b ?? a!);
  // Overlap test on closed-closed intervals.
  return !(end < w.from || start > w.to);
}

/**
 * Format a range for the UI — `"2020–2022"`, `"2020+"`, `"≤2022"`,
 * `"2024"`, or `""` when no bound is set.
 */
export function formatRange(r: YearRange): string {
  const fromN = r.from === ALL_YEARS ? null : r.from;
  const toN = r.to === ALL_YEARS ? null : r.to;
  if (fromN == null && toN == null) return '';
  if (fromN != null && toN != null) {
    const lo = Math.min(fromN, toN);
    const hi = Math.max(fromN, toN);
    return lo === hi ? `${lo}` : `${lo}–${hi}`;
  }
  if (fromN != null) return `${fromN}+`;
  return `≤${toN}`;
}
