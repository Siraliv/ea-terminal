import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import pako from 'pako';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import type { EquityPoint, Test } from '@/types/domain';

/**
 * Fetch the full-resolution equity curve for a single test from the
 * `raw-curves` Storage bucket. The file is gzipped JSON of
 * `EquityPoint[]` — one point per deal, pre-LTTB downsampling.
 *
 * Cached with `staleTime: Infinity` because raw curves are immutable
 * per `test.id` (the upload path includes the test UUID and the file
 * is never rewritten). Re-downloading wastes bandwidth.
 */
async function fetchRawCurve(test: Test): Promise<EquityPoint[]> {
  if (!test.raw_curve_path) {
    throw new Error('Test has no raw_curve_path');
  }
  const { data, error } = await supabase.storage
    .from('raw-curves')
    .download(test.raw_curve_path);
  if (error || !data) {
    throw new Error(
      `Raw curve fetch failed: ${error?.message ?? 'unknown error'}`,
    );
  }
  const buf = await data.arrayBuffer();
  const json = pako.ungzip(new Uint8Array(buf), { to: 'string' });
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Raw curve JSON was not an array');
  }
  // Defensive: filter out malformed points before handing to chart.
  const out: EquityPoint[] = [];
  for (const p of parsed) {
    if (!p || typeof p !== 'object') continue;
    const obj = p as { t?: unknown; b?: unknown };
    if (typeof obj.t !== 'string') continue;
    if (typeof obj.b !== 'number' || !Number.isFinite(obj.b)) continue;
    out.push({ t: obj.t, b: obj.b });
  }
  return out;
}

export interface RawCurveSlot {
  testId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: EquityPoint[] | null;
}

/**
 * Lazily fetch raw curves for a batch of tests in parallel. Pass
 * `enabled: false` to keep them un-fetched (e.g. when the year
 * filter is `'all'` and downsampled data is already accurate
 * enough). Each test's curve is cached independently under
 * `qk.tests.rawCurve(id)`, so toggling year on/off doesn't refetch.
 */
export function useRawCurves(
  tests: readonly Test[],
  enabled: boolean,
): RawCurveSlot[] {
  const queries = useQueries({
    queries: tests.map((t) => ({
      queryKey: qk.tests.rawCurve(t.id),
      queryFn: () => fetchRawCurve(t),
      enabled: enabled && !!t.raw_curve_path,
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000, // 30 min — discard if untouched
      retry: 1,
    })),
  });

  return queries.map((q, i) => slotFromQuery(tests[i]!.id, q));
}

function slotFromQuery(
  testId: string,
  q: UseQueryResult<EquityPoint[], Error>,
): RawCurveSlot {
  if (q.isPending && q.fetchStatus === 'idle') {
    return { testId, status: 'idle', data: null };
  }
  if (q.isLoading) return { testId, status: 'loading', data: null };
  if (q.isError) return { testId, status: 'error', data: null };
  return { testId, status: 'ready', data: q.data ?? null };
}

/**
 * Roll the per-test slot statuses into a single overall status for
 * the active-year scope: `'ready'` only once every requested curve
 * has loaded, `'loading'` while any are in flight, `'error'` if any
 * failed. Idle slots (enabled=false or no raw_curve_path) count as
 * `'ready'` because they'll fall back to the downsampled curve.
 */
export function rollUpRawStatus(
  slots: readonly RawCurveSlot[],
): 'idle' | 'loading' | 'ready' | 'error' {
  if (slots.length === 0) return 'idle';
  let anyLoading = false;
  let anyError = false;
  for (const s of slots) {
    if (s.status === 'loading') anyLoading = true;
    else if (s.status === 'error') anyError = true;
  }
  if (anyLoading) return 'loading';
  if (anyError) return 'error';
  return 'ready';
}
