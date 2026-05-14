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

/** Narrow a stored TestRow into the typed `Test` domain shape. */
function rowToTest(row: TestRow): Test {
  return {
    ...row,
    inputs: (row.inputs ?? {}) as Record<string, Json>,
    results: (row.results ?? {}) as Record<string, Json>,
    equity_curve: (row.equity_curve ?? []) as unknown as EquityCurve,
  };
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

      const insert: TestInsert = {
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
      };

      const { data, error } = await supabase
        .from('tests')
        .insert(insert)
        .select()
        .single();

      if (error) {
        // Race-loss path: another parallel upload of the same file
        // beat us to the unique `(user_id, file_hash)` index. Clean
        // up the orphan raw curve we just uploaded, fetch the row
        // the winner inserted, and report it as a duplicate.
        await supabase.storage.from('raw-curves').remove([rawPath]);
        if (isUniqueViolation(error)) {
          const { data: winner } = await supabase
            .from('tests')
            .select('*')
            .eq('user_id', user.id)
            .eq('file_hash', hash)
            .maybeSingle();
          if (winner) {
            return { test: rowToTest(winner), duplicate: true };
          }
        }
        throw error;
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
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === '23505') return true;
  return typeof e.message === 'string' && /duplicate key|unique/i.test(e.message);
}

async function upsertEaSchema(userId: string, parsed: Mt5Normalised) {
  const inputKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.inputs)) {
    inputKeys[k] = typeof v;
  }
  const resultKeys: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.results)) {
    resultKeys[k] = v == null ? 'null' : typeof v;
  }

  await supabase.from('ea_schemas').upsert(
    {
      user_id: userId,
      ea_name: parsed.identity.expertName,
      input_keys: inputKeys as unknown as Json,
      result_keys: resultKeys as unknown as Json,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,ea_name' },
  );
}
