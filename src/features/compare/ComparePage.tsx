import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  Input,
  Select,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { useTestsList } from '@/hooks/useTests';
import type { Test } from '@/types/domain';
import {
  ALL_YEARS,
  availableYears,
  matchesYear,
  type YearFilter,
} from '@/lib/yearFilter';
import { applyYearScope } from '@/lib/yearScope';
import { rollUpRawStatus, useRawCurves } from '@/hooks/useRawCurve';

/** Up to N tests at once. More than 5 overlapping curves is unreadable. */
const MAX_SELECTED = 5;

/** Colours for overlay curves — distinct in every theme. */
const OVERLAY_COLORS = [
  'rgb(var(--term-pos))', // primary green
  'rgb(var(--term-amber))', // amber
  'rgb(var(--term-red))', // red
  'rgb(var(--term-gold))', // gold
  'rgb(var(--term-muted))', // grey
];

function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}

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

function shortLabel(t: Test, idx: number): string {
  const name = cleanEaName(t.ea_name);
  // Take the last 8 chars of the id for a stable short suffix.
  const idTail = t.id.slice(0, 6);
  // Show key inputs in the label so colors are easier to map.
  const sl = (t.inputs as Record<string, unknown>)?.['SlPercent'];
  const tp = (t.inputs as Record<string, unknown>)?.['TpPercent'];
  const slTp =
    typeof sl === 'number' && typeof tp === 'number'
      ? ` SL${sl}/TP${tp}`
      : '';
  return `${idx + 1}. ${name}${slTp} · ${idTail}`;
}

/**
 * "Higher is better" indicator, per metric. Used to colour the winner
 * cell green and the laggard red in the deltas grid.
 */
const HIGHER_IS_BETTER: Record<string, boolean> = {
  total_net_profit: true,
  profit_factor: true,
  expected_payoff: true,
  recovery_factor: true,
  sharpe_ratio: true,
  win_rate: true,
  total_trades: true,
  balance_dd_max_pct: false,
  equity_dd_max_pct: false,
};

const COMPARE_ROWS: Array<{
  field: keyof Test;
  label: string;
  fmt: (n: number | null | undefined) => string;
}> = [
  { field: 'total_net_profit', label: 'Net Profit', fmt: fmtMoney },
  { field: 'profit_factor', label: 'Profit Factor', fmt: (n) => fmtNum(n, 3) },
  { field: 'expected_payoff', label: 'Expected Payoff', fmt: (n) => fmtNum(n, 2) },
  { field: 'recovery_factor', label: 'Recovery', fmt: (n) => fmtNum(n, 2) },
  { field: 'sharpe_ratio', label: 'Sharpe', fmt: (n) => fmtNum(n, 2) },
  { field: 'balance_dd_max_pct', label: 'Bal DD %', fmt: fmtPct },
  { field: 'equity_dd_max_pct', label: 'Eq DD %', fmt: fmtPct },
  { field: 'total_trades', label: 'Total Trades', fmt: (n) => (n == null ? '—' : n.toLocaleString()) },
  { field: 'win_rate', label: 'Win Rate', fmt: fmtPct },
];

interface RowResult {
  field: keyof Test;
  label: string;
  fmt: (n: number | null | undefined) => string;
  values: Array<number | null>;
  bestIdx: number | null;
  worstIdx: number | null;
}

function computeRows(selected: Test[]): RowResult[] {
  return COMPARE_ROWS.map((row) => {
    const values = selected.map((t) => {
      const v = t[row.field];
      return typeof v === 'number' ? v : null;
    });
    const valid = values
      .map((v, i) => ({ v, i }))
      .filter((p): p is { v: number; i: number } => typeof p.v === 'number');

    let bestIdx: number | null = null;
    let worstIdx: number | null = null;
    if (valid.length >= 2) {
      const higher = HIGHER_IS_BETTER[row.field as string] ?? true;
      const sorted = valid.slice().sort((a, b) => (higher ? b.v - a.v : a.v - b.v));
      const top = sorted[0]!;
      const bot = sorted[sorted.length - 1]!;
      if (top.v !== bot.v) {
        bestIdx = top.i;
        worstIdx = bot.i;
      }
    }

    return { ...row, values, bestIdx, worstIdx };
  });
}

export function ComparePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tests = [], isLoading, error } = useTestsList();

  const [eaFilter, setEaFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<YearFilter>(ALL_YEARS);
  const [search, setSearch] = useState<string>('');

  const yearOptions = useMemo(() => availableYears(tests), [tests]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const ids = searchParams.get('ids');
    return ids ? ids.split(',').filter(Boolean).slice(0, MAX_SELECTED) : [];
  });

  // Mirror selection to URL. Mutate the existing search params rather
  // than constructing a fresh one — otherwise unrelated query keys
  // (e.g. `?from=email`, `?ref=…`) would be wiped on first render.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selectedIds.length) next.set('ids', selectedIds.join(','));
        else next.delete('ids');
        return next;
      },
      { replace: true },
    );
  }, [selectedIds, setSearchParams]);

  const eaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tests) set.add(t.ea_name);
    return Array.from(set).sort();
  }, [tests]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((t) => {
      if (eaFilter && t.ea_name !== eaFilter) return false;
      if (!matchesYear(t, yearFilter)) return false;
      if (!q) return true;
      const hay = [t.ea_name, t.ea_version ?? '', t.symbol, t.timeframe ?? '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tests, eaFilter, yearFilter, search]);

  const isYearScoped = yearFilter !== ALL_YEARS;

  /**
   * Un-scoped versions of the currently picked tests. Pre-computed
   * once and reused for both the raw-curve fetch and the chart so
   * the year filter doesn't ripple unnecessary refetches.
   */
  const selectedSource = useMemo(
    () =>
      selectedIds
        .map((id) => tests.find((t) => t.id === id))
        .filter((t): t is Test => !!t),
    [tests, selectedIds],
  );

  /**
   * Lazy-load full-resolution curves for the picked tests when a
   * year filter is active, then thread them through `applyYearScope`
   * so the per-test numbers (PnL, DD, PF, win rate, streaks) become
   * exact rather than downsampled approximations.
   */
  const rawCurveSlots = useRawCurves(selectedSource, isYearScoped);
  const rawStatus = useMemo(
    () => rollUpRawStatus(rawCurveSlots),
    [rawCurveSlots],
  );
  const rawCurveById = useMemo(() => {
    const map = new Map<string, ReadonlyArray<{ t: string; b: number }> | null>();
    for (const slot of rawCurveSlots) map.set(slot.testId, slot.data);
    return map;
  }, [rawCurveSlots]);

  // Resolve selection from the *raw* tests list, then project onto the
  // active year filter. When `yearFilter === 'all'` `applyYearScope` is
  // the identity transform, so this collapses to the original lookup.
  const selected = useMemo(
    () =>
      selectedSource.map((t) =>
        applyYearScope(t, yearFilter, rawCurveById.get(t.id) ?? null),
      ),
    [selectedSource, yearFilter, rawCurveById],
  );

  /**
   * Un-scoped versions of the selected tests. The chart renders these
   * so the user sees each strategy's full arc; the active year window
   * is rendered as a highlight band on top. Metric tiles + delta
   * table still use the year-projected `selected`.
   */
  const selectedRaw = useMemo(
    () =>
      selectedIds
        .map((id) => tests.find((t) => t.id === id))
        .filter((t): t is Test => !!t),
    [selectedIds, tests],
  );

  /** UTC [Jan 1, Jan 1+1y) of the selected year, when year-scoped. */
  const yearHighlight = useMemo<[number, number] | undefined>(() => {
    if (!isYearScoped) return undefined;
    const y = yearFilter as number;
    return [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)];
  }, [isYearScoped, yearFilter]);

  const overlays = useMemo(() => {
    if (selectedRaw.length === 0) return [];
    // The first selected becomes the primary curve in the chart;
    // remaining ones become overlays. Both use the un-scoped curve so
    // the active year is shown as a highlight, not a clipped slice.
    return selectedRaw.slice(1).map((t, i) => ({
      id: t.id,
      label: shortLabel(t, i + 1),
      data: t.equity_curve,
      color: OVERLAY_COLORS[(i + 1) % OVERLAY_COLORS.length]!,
    }));
  }, [selectedRaw]);

  const rows = useMemo(() => computeRows(selected), [selected]);

  const toggle = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SELECTED) return cur;
      return [...cur, id];
    });
  };

  const clear = () => setSelectedIds([]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="COMPARE" subtitle="Failed to load tests" />
        <FramedPanel title="ERROR">
          <p className="text-term-red text-sm">
            {error instanceof Error ? error.message : 'Unknown error.'}
          </p>
        </FramedPanel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="COMPARE"
        subtitle={
          isLoading
            ? 'Loading…'
            : selected.length === 0
              ? 'Select 2-5 tests to overlay equity curves and diff metrics'
              : `${selected.length} selected · max ${MAX_SELECTED}`
        }
        actions={
          <>
            {selected.length > 0 ? (
              <BracketedButton variant="secondary" size="sm" onClick={clear}>
                Clear
              </BracketedButton>
            ) : null}
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/tests')}
            >
              Library
            </BracketedButton>
          </>
        }
      />

      {/* SELECTION PANEL */}
      <FramedPanel
        title="PICK TESTS"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            {selected.length} / {MAX_SELECTED}
          </span>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              EA
            </span>
            <Select
              value={eaFilter}
              onChange={(e) => setEaFilter(e.target.value)}
            >
              <option value="">— all —</option>
              {eaOptions.map((ea) => (
                <option key={ea} value={ea}>
                  {ea}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Year
            </span>
            <div className="flex items-center gap-2">
              <Select
                value={String(yearFilter)}
                onChange={(e) => {
                  const v = e.target.value;
                  setYearFilter(v === ALL_YEARS ? ALL_YEARS : Number(v));
                }}
              >
                <option value={ALL_YEARS}>— all —</option>
                {yearOptions.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
              {isYearScoped ? <ScopeChip status={rawStatus} /> : null}
            </div>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Search
            </span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ea, symbol, timeframe…"
            />
          </div>
        </div>

        {tests.length === 0 ? (
          <p className="text-term-muted text-sm">— no tests on file —</p>
        ) : candidates.length === 0 ? (
          <p className="text-term-muted text-sm">— no matches —</p>
        ) : (
          <div className="flex flex-col max-h-72 overflow-y-auto border-t border-dashed border-term-borderDim">
            {candidates.map((t) => {
              const isSelected = selectedIds.includes(t.id);
              const idx = selectedIds.indexOf(t.id);
              const color =
                idx >= 0
                  ? OVERLAY_COLORS[idx % OVERLAY_COLORS.length]
                  : undefined;
              const sl = (t.inputs as Record<string, unknown>)?.['SlPercent'];
              const tp = (t.inputs as Record<string, unknown>)?.['TpPercent'];

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  disabled={!isSelected && selected.length >= MAX_SELECTED}
                  className={[
                    'flex items-center gap-3 px-2 py-1.5 text-left text-xs font-mono',
                    'border-b border-dashed border-term-borderDim',
                    isSelected
                      ? 'bg-term-text/5 text-term-text'
                      : 'text-term-muted hover:bg-term-text/5 hover:text-term-text',
                    !isSelected && selected.length >= MAX_SELECTED
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="w-3 inline-block"
                    style={{ color }}
                  >
                    {isSelected ? '◼' : '·'}
                  </span>
                  <span className="flex-1 truncate">
                    {cleanEaName(t.ea_name)}
                    {t.ea_version ? (
                      <span className="text-term-muted"> · v{t.ea_version}</span>
                    ) : null}
                  </span>
                  <span className="text-term-muted hidden md:inline">
                    {t.symbol}
                    {t.timeframe ? ` · ${t.timeframe}` : ''}
                  </span>
                  {typeof sl === 'number' && typeof tp === 'number' ? (
                    <span className="text-term-dim hidden md:inline">
                      SL{sl}/TP{tp}
                    </span>
                  ) : null}
                  <span className="text-term-pos tabular-nums w-16 text-right">
                    {fmtNum(t.profit_factor, 2)}
                  </span>
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

      {/* OVERLAY CHART */}
      {selected.length >= 1 ? (
        <FramedPanel
          title="EQUITY CURVES"
          titleRight={
            <BracketedTag variant="active">{selected.length}</BracketedTag>
          }
        >
          <div className="flex flex-wrap gap-3 mb-2 text-xs font-mono">
            {selected.map((t, i) => (
              <span key={t.id} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  style={{ color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }}
                >
                  ──
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/tests/${t.id}`)}
                  className="hover:underline text-term-text"
                >
                  {shortLabel(t, i)}
                </button>
              </span>
            ))}
          </div>

          {selectedRaw[0] ? (
            <EquityCurveChart
              data={selectedRaw[0].equity_curve}
              overlays={overlays}
              height={360}
              highlightRange={yearHighlight}
              highlightLabel={
                isYearScoped ? String(yearFilter) : undefined
              }
              initialBalances={selectedRaw
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

      {/* DELTA TABLE */}
      {selected.length >= 2 ? (
        <FramedPanel title="METRICS DELTA">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm border-separate border-spacing-0 tabular-nums">
              <thead className="text-term-text text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2 py-1 font-normal">METRIC</th>
                  {selected.map((t, i) => (
                    <th
                      key={t.id}
                      className="text-right px-2 py-1 font-normal whitespace-nowrap"
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
                        }}
                      >
                        ●{' '}
                      </span>
                      {i + 1}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="text-left px-2 pb-1 font-normal text-term-muted">
                    {''}
                  </th>
                  {selected.map((t) => {
                    const sl = (t.inputs as Record<string, unknown>)?.[
                      'SlPercent'
                    ];
                    const tp = (t.inputs as Record<string, unknown>)?.[
                      'TpPercent'
                    ];
                    return (
                      <th
                        key={t.id}
                        className="text-right px-2 pb-1 font-normal text-term-muted whitespace-nowrap"
                      >
                        {typeof sl === 'number' && typeof tp === 'number'
                          ? `SL${sl}/TP${tp}`
                          : '—'}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={String(row.field)}
                    className="border-b border-dashed border-term-borderDim"
                  >
                    <td className="text-left px-2 py-1 text-term-muted whitespace-nowrap">
                      {row.label}
                    </td>
                    {row.values.map((v, i) => {
                      let cls = 'text-term-text';
                      if (row.bestIdx === i) cls = 'text-term-pos';
                      else if (row.worstIdx === i) cls = 'text-term-red';
                      return (
                        <td
                          key={i}
                          className={`text-right px-2 py-1 ${cls}`}
                        >
                          {row.fmt(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-term-dim text-xs mt-3">
            Green = best, red = worst. Drawdown rows treat lower as better.
          </p>
        </FramedPanel>
      ) : null}

      {selected.length === 0 ? (
        <FramedPanel title="HOW TO COMPARE">
          <ul className="text-term-muted text-sm list-none space-y-1">
            <li>
              <span className="text-term-text">▸</span> Pick 2-5 tests from the
              list above (filter by EA / search if you have many).
            </li>
            <li>
              <span className="text-term-text">▸</span> Their equity curves
              overlay on a single chart, color-coded.
            </li>
            <li>
              <span className="text-term-text">▸</span> A side-by-side metrics
              table highlights the best (green) and worst (red) per metric.
            </li>
          </ul>
        </FramedPanel>
      ) : null}
    </div>
  );
}

/**
 * Same status-aware chip used on the Dashboard. Communicates whether
 * year-scoped metrics are RAW (from full-resolution Storage curves),
 * still LOADING those curves, or APPROX (fall-back to downsampled).
 */
function ScopeChip({
  status,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error';
}) {
  if (status === 'loading') {
    return (
      <BracketedTag
        variant="paused"
        title={
          'Fetching full-resolution equity curves from Storage. ' +
          'Numbers shown are approximate until they finish loading.'
        }
      >
        LOADING…
      </BracketedTag>
    );
  }
  if (status === 'error') {
    return (
      <BracketedTag
        variant="paused"
        title={
          'Could not load full-resolution curves for the picked ' +
          'tests. Showing approximate values derived from the ' +
          'downsampled curve.'
        }
      >
        APPROX
      </BracketedTag>
    );
  }
  return (
    <BracketedTag
      variant="active"
      title={
        'Year-scoped metrics are derived from the full-resolution ' +
        'equity curves and match MT5 within rounding.'
      }
    >
      RAW
    </BracketedTag>
  );
}
