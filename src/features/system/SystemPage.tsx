import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  KV,
  KpiTile,
} from '@/components/ui';
import { useTestsList, useDeleteTest } from '@/hooks/useTests';
import { useStorageStats, type StorageObject } from '@/hooks/useStorageStats';
import type { Test } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────
// Tier limits
// ─────────────────────────────────────────────────────────────────

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/**
 * Hosted-provider free-tier ceilings as of 2026. Override per-env via
 * `VITE_SUPABASE_TIER` and `VITE_VERCEL_TIER` once a paid plan kicks
 * in so the meters surface the right ceilings instead of a misleading
 * "we're at 12% of the free limit" when we're actually on Pro.
 */
const TIER_LIMITS = {
  supabase: {
    free: {
      label: 'FREE',
      db: 500 * MB,
      storage: 1 * GB,
      bandwidthMonthly: 5 * GB,
      mauCap: 50_000,
    },
    pro: {
      label: 'PRO',
      db: 8 * GB,
      storage: 100 * GB,
      bandwidthMonthly: 250 * GB,
      mauCap: 100_000,
    },
  },
  vercel: {
    hobby: {
      label: 'HOBBY',
      bandwidthMonthly: 100 * GB,
      buildMinutes: 6000,
    },
    pro: {
      label: 'PRO',
      bandwidthMonthly: 1024 * GB,
      buildMinutes: 24_000,
    },
  },
} as const;

const SUPABASE_TIER =
  (import.meta.env['VITE_SUPABASE_TIER'] as 'free' | 'pro' | undefined) ??
  'free';
const VERCEL_TIER =
  (import.meta.env['VITE_VERCEL_TIER'] as 'hobby' | 'pro' | undefined) ??
  'hobby';

// ─────────────────────────────────────────────────────────────────

export function SystemPage() {
  const navigate = useNavigate();
  const testsQ = useTestsList();
  const storageQ = useStorageStats();
  const deleteMut = useDeleteTest();

  // Stable reference for downstream `useMemo` deps — `testsQ.data` can
  // be undefined or a fresh array on each refetch, which would
  // otherwise rebuild `footprints` on every render.
  const tests = useMemo(() => testsQ.data ?? [], [testsQ.data]);
  const storage = storageQ.data;
  const supaCaps = TIER_LIMITS.supabase[SUPABASE_TIER];
  const verCaps = TIER_LIMITS.vercel[VERCEL_TIER];

  /**
   * Per-test storage footprint. Sums:
   *   - The persisted JSONB columns (equity_curve + inputs + results),
   *     each measured by JSON.stringify byte length. Approximates the
   *     row's contribution to DB size — not exact (Postgres compresses
   *     TOASTed columns) but directionally accurate for ranking.
   *   - The gzipped raw curve file in Storage, if present.
   */
  const footprints = useMemo(() => {
    const byTestId = new Map<string, StorageObject>();
    for (const o of storage?.objects ?? []) {
      if (o.testId) byTestId.set(o.testId, o);
    }
    return tests
      .map((t) => {
        const jsonbBytes =
          byteLength(JSON.stringify(t.equity_curve)) +
          byteLength(JSON.stringify(t.inputs)) +
          byteLength(JSON.stringify(t.results));
        const rawBytes = byTestId.get(t.id)?.size ?? 0;
        return {
          test: t,
          jsonbBytes,
          rawBytes,
          totalBytes: jsonbBytes + rawBytes,
        };
      })
      .sort((a, b) => b.totalBytes - a.totalBytes);
  }, [tests, storage]);

  const totalJsonbBytes = useMemo(
    () => footprints.reduce((a, f) => a + f.jsonbBytes, 0),
    [footprints],
  );
  const totalRawBytes = storage?.totalBytes ?? 0;
  const totalAllBytes = totalJsonbBytes + totalRawBytes;

  const topTen = footprints.slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="SYSTEM"
        subtitle="Infrastructure, quotas and data-management hotspots"
      />

      {/* ─── Infrastructure ─── */}
      <FramedPanel
        title="INFRASTRUCTURE"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            stack
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="flex flex-col">
            <KV k="Hosting" v="Vercel" />
            <KV
              k="Plan"
              v={
                <BracketedTag
                  variant={VERCEL_TIER === 'hobby' ? 'paused' : 'active'}
                >
                  {verCaps.label}
                </BracketedTag>
              }
            />
            <KV k="Region" v="Edge (global)" />
            <KV k="CSP" v="strict (vercel.json)" />
          </div>
          <div className="flex flex-col">
            <KV k="Database" v="Supabase Postgres" />
            <KV
              k="Plan"
              v={
                <BracketedTag
                  variant={SUPABASE_TIER === 'free' ? 'paused' : 'active'}
                >
                  {supaCaps.label}
                </BracketedTag>
              }
            />
            <KV k="Storage bucket" v="raw-curves (gzipped JSON)" />
            <KV k="RLS" v="enabled on all tables" />
          </div>
        </div>
      </FramedPanel>

      {/* ─── Quotas ─── */}
      <FramedPanel
        title="QUOTAS"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            usage vs {supaCaps.label} / {verCaps.label} ceilings
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QuotaCard
            label="Database (JSONB approx)"
            used={totalJsonbBytes}
            cap={supaCaps.db}
            hint={`${tests.length} test${tests.length === 1 ? '' : 's'} · approximated by JSON size`}
          />
          <QuotaCard
            label="Storage bucket"
            used={totalRawBytes}
            cap={supaCaps.storage}
            hint={`${storage?.objects.length ?? 0} raw-curve object${
              storage?.objects.length === 1 ? '' : 's'
            }`}
            loading={storageQ.isLoading}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <KpiTile label="Tests on file" value={tests.length.toString()} />
          <KpiTile label="Raw curves" value={(storage?.objects.length ?? 0).toString()} />
          <KpiTile label="Total footprint" value={fmtBytes(totalAllBytes)} />
          <KpiTile
            label={`Supabase BW (${supaCaps.label})`}
            value={fmtBytes(supaCaps.bandwidthMonthly)}
            tone="muted"
          />
        </div>

        <p className="text-term-dim text-[10px] italic leading-snug mt-3">
          DB usage is approximated client-side by JSON.stringify of the
          JSONB columns. True on-disk size differs (Postgres compresses
          TOAST). Bandwidth and build-minute counters are not queryable
          from the client — read them from the Supabase / Vercel
          dashboards directly.
        </p>
      </FramedPanel>

      {/* ─── Data hotspots ─── */}
      <FramedPanel
        title="DATA HOTSPOTS"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            top 10 by footprint
          </span>
        }
      >
        {footprints.length === 0 ? (
          <p className="text-term-muted text-sm">— no tests on file —</p>
        ) : (
          <>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-term-muted text-[10px] uppercase tracking-wider text-left border-b border-dashed border-term-borderDim">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Test</th>
                  <th className="py-1 pr-2 text-right">JSONB</th>
                  <th className="py-1 pr-2 text-right">Raw</th>
                  <th className="py-1 pr-2 text-right">Total</th>
                  <th className="py-1 pr-2 text-right">%</th>
                  <th className="py-1 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {topTen.map((f, i) => {
                  const pct =
                    totalAllBytes > 0
                      ? (f.totalBytes / totalAllBytes) * 100
                      : 0;
                  return (
                    <tr
                      key={f.test.id}
                      className="border-b border-dashed border-term-borderDim/40 hover:bg-term-text/5 cursor-pointer"
                      onClick={() => navigate(`/tests/${f.test.id}`)}
                    >
                      <td className="py-1.5 pr-2 text-term-dim tabular-nums">
                        {i + 1}.
                      </td>
                      <td className="py-1.5 pr-2 truncate max-w-[280px]">
                        <span className="text-term-text">
                          {cleanEaName(f.test.ea_name)}
                        </span>
                        <span className="text-term-dim ml-2">
                          {f.test.symbol}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right text-term-muted tabular-nums">
                        {fmtBytes(f.jsonbBytes)}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-term-muted tabular-nums">
                        {fmtBytes(f.rawBytes)}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-term-text tabular-nums">
                        {fmtBytes(f.totalBytes)}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-term-dim tabular-nums">
                        {pct.toFixed(1)}%
                      </td>
                      <td
                        className="py-1.5 pr-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BracketedButton
                          variant="secondary"
                          size="sm"
                          disabled={deleteMut.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete this test and free ${fmtBytes(f.totalBytes)}? Cannot be undone.`,
                              )
                            ) {
                              deleteMut.mutate(f.test);
                            }
                          }}
                        >
                          Delete
                        </BracketedButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <FreeUpHints
              footprints={footprints}
              totalBytes={totalAllBytes}
              cap={supaCaps.storage}
            />
          </>
        )}
      </FramedPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function QuotaCard({
  label,
  used,
  cap,
  hint,
  loading,
}: {
  label: string;
  used: number;
  cap: number;
  hint?: string;
  loading?: boolean;
}) {
  const pct = cap > 0 ? Math.min((used / cap) * 100, 100) : 0;
  const remaining = Math.max(cap - used, 0);
  // Colour ramp: green under 60%, amber 60–85%, red above.
  const barColor =
    pct >= 85
      ? 'bg-term-red'
      : pct >= 60
        ? 'bg-term-amber'
        : 'bg-term-pos';
  const tone =
    pct >= 85 ? 'text-term-red' : pct >= 60 ? 'text-term-amber' : 'text-term-text';
  return (
    <div className="flex flex-col gap-1 border border-dashed border-term-borderDim p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          {label}
        </span>
        <span className={`text-xs font-mono tabular-nums ${tone}`}>
          {loading ? '—' : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 bg-term-text/10 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-[11px] font-mono">
        <span className="text-term-muted">
          {loading ? '— / —' : `${fmtBytes(used)} / ${fmtBytes(cap)}`}
        </span>
        <span className="text-term-dim">
          {loading ? '' : `${fmtBytes(remaining)} free`}
        </span>
      </div>
      {hint ? (
        <span className="text-term-dim text-[10px] italic">{hint}</span>
      ) : null}
    </div>
  );
}

/**
 * "If you delete the top N hotspots, you'll free X" — quick triage
 * hint shown under the table so the user knows what action to take
 * when a quota is approaching its ceiling.
 */
function FreeUpHints({
  footprints,
  totalBytes,
  cap,
}: {
  footprints: Array<{ test: Test; totalBytes: number }>;
  totalBytes: number;
  cap: number;
}) {
  const pct = cap > 0 ? (totalBytes / cap) * 100 : 0;
  if (pct < 50 || footprints.length === 0) return null;

  const top1 = footprints[0]?.totalBytes ?? 0;
  const top3 = footprints
    .slice(0, 3)
    .reduce((a, f) => a + f.totalBytes, 0);
  const top5 = footprints
    .slice(0, 5)
    .reduce((a, f) => a + f.totalBytes, 0);

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-term-borderDim text-xs font-mono">
      <span className="text-term-muted">▸ Free up by deleting:</span>
      <ul className="mt-1 space-y-0.5 ml-4 text-term-dim">
        <li>
          top <span className="text-term-text">1</span> hotspot →{' '}
          <span className="text-term-pos">{fmtBytes(top1)}</span>
        </li>
        <li>
          top <span className="text-term-text">3</span> hotspots →{' '}
          <span className="text-term-pos">{fmtBytes(top3)}</span>
        </li>
        <li>
          top <span className="text-term-text">5</span> hotspots →{' '}
          <span className="text-term-pos">{fmtBytes(top5)}</span>
        </li>
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < KB) return `${n.toFixed(0)} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  if (n < GB) return `${(n / MB).toFixed(2)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}
