import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import pako from 'pako';
import { supabase } from '@/lib/supabase';
import { qk } from '@/lib/queryKeys';
import { sha256Hex } from '@/lib/fileHash';
import type { Json, TestInsert, TestRow } from '@/types/database';
import type { Test, EquityCurve } from '@/types/domain';
import type { Mt5Normalised } from '@/domain/mt5/types';
import { useAuth } from '@/hooks/useAuth';
import { nextCodeForEa } from '@/lib/testCode';

/**
 * Narrow a stored TestRow into the typed `Test` domain shape.
 *
 * The JSONB columns (`inputs`, `results`, `equity_curve`) have no
 * runtime guarantees — a manual SQL edit, a schema drift, or an old
 * row from a previous parser version can land here as anything. We
 * coerce defensively: objects pass through, arrays become empty, and
 * `equity_curve` is filtered to only well-shaped `{t, b}` points so
 * a malformed row never crashes the chart layer downstream.
 */
function rowToTest(row: TestRow): Test {
  return {
    ...row,
    inputs: isPlainObject(row.inputs)
      ? (row.inputs as Record<string, Json>)
      : {},
    results: isPlainObject(row.results)
      ? (row.results as Record<string, Json>)
      : {},
    equity_curve: toEquityCurve(row.equity_curve),
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toEquityCurve(v: unknown): EquityCurve {
  if (!Array.isArray(v)) return [];
  const out: EquityCurve = [];
  for (const p of v) {
    if (!p || typeof p !== 'object') continue;
    const obj = p as { t?: unknown; b?: unknown };
    if (typeof obj.t !== 'string') continue;
    if (typeof obj.b !== 'number' || !Number.isFinite(obj.b)) continue;
    out.push({ t: obj.t, b: obj.b });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

/** All tests for the signed-in user, newest first. */
export function useTestsList(): UseQueryResult<Test[]> {
  return useQuery({
    queryKey: qk.tests.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToTest);
    },
  });
}

/** Single test by id. */
export function useTest(id: string | null | undefined): UseQueryResult<Test> {
  return useQuery({
    queryKey: id ? qk.tests.detail(id) : ['tests', 'detail', '__none__'],
    queryFn: async () => {
      if (!id) throw new Error('Missing test id');
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return rowToTest(data);
    },
    enabled: !!id,
  });
}

// ─────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────

export interface UploadTestArgs {
  /** Output of `parseMt5XlsxBuffer` / `parseMt5HtmlString`. */
  parsed: Mt5Normalised;
  /** Original file (used for hashing for dedupe). */
  file: File;
}

export interface UploadTestResult {
  test: Test;
  /** True if a test with the same hash existed (duplicate). */
  duplicate: boolean;
}

/**
 * Persist a parsed MT5 report:
 *   1. Hash the file (SHA-256) for dedupe.
 *   2. If a row with that hash already exists for this user, return it.
 *   3. Generate a UUID, gzip the raw equity curve, upload to Storage.
 *   4. Insert the test row (with downsampled curve as JSONB).
 *   5. Upsert the EA's input/result schema.
 */
export function useUploadTest(): UseMutationResult<
  UploadTestResult,
  Error,
  UploadTestArgs
> {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ parsed, file }) => {
      if (!user) throw new Error('Not signed in.');

      const hash = await sha256Hex(file);

      // Cheap precheck for the common case (user re-uploads same file).
      // The authoritative dedup is the `(user_id, file_hash)` unique
      // index — checked again *after* the insert, so two parallel
      // uploads of the same file can't both succeed.
      const { data: existingPre } = await supabase
        .from('tests')
        .select('*')
        .eq('user_id', user.id)
        .eq('file_hash', hash)
        .maybeSingle();

      if (existingPre) {
        return { test: rowToTest(existingPre), duplicate: true };
      }

      // Generate id, upload raw curve.
      const testId = crypto.randomUUID();
      const rawJson = JSON.stringify(parsed.equityCurveRaw);
      const rawGz = pako.gzip(rawJson);
      const rawPath = `${user.id}/${testId}.json.gz`;

      const { error: uploadErr } = await supabase.storage
        .from('raw-curves')
        .upload(rawPath, rawGz, {
          contentType: 'application/gzip',
          upsert: false,
          cacheControl: '31536000',
        });
      if (uploadErr) {
        throw new Error(`Raw curve upload failed: ${uploadErr.message}`);
      }

      // Pull existing tests once so we can both compute a code and
      // hand a stable snapshot to retry logic if there's a race.
      const { data: userTestsRaw } = await supabase
        .from('tests')
        .select('*')
        .eq('user_id', user.id);
      const userTests = (userTestsRaw ?? []).map(rowToTest);

      const buildInsert = (codeOverride?: string): TestInsert => ({
        id: testId,
        user_id: user.id,
        ea_name: parsed.identity.expertName,
        ea_version: parsed.identity.eaVersion,
        symbol: parsed.identity.symbol,
        timeframe: parsed.identity.timeframe,
        period_start: parsed.identity.periodStart,
        period_end: parsed.identity.periodEnd,
        broker: parsed.identity.broker,
        currency: parsed.identity.currency,
        initial_deposit: parsed.identity.initialDeposit,
        leverage: parsed.identity.leverage,
        total_net_profit: parsed.headline.totalNetProfit,
        profit_factor: parsed.headline.profitFactor,
        expected_payoff: parsed.headline.expectedPayoff,
        recovery_factor: parsed.headline.recoveryFactor,
        sharpe_ratio: parsed.headline.sharpeRatio,
        balance_dd_max_pct: parsed.headline.balanceDdMaxPct,
        equity_dd_max_pct: parsed.headline.equityDdMaxPct,
        total_trades: parsed.headline.totalTrades,
        win_rate: parsed.headline.winRate,
        inputs: parsed.inputs as Json,
        results: parsed.results as Json,
        equity_curve: parsed.equityCurveDownsampled as unknown as Json,
        rating: null,
        status: 'active',
        group_label: null,
        notes: null,
        source_format: parsed.sourceFormat,
        source_filename: parsed.sourceFilename,
        raw_curve_path: rawPath,
        file_hash: hash,
        test_code: codeOverride ?? nextCodeForEa(parsed.identity.expertName, userTests),
      });

      // First-try insert with a freshly-computed code. If we lose the
      // `(user_id, test_code)` race to a parallel upload of a
      // different file targeting the same EA, refetch and bump the
      // sequence once. Limit to 3 attempts so we can't loop forever
      // on a misconfigured unique index.
      let data: TestRow | null = null;
      let error: unknown = null;
      let attempt = 0;
      let snapshot = userTests;
      while (attempt < 3) {
        const insert = buildInsert(
          attempt === 0
            ? undefined
            : nextCodeForEa(parsed.identity.expertName, snapshot),
        );
        const res = await supabase
          .from('tests')
          .insert(insert)
          .select()
          .single();
        if (!res.error) {
          data = res.data;
          error = null;
          break;
        }
        error = res.error;
        if (!isUniqueViolation(res.error)) break;
        // Was it the file_hash race (caller already exists), or the
        // test_code race (different file targeting same EA)?
        const { data: byHash } = await supabase
          .from('tests')
          .select('*')
          .eq('user_id', user.id)
          .eq('file_hash', hash)
          .maybeSingle();
        if (byHash) {
          // file_hash collision — the winner is the existing row.
          // Clean up the orphan raw curve and report as duplicate.
          await supabase.storage.from('raw-curves').remove([rawPath]);
          return { test: rowToTest(byHash), duplicate: true };
        }
        // test_code collision — refresh snapshot and retry with a
        // bumped sequence.
        const { data: refreshed } = await supabase
          .from('tests')
          .select('*')
          .eq('user_id', user.id);
        snapshot = (refreshed ?? []).map(rowToTest);
        attempt++;
      }

      if (error || !data) {
        await supabase.storage.from('raw-curves').remove([rawPath]);
        throw error instanceof Error
          ? error
          : new Error(
              typeof error === 'object' && error && 'message' in error
                ? String((error as { message: unknown }).message)
                : 'Insert failed',
            );
      }

      // Upsert the EA schema for this user.
      await upsertEaSchema(user.id, parsed);

      return { test: rowToTest(data), duplicate: false };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.tests.all });
      void queryClient.invalidateQueries({ queryKey: qk.eaSchemas.all });
    },
  });
}

/**
 * Update mutable fields on a test (rating, status, group_label, notes).
 * Used by the Test Detail page.
 */
export function useUpdateTest(): UseMutationResult<
  Test,
  Error,
  { id: string; patch: Partial<TestInsert> }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await supabase
        .from('tests')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return rowToTest(data);
    },
    onSuccess: (test) => {
      void queryClient.invalidateQueries({ queryKey: qk.tests.list() });
      void queryClient.invalidateQueries({ queryKey: qk.tests.detail(test.id) });
    },
  });
}

/** Hard-delete a test (and its raw curve from Storage). */
export function useDeleteTest(): UseMutationResult<void, Error, Test> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (test) => {
      if (test.raw_curve_path) {
        await supabase.storage.from('raw-curves').remove([test.raw_curve_path]);
      }
      const { error } = await supabase.from('tests').delete().eq('id', test.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.tests.all });
    },
  });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Postgres unique-constraint violation. Supabase forwards PG error
 * codes verbatim on `PostgrestError.code`, but the network-layer
 * error shape doesn't expose that field with a stable type, so we
 * inspect both `code` and the message text defensively.
 */
/**
 * Safely coerce an `ea_schemas.input_keys` / `result_keys` JSONB cell
 * (which is `Json | null` from the DB) into a `Record<string, string>`
 * suitable for spread-merge. Anything malformed becomes an empty
 * object so a bad existing row can't crash the upsert path.
 */
function keysAsRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === '23505') return true;
  return typeof e.message === 'string' && /duplicate key|unique/i.test(e.message);
}

async function upsertEaSchema(userId: string, parsed: Mt5Normalised) {
  const newInputKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.inputs)) {
    newInputKeys[k] = typeof v;
  }
  const newResultKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.results)) {
    newResultKeys[k] = v == null ? 'null' : typeof v;
  }

  // Merge with the existing schema rather than overwrite. EA versions
  // can add or drop keys over time; clobbering would silently shrink
  // the schema each time a stripped-down test was uploaded, losing
  // history of which keys this EA has ever produced. We fetch first,
  // merge in-memory, then upsert. A small race window exists (two
  // parallel uploads of the same EA could each fetch then write the
  // older snapshot), but the cost is one missed key until the next
  // upload — acceptable for a metadata-only table.
  const { data: existing } = await supabase
    .from('ea_schemas')
    .select('input_keys, result_keys')
    .eq('user_id', userId)
    .eq('ea_name', parsed.identity.expertName)
    .maybeSingle();

  const mergedInputKeys = {
    ...keysAsRecord(existing?.input_keys),
    ...newInputKeys,
  };
  const mergedResultKeys = {
    ...keysAsRecord(existing?.result_keys),
    ...newResultKeys,
  };

  await supabase.from('ea_schemas').upsert(
    {
      user_id: userId,
      ea_name: parsed.identity.expertName,
      input_keys: mergedInputKeys as unknown as Json,
      result_keys: mergedResultKeys as unknown as Json,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,ea_name' },
  );
}
