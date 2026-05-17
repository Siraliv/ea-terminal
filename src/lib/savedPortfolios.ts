/**
 * Tiny localStorage-backed registry for named portfolios.
 *
 * Stored as a flat array under a single key for simplicity. v1 only
 * persists the *recipe* (constituent test ids + weights + score
 * choice + start capital) — never the precomputed curve or metrics,
 * since those are cheap to recompute and the underlying tests can
 * change. Re-render the page and it always re-derives from the
 * current `tests` list.
 *
 * If we ever want multi-device sync, the storage backend swaps to a
 * `portfolios` Postgres table; the function signatures here can stay
 * the same.
 */

const STORAGE_KEY = 'ea-terminal:saved-portfolios:v1';

export interface SavedPortfolio {
  /** Stable id (UUID). Generated at save time. */
  id: string;
  /** Human-friendly name. */
  name: string;
  /** Constituent test ids — order matters (matches `weights`). */
  testIds: string[];
  /** Allocation weights, same length as `testIds`, sums to 1. */
  weights: number[];
  /** Score function used when this portfolio was saved (for context). */
  scoreKey: 'sharpe' | 'sortino' | 'calmar' | 'recovery';
  /**
   * Weighting scheme in effect when saved. Optional for back-compat
   * with rows saved before weight schemes existed — loaders should
   * default to `'equal'` when this field is absent.
   */
  weightScheme?: 'equal' | 'inverseVol' | 'markowitz';
  /** Starting capital used at save time ($). */
  startCapital: number;
  /** Optional free-text note. */
  note?: string;
  /** ISO timestamp the row was saved. */
  savedAt: string;
}

export function listSavedPortfolios(): SavedPortfolio[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedPortfolio);
  } catch {
    return [];
  }
}

export function savePortfolio(
  p: Omit<SavedPortfolio, 'id' | 'savedAt'>,
): SavedPortfolio {
  const all = listSavedPortfolios();
  const entry: SavedPortfolio = {
    ...p,
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...all];
  writeAll(next);
  return entry;
}

export function deleteSavedPortfolio(id: string): void {
  const all = listSavedPortfolios();
  writeAll(all.filter((p) => p.id !== id));
}

export function renameSavedPortfolio(id: string, name: string): void {
  const all = listSavedPortfolios();
  const next = all.map((p) => (p.id === id ? { ...p, name } : p));
  writeAll(next);
}

function writeAll(rows: SavedPortfolio[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Quota full / SecurityError — surface silently for now; the
    // page UI will simply not see the new row reflected back. A
    // future revision could surface a toast.
  }
}

function isSavedPortfolio(v: unknown): v is SavedPortfolio {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['id'] === 'string' &&
    typeof o['name'] === 'string' &&
    Array.isArray(o['testIds']) &&
    o['testIds'].every((x: unknown) => typeof x === 'string') &&
    Array.isArray(o['weights']) &&
    o['weights'].every((x: unknown) => typeof x === 'number') &&
    typeof o['savedAt'] === 'string'
  );
}
