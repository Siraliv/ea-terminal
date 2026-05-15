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
