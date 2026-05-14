import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  KpiTile,
  Select,
  TerminalTable,
  type TerminalColumn,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { MetricBars, type MetricBarsDatum } from '@/components/charts/MetricBars';
import {
  GroupedMetricBars,
  type GroupedMetricBarsDatum,
} from '@/components/charts/GroupedMetricBars';
import { useTestsList } from '@/hooks/useTests';
import { useEaSchemasList } from '@/hooks/useEaSchemas';
import type { Test } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/** Cap overlays at 5 — palette + readability ceiling. */
const MAX_SELECTED = 5;
/** Default auto-applied selection. */
const AUTO_TOP_N = 3;

/** Colour palette mirrors the Compare page so semantics carry across. */
const OVERLAY_COLORS = [
  'rgb(var(--term-pos))', // primary green
  'rgb(var(--term-amber))', // amber
  'rgb(var(--term-red))', // red
  'rgb(var(--term-gold))', // gold
  'rgb(var(--term-muted))', // grey
];

/** Dim fill for unselected (or empty placeholder) histogram slots. */
const DIM_BAR_COLOR = 'rgba(220, 220, 220, 0.12)';

/** Fixed slot count for histograms — matches the "top 10" framing. */
const HIST_SLOTS = 10;

type RankKey = 'profit_factor' | 'total_net_profit' | 'balance_dd_max_pct';

const RANK_OPTIONS: {
  value: RankKey;
  label: string;
  /** Higher value = better? (false for drawdown.) */
  higherIsBetter: boolean;
}[] = [
  { value: 'profit_factor', label: 'PROFIT FACTOR', higherIsBetter: true },
  { value: 'total_net_profit', label: 'NET PNL', higherIsBetter: true },
  { value: 'balance_dd_max_pct', label: 'MAX BAL DRAWDOWN', higherIsBetter: false },
];

// ─────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}

function avg(values: Array<number | null>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function maxBy<T>(arr: T[], pick: (t: T) => number | null | undefined): T | null {
  let best: T | null = null;
  let bestVal = -Infinity;
  for (const item of arr) {
    const v = pick(item);
    if (typeof v === 'number' && Number.isFinite(v) && v > bestVal) {
      best = item;
      bestVal = v;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: tests = [], isLoading } = useTestsList();
  const { data: schemas = [] } = useEaSchemasList();

  const [rankBy, setRankBy] = useState<RankKey>('profit_factor');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** True until the user manually toggles — controls auto-selection. */
  const [autoMode, setAutoMode] = useState(true);

  // ── Top 10 by current rank ─────────────────────────────────────────
  const top10 = useMemo(() => {
    const opt = RANK_OPTIONS.find((o) => o.value === rankBy)!;
    return tests
      .filter((t) => t.status === 'active' && t[rankBy] != null)
      .slice()
      .sort((a, b) => {
        const av = a[rankBy] as number;
        const bv = b[rankBy] as number;
        return opt.higherIsBetter ? bv - av : av - bv;
      })
      .slice(0, 10);
  }, [tests, rankBy]);

  // ── Auto-apply top 3 whenever rankBy changes (or in auto mode and
  //    the top 10 changes via a refetch) ───────────────────────────
  useEffect(() => {
    if (!autoMode) return;
    setSelectedIds(top10.slice(0, AUTO_TOP_N).map((t) => t.id));
  }, [autoMode, top10]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => top10.find((t) => t.id === id))
        .filter((t): t is Test => !!t),
    [top10, selectedIds],
  );

  const overlays = useMemo(() => {
    if (selected.length === 0) return [];
    return selected.slice(1).map((t, i) => ({
      id: t.id,
      label: shortLabel(t),
      data: t.equity_curve,
      color: OVERLAY_COLORS[(i + 1) % OVERLAY_COLORS.length]!,
    }));
  }, [selected]);

  const toggle = (id: string) => {
    setAutoMode(false);
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECTED) return cur;
      return [...cur, id];
    });
  };

  const resetToAuto = () => {
    setAutoMode(true);
    setSelectedIds(top10.slice(0, AUTO_TOP_N).map((t) => t.id));
  };

  // ── KPI roll-ups (compact strip below the main feature) ──────────
  const stats = useMemo(() => {
    const active = tests.filter((t) => t.status === 'active');
    return {
      totalTests: tests.length,
      activeTests: active.length,
      uniqueEAs: new Set(active.map((t) => t.ea_name)).size,
      uniqueSymbols: new Set(active.map((t) => t.symbol)).size,
      bestPF: maxBy(active, (t) => t.profit_factor)?.profit_factor ?? null,
      bestNetProfit:
        maxBy(active, (t) => t.total_net_profit)?.total_net_profit ?? null,
      avgWinRate: avg(active.map((t) => t.win_rate)),
      avgBalanceDD: avg(active.map((t) => t.balance_dd_max_pct)),
    };
  }, [tests]);

  const recentUploads = useMemo(() => {
    return tests
      .slice()
      .sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))
      .slice(0, 5);
  }, [tests]);

  const recentColumns = useMemo<TerminalColumn<Test>[]>(
    () => [
      {
        id: 'when',
        header: 'WHEN',
        cell: (t) => (
          <span className="text-term-muted">{fmtDate(t.uploaded_at)}</span>
        ),
      },
      {
        id: 'ea',
        header: 'EA',
        cell: (t) => (
          <span>
            {cleanEaName(t.ea_name)}
            {t.ea_version ? (
              <span className="text-term-muted"> · v{t.ea_version}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'symbol',
        header: 'SYMBOL',
        cell: (t) => (
          <span className="text-term-muted">
            {t.symbol}
            {t.timeframe ? ` · ${t.timeframe}` : ''}
          </span>
        ),
      },
      {
        id: 'pf',
        header: 'PF',
        align: 'right',
        cell: (t) => fmtNum(t.profit_factor, 3),
      },
      {
        id: 'np',
        header: 'NET',
        align: 'right',
        cell: (t) => (
          <span
            className={
              (t.total_net_profit ?? 0) >= 0
                ? 'text-term-pos'
                : 'text-term-red'
            }
          >
            {fmtMoney(t.total_net_profit)}
          </span>
        ),
      },
    ],
    [],
  );

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="DASHBOARD"
        subtitle={
          isLoading
            ? 'Loading…'
            : tests.length === 0
              ? 'No tests on file yet'
              : `${stats.totalTests} test${stats.totalTests === 1 ? '' : 's'} · ${stats.uniqueEAs} EA${stats.uniqueEAs === 1 ? '' : 's'} · ${stats.uniqueSymbols} symbol${stats.uniqueSymbols === 1 ? '' : 's'}`
        }
        actions={
          <>
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/compare')}
            >
              Compare
            </BracketedButton>
            <BracketedButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/upload')}
            >
              New Upload
            </BracketedButton>
          </>
        }
      />

      {/* ─── EMPTY-STATE shortcut ─── */}
      {tests.length === 0 && !isLoading ? (
        <FramedPanel title="GET STARTED">
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-term-muted text-sm">
              No tests on file yet. Drop an MT5 strategy tester export
              (.xlsx) to get started.
            </p>
            <BracketedButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/upload')}
            >
              Go to Upload
            </BracketedButton>
          </div>
        </FramedPanel>
      ) : null}

      {/* ─── PRIMARY: Top 10 ranking + auto-applied curves ─── */}
      {tests.length > 0 ? (
        <>
          <FramedPanel
            title="TOP 10 STRATEGIES"
            titleRight={
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                {selected.length} / {MAX_SELECTED} on chart
              </span>
            }
          >
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <span className="text-term-muted text-[10px] uppercase tracking-wider">
                  Rank by
                </span>
                <Select
                  value={rankBy}
                  onChange={(e) => {
                    setRankBy(e.target.value as RankKey);
                    setAutoMode(true);
                  }}
                >
                  {RANK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-term-muted text-[10px] uppercase tracking-wider">
                  Mode
                </span>
                <BracketedTag variant={autoMode ? 'active' : 'paused'}>
                  {autoMode ? 'AUTO TOP 3' : 'CUSTOM'}
                </BracketedTag>
              </div>

              {!autoMode ? (
                <BracketedButton
                  variant="secondary"
                  size="sm"
                  onClick={resetToAuto}
                >
                  Reset to Auto
                </BracketedButton>
              ) : null}

              <div className="flex-1" />

              <span className="text-term-dim text-[10px] uppercase tracking-wider">
                click rows to toggle on chart · max {MAX_SELECTED}
              </span>
            </div>

            {top10.length === 0 ? (
              <p className="text-term-muted text-sm">
                — no tests with this metric —
              </p>
            ) : (
              <div className="flex flex-col border-t border-dashed border-term-borderDim">
                {top10.map((t, idx) => {
                  const isSelected = selectedIds.includes(t.id);
                  const colorIdx = selectedIds.indexOf(t.id);
                  const color =
                    colorIdx >= 0
                      ? OVERLAY_COLORS[colorIdx % OVERLAY_COLORS.length]
                      : undefined;
                  const sl = (t.inputs as Record<string, unknown>)?.[
                    'SlPercent'
                  ];
                  const tp = (t.inputs as Record<string, unknown>)?.[
                    'TpPercent'
                  ];
                  const rankValue = t[rankBy];
                  const rankFmt =
                    rankBy === 'profit_factor'
                      ? fmtNum(rankValue as number | null, 3)
                      : rankBy === 'total_net_profit'
                        ? fmtMoney(rankValue as number | null)
                        : fmtPct(rankValue as number | null);
                  const disabled =
                    !isSelected && selectedIds.length >= MAX_SELECTED;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggle(t.id)}
                      disabled={disabled}
                      className={[
                        'flex items-center gap-3 px-2 py-1.5 text-left text-xs font-mono',
                        'border-b border-dashed border-term-borderDim',
                        isSelected
                          ? 'bg-term-text/5 text-term-text'
                          : 'text-term-muted hover:bg-term-text/5 hover:text-term-text',
                        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {/* Rank number */}
                      <span className="w-6 text-right text-term-dim tabular-nums">
                        {idx + 1}.
                      </span>

                      {/* Color/selection indicator */}
                      <span
                        aria-hidden="true"
                        className="w-3 inline-block"
                        style={{ color }}
                      >
                        {isSelected ? '◼' : '·'}
                      </span>

                      {/* EA name */}
                      <span className="flex-1 truncate">
                        {cleanEaName(t.ea_name)}
                        {t.ea_version ? (
                          <span className="text-term-muted">
                            {' '}
                            · v{t.ea_version}
                          </span>
                        ) : null}
                      </span>

                      {/* Symbol */}
                      <span className="text-term-muted hidden md:inline w-44 truncate">
                        {t.symbol}
                        {t.timeframe ? ` · ${t.timeframe}` : ''}
                      </span>

                      {/* SL/TP if present */}
                      {typeof sl === 'number' && typeof tp === 'number' ? (
                        <span className="text-term-dim hidden md:inline w-20 text-right">
                          SL{sl}/TP{tp}
                        </span>
                      ) : (
                        <span className="hidden md:inline w-20" />
                      )}

                      {/* Rank metric (highlighted) */}
                      <span className="text-term-pos tabular-nums w-20 text-right">
                        {rankFmt}
                      </span>

                      {/* Net PnL alongside */}
                      <span
                        className={[
                          'tabular-nums w-20 text-right',
                          (t.total_net_profit ?? 0) >= 0
                            ? 'text-term-pos'
                            : 'text-term-red',
                        ].join(' ')}
                      >
                        {fmtMoney(t.total_net_profit)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FramedPanel>

          {/* ─── Equity curves overlay ─── */}
          {selected.length > 0 ? (
            <FramedPanel
              title="EQUITY CURVES"
              titleRight={
                <BracketedTag variant="active">
                  {selected.length}
                </BracketedTag>
              }
            >
              <div className="flex flex-wrap gap-3 mb-2 text-xs font-mono">
                {selected.map((t, i) => (
                  <span key={t.id} className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      style={{
                        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
                      }}
                    >
                      ──
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/tests/${t.id}`)}
                      className="hover:underline text-term-text"
                    >
                      {shortLabel(t)}
                    </button>
                  </span>
                ))}
              </div>

              {selected[0] ? (
                <EquityCurveChart
                  data={selected[0].equity_curve}
                  overlays={overlays}
                  height={360}
                  initialBalances={selected
                    .map((t, i) =>
                      t.initial_deposit != null
                        ? {
                            value: t.initial_deposit,
                            color:
                              OVERLAY_COLORS[i % OVERLAY_COLORS.length]!,
                          }
                        : null,
                    )
                    .filter((m): m is { value: number; color: string } => m !== null)}
                />
              ) : null}
            </FramedPanel>
          ) : null}

          {/* ─── Per-strategy histograms (Net PnL / PF / Max DD) ─── */}
          {top10.length > 0 ? (
            <FramedPanel
              title="STRATEGY METRICS"
              titleRight={
                <span className="text-term-muted text-[10px] uppercase tracking-wider">
                  bars match curve colour · {top10.length}/10 ranked
                </span>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricSubPanel
                  label="NET PNL"
                  info="Total profit minus total loss over the whole backtest. The single bottom-line dollar figure — positive means the strategy made money on net, negative means it lost. Compare in absolute terms, but always sanity-check against drawdown: a high net PnL paid for by a huge drawdown is not the same as one earned smoothly."
                >
                  <MetricBars
                    data={buildBarSlots(
                      top10,
                      selectedIds,
                      (t) => t.total_net_profit,
                    )}
                    format={(v) =>
                      Math.abs(v) >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : v.toFixed(0)
                    }
                  />
                </MetricSubPanel>

                <MetricSubPanel
                  label="PROFIT FACTOR"
                  info="Gross profit divided by gross loss. PF = 1.0 means wins and losses cancel out; > 1.0 is profitable, < 1.0 is losing. PF ≥ 1.5 is generally considered robust, ≥ 2.0 is excellent. Unlike net PnL, PF is scale-free: a strategy can have small net profit but a strong PF, meaning its edge per dollar risked is good."
                >
                  <MetricBars
                    data={buildBarSlots(
                      top10,
                      selectedIds,
                      (t) => t.profit_factor,
                    )}
                    format={(v) => v.toFixed(2)}
                  />
                </MetricSubPanel>

                <MetricSubPanel
                  label="MAX BAL DRAWDOWN"
                  info="The largest peak-to-trough drop in account balance, as a percentage of the peak. This is the worst losing streak the strategy lived through. Lower is better. A high drawdown means painful equity dips even if the strategy is profitable overall — and it tells you how much capital you'd need to survive the strategy's worst run without blowing up."
                >
                  <MetricBars
                    data={buildBarSlots(
                      top10,
                      selectedIds,
                      (t) => t.balance_dd_max_pct,
                    )}
                    format={(v) => `${v.toFixed(0)}%`}
                    higherIsBetter={false}
                  />
                </MetricSubPanel>

                <MetricSubPanel
                  label="MAX CONSECUTIVE (WINS / LOSSES)"
                  info="The longest streak of consecutive winning trades (green) and losing trades (red). Long losing streaks tell you how many losses in a row you'd need to mentally absorb without abandoning the strategy. Long winning streaks can flag overfitting if they look unrealistic. The win-streak ÷ loss-streak ratio is a rough proxy for the strategy's persistence under noise."
                >
                  <GroupedMetricBars
                    data={buildGroupedSlots(
                      top10,
                      selectedIds,
                      (t) => pickCountValue(t, 'Maximum consecutive wins ($)')?.count,
                      (t) => pickCountValue(t, 'Maximum consecutive losses ($)')?.count,
                    )}
                    primaryLabel="Wins"
                    secondaryLabel="Losses"
                    format={(v) => v.toFixed(0)}
                  />
                </MetricSubPanel>

                <MetricSubPanel
                  label="MAX CONSECUTIVE PNL ($)"
                  caption="Losses drawn as magnitudes — actual values are negative."
                  info="The cumulative dollar PnL of the longest winning streak (green) and the longest losing streak (red). Different from streak length: a 5-trade losing streak might cost $5k or $50k depending on position sizing and stops. This is the real worst-case dollar pain in one consecutive sequence — useful for sizing reserves and stress-testing your risk budget."
                >
                  <GroupedMetricBars
                    data={buildGroupedSlots(
                      top10,
                      selectedIds,
                      (t) =>
                        pickCountValue(t, 'Maximum consecutive wins ($)')
                          ?.value,
                      (t) => {
                        // MT5 reports the losing streak total as a
                        // negative number. Flip to its magnitude so the
                        // wins and losses bars sit on the same axis and
                        // are visually comparable. The caption above
                        // makes the sign convention explicit.
                        const v = pickCountValue(
                          t,
                          'Maximum consecutive losses ($)',
                        )?.value;
                        return typeof v === 'number' ? Math.abs(v) : undefined;
                      },
                    )}
                    primaryLabel="Wins $"
                    secondaryLabel="Losses $ (abs)"
                    format={(v) =>
                      Math.abs(v) >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : v.toFixed(0)
                    }
                  />
                </MetricSubPanel>
              </div>
            </FramedPanel>
          ) : null}

          {/* ─── Compact KPI strip ─── */}
          <FramedPanel title="OVERVIEW">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <KpiTile label="TESTS" value={stats.totalTests.toString()} />
              <KpiTile label="ACTIVE" value={stats.activeTests.toString()} />
              <KpiTile label="EAs" value={stats.uniqueEAs.toString()} />
              <KpiTile label="SYMBOLS" value={stats.uniqueSymbols.toString()} />
              <KpiTile
                label="BEST PF"
                value={fmtNum(stats.bestPF, 3)}
                tone="positive"
              />
              <KpiTile
                label="BEST NET"
                value={fmtMoney(stats.bestNetProfit)}
                tone="positive"
              />
              <KpiTile label="AVG WIN%" value={fmtPct(stats.avgWinRate)} />
              <KpiTile
                label="AVG BAL DD"
                value={fmtPct(stats.avgBalanceDD)}
                tone="warn"
              />
            </div>
            {schemas.length > 0 ? (
              <p className="text-term-dim text-[10px] uppercase tracking-wider mt-3">
                {schemas.length} EA schema{schemas.length === 1 ? '' : 's'} on file
              </p>
            ) : null}
          </FramedPanel>

          {/* ─── Recent uploads (afterthought, all the way down) ─── */}
          <FramedPanel
            title="RECENT UPLOADS"
            titleRight={
              <BracketedTag variant="neutral">
                {recentUploads.length}
              </BracketedTag>
            }
          >
            {recentUploads.length === 0 ? (
              <p className="text-term-muted text-sm">— no uploads yet —</p>
            ) : (
              <TerminalTable
                columns={recentColumns}
                rows={recentUploads}
                rowKey={(t) => t.id}
                onRowClick={(t) => navigate(`/tests/${t.id}`)}
              />
            )}
          </FramedPanel>
        </>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Build a fixed-length 10-slot array for a histogram. Each slot maps to
 * a rank position (1..10):
 *   - If a strategy occupies that rank and is currently selected →
 *     value comes through, fill colour matches its overlay colour.
 *   - If occupied but not selected → value still drawn, fill dim grey.
 *   - If unoccupied (fewer than 10 strategies on file) → value null,
 *     slot left empty so bar widths stay consistent.
 */
function buildBarSlots(
  ranked: Test[],
  selectedIds: string[],
  pick: (t: Test) => number | null | undefined,
): MetricBarsDatum[] {
  const slots: MetricBarsDatum[] = [];
  for (let i = 0; i < HIST_SLOTS; i++) {
    const t = ranked[i];
    if (!t) {
      slots.push({ label: `${i + 1}`, value: null, color: DIM_BAR_COLOR });
      continue;
    }
    const rawValue = pick(t);
    const value =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? rawValue
        : null;
    const selIdx = selectedIds.indexOf(t.id);
    const color =
      selIdx >= 0
        ? OVERLAY_COLORS[selIdx % OVERLAY_COLORS.length]!
        : DIM_BAR_COLOR;
    slots.push({ label: `${i + 1}`, value, color });
  }
  return slots;
}

/**
 * Build the two-bar histogram slots for the grouped wins/losses charts.
 * Same selection-vs-dim logic as `buildBarSlots`: occupied + selected
 * slots get the strategy's overlay tint; occupied-but-unselected slots
 * still draw bars in dim grey; empty slots reserve width.
 */
function buildGroupedSlots(
  ranked: Test[],
  selectedIds: string[],
  pickPrimary: (t: Test) => number | null | undefined,
  pickSecondary: (t: Test) => number | null | undefined,
): GroupedMetricBarsDatum[] {
  const slots: GroupedMetricBarsDatum[] = [];
  for (let i = 0; i < HIST_SLOTS; i++) {
    const t = ranked[i];
    if (!t) {
      slots.push({
        label: `${i + 1}`,
        primary: null,
        secondary: null,
        tint: DIM_BAR_COLOR,
      });
      continue;
    }
    const p = pickPrimary(t);
    const s = pickSecondary(t);
    const selIdx = selectedIds.indexOf(t.id);
    const tint =
      selIdx >= 0
        ? OVERLAY_COLORS[selIdx % OVERLAY_COLORS.length]!
        : DIM_BAR_COLOR;
    slots.push({
      label: `${i + 1}`,
      primary: typeof p === 'number' && Number.isFinite(p) ? p : null,
      secondary: typeof s === 'number' && Number.isFinite(s) ? s : null,
      tint,
    });
  }
  return slots;
}

/**
 * Extract a `{count, value}` pair from a Test's `results` bag for one
 * of MT5's compound metrics ("Maximum consecutive wins ($)" etc.).
 * Returns null if the key is absent or has the wrong shape.
 */
function pickCountValue(
  t: Test,
  key: string,
): { count: number; value: number } | null {
  const raw = (t.results as Record<string, unknown>)[key];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { count?: unknown; value?: unknown };
    if (typeof o.count === 'number' && typeof o.value === 'number') {
      return { count: o.count, value: o.value };
    }
  }
  return null;
}

function shortLabel(t: Test): string {
  const name = cleanEaName(t.ea_name);
  const sl = (t.inputs as Record<string, unknown>)?.['SlPercent'];
  const tp = (t.inputs as Record<string, unknown>)?.['TpPercent'];
  const slTp =
    typeof sl === 'number' && typeof tp === 'number'
      ? ` SL${sl}/TP${tp}`
      : '';
  return `${name}${slTp}`;
}

/**
 * One labelled cell inside the STRATEGY METRICS grid. Just a small
 * caption + the bar chart. Keeps the parent JSX terse.
 */
function MetricSubPanel({
  label,
  caption,
  info,
  children,
}: {
  label: string;
  /** Optional small note shown below the chart (e.g. sign conventions). */
  caption?: string;
  /**
   * Optional explainer text — surfaces as a `[?]` chip beside the
   * label that reveals a styled tooltip on hover/focus. Helps users
   * who don't already know what a metric means (or what it implies).
   */
  info?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-term-muted text-[10px] uppercase tracking-widest">
          {label}
        </span>
        {info ? <InfoChip text={info} ariaLabel={`About ${label}`} /> : null}
      </div>
      {children}
      {caption ? (
        <span className="text-term-dim text-[10px] italic leading-snug">
          {caption}
        </span>
      ) : null}
    </div>
  );
}

/**
 * `[?]` hover affordance. Keyboard-focusable for accessibility; the
 * tooltip body is a styled popover (not the native `title` attribute)
 * so its look matches the terminal aesthetic.
 */
function InfoChip({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  return (
    <span className="relative inline-flex group">
      <button
        type="button"
        aria-label={ariaLabel}
        className={[
          'inline-flex items-center justify-center',
          'w-4 h-4 rounded-sm',
          'text-[9px] font-bold leading-none',
          'text-term-muted hover:text-term-text',
          'border border-term-dim hover:border-term-muted',
          'transition-colors cursor-help',
          'focus:outline-none focus:ring-1 focus:ring-term-pos',
        ].join(' ')}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-20',
          'top-full left-0 mt-1',
          'w-64 max-w-[calc(100vw-2rem)]',
          'rounded-sm border border-term-dim bg-term-bg/95',
          'px-2.5 py-2',
          'text-[11px] leading-snug text-term-text',
          'font-mono',
          'shadow-lg',
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          'transition-opacity duration-100',
        ].join(' ')}
      >
        {text}
      </span>
    </span>
  );
}
