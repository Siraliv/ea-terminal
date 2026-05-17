import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  KpiTile,
  Select,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { useTestsList } from '@/hooks/useTests';
import { useRawCurves } from '@/hooks/useRawCurve';
import {
  ALL_RANGE,
  ALL_YEARS,
  availableYears,
  formatRange,
  isAllRange,
  matchesYearRange,
  type YearRange,
} from '@/lib/yearFilter';
import { applyYearRangeScope } from '@/lib/yearScope';
import {
  combineCurves,
  computeMetrics,
  findBestPortfolios,
  scoreLabel,
  type PortfolioMetrics,
  type RankedPortfolio,
  type ScoreKey,
} from '@/lib/portfolio';
import { formatTestLabel } from '@/lib/testCode';
import type { Test } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const START_CAPITAL = 100_000;
const POOL_CAP = 15;
const SIZE_MIN = 2;
const SIZE_MAX = 5;
const AUTO_TOP_N = 5;

// ─────────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const navigate = useNavigate();
  const testsQ = useTestsList();
  const tests = useMemo(() => testsQ.data ?? [], [testsQ.data]);

  const [score, setScore] = useState<ScoreKey>('sharpe');
  const [yearRange, setYearRange] = useState<YearRange>(ALL_RANGE);
  const [computeYoY, setComputeYoY] = useState(false);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [poolFilter, setPoolFilter] = useState('');

  const yearOptions = useMemo(() => availableYears(tests), [tests]);
  const isYearScoped = !isAllRange(yearRange);

  // Range-scoped candidate pool — top `POOL_CAP` by profit factor in
  // the active window. Raw curves are not fetched here (we'd need
  // them for every test, which is a lot of MB on year-by-year search);
  // we use the persisted downsampled curve as the projection source.
  // It's a deliberate trade-off — Portfolio recommendations are
  // directional, not audit-grade. The APPROX chip surfaces this.
  const candidatePool = useMemo(() => {
    return tests
      .filter((t) => matchesYearRange(t, yearRange))
      .map((t) => applyYearRangeScope(t, yearRange))
      .filter(
        (t) =>
          typeof t.profit_factor === 'number' &&
          Number.isFinite(t.profit_factor) &&
          t.equity_curve.length >= 2,
      )
      .sort(
        (a, b) =>
          (b.profit_factor as number) - (a.profit_factor as number),
      )
      .slice(0, POOL_CAP);
  }, [tests, yearRange]);

  // Lazy raw curves for the candidate pool — used so the metrics on
  // every individual constituent are accurate when scoped to a year.
  const rawCurveSlots = useRawCurves(candidatePool, isYearScoped);
  const rawCurveById = useMemo(() => {
    const map = new Map<
      string,
      ReadonlyArray<{ t: string; b: number }> | null
    >();
    for (const slot of rawCurveSlots) map.set(slot.testId, slot.data);
    return map;
  }, [rawCurveSlots]);
  const scopedPool = useMemo(
    () =>
      candidatePool.map((t) =>
        applyYearRangeScope(t, yearRange, rawCurveById.get(t.id) ?? null),
      ),
    [candidatePool, yearRange, rawCurveById],
  );

  // ── Full-period optimisation ────────────────────────────────────
  const fullPeriodResults = useMemo<RankedPortfolio[]>(() => {
    if (scopedPool.length < SIZE_MIN) return [];
    return findBestPortfolios({
      candidates: scopedPool,
      sizeMin: SIZE_MIN,
      sizeMax: SIZE_MAX,
      topN: AUTO_TOP_N,
      score,
      startCapital: START_CAPITAL,
    });
  }, [scopedPool, score]);

  // ── Year-by-year optimisation (button-triggered) ────────────────
  const yoYPool = useMemo(() => {
    // Year-by-year uses the *unscoped* tests but filters by year inside
    // each iteration. Cap at top POOL_CAP by full-period PF so the
    // search stays bounded.
    return tests
      .filter(
        (t) =>
          typeof t.profit_factor === 'number' &&
          Number.isFinite(t.profit_factor) &&
          t.equity_curve.length >= 2,
      )
      .sort(
        (a, b) =>
          (b.profit_factor as number) - (a.profit_factor as number),
      )
      .slice(0, POOL_CAP);
  }, [tests]);

  const yoYResults = useMemo<
    Array<{ year: number; best: RankedPortfolio | null }>
  >(() => {
    if (!computeYoY) return [];
    return yearOptions.map((y) => {
      const range: YearRange = { from: y, to: y };
      const pool = yoYPool
        .filter((t) => matchesYearRange(t, range))
        .map((t) => applyYearRangeScope(t, range));
      if (pool.length < SIZE_MIN) return { year: y, best: null };
      const top = findBestPortfolios({
        candidates: pool,
        sizeMin: SIZE_MIN,
        sizeMax: SIZE_MAX,
        topN: 1,
        score,
        startCapital: START_CAPITAL,
      });
      return { year: y, best: top[0] ?? null };
    });
  }, [computeYoY, yearOptions, yoYPool, score]);

  // ── Manual builder ──────────────────────────────────────────────
  const manualTests = useMemo(
    () =>
      manualIds
        .map((id) => scopedPool.find((t) => t.id === id))
        .filter((t): t is Test => !!t),
    [manualIds, scopedPool],
  );

  const manualPreview = useMemo(() => {
    if (manualTests.length < 2) return null;
    const weights = new Array<number>(manualTests.length).fill(
      1 / manualTests.length,
    );
    const curve = combineCurves(manualTests, weights, START_CAPITAL);
    const metrics = computeMetrics(curve, START_CAPITAL);
    return { weights, curve, metrics };
  }, [manualTests]);

  const toggleManual = useCallback((id: string) => {
    setManualIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= SIZE_MAX) return cur;
      return [...cur, id];
    });
  }, []);

  const clearManual = useCallback(() => setManualIds([]), []);
  const adoptPortfolio = useCallback((ids: string[]) => {
    setManualIds(ids.slice(0, SIZE_MAX));
  }, []);

  const filteredPool = useMemo(() => {
    if (!poolFilter.trim()) return scopedPool;
    const q = poolFilter.trim().toLowerCase();
    return scopedPool.filter((t) =>
      [t.ea_name, t.symbol, t.timeframe ?? '', t.ea_version ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [scopedPool, poolFilter]);

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="PORTFOLIO"
        subtitle="Find and stress-test combinations of EAs that maximise risk-adjusted return"
      />

      {/* CONTROLS */}
      <FramedPanel title="CONTROLS">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Score
            </span>
            <Select
              className="w-full"
              value={score}
              onChange={(e) => setScore(e.target.value as ScoreKey)}
            >
              <option value="sharpe">Sharpe</option>
              <option value="calmar">Calmar</option>
              <option value="recovery">Recovery</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              From year
            </span>
            <Select
              className="w-full"
              value={String(yearRange.from)}
              onChange={(e) =>
                setYearRange((r) => ({
                  ...r,
                  from:
                    e.target.value === ALL_YEARS
                      ? ALL_YEARS
                      : Number(e.target.value),
                }))
              }
            >
              <option value={ALL_YEARS}>— start —</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              To year
            </span>
            <Select
              className="w-full"
              value={String(yearRange.to)}
              onChange={(e) =>
                setYearRange((r) => ({
                  ...r,
                  to:
                    e.target.value === ALL_YEARS
                      ? ALL_YEARS
                      : Number(e.target.value),
                }))
              }
            >
              <option value={ALL_YEARS}>— end —</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              Year-by-year
            </span>
            <BracketedButton
              variant={computeYoY ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setComputeYoY((v) => !v)}
            >
              {computeYoY ? 'Hide' : 'Compute'}
            </BracketedButton>
          </div>
        </div>
        <p className="text-term-dim text-[10px] italic mt-3 leading-snug">
          Pool: top {POOL_CAP} by Profit Factor within the active range.
          Sizes searched: {SIZE_MIN}–{SIZE_MAX}. Weights are equal
          (1/N) per constituent. Capital seeded at $
          {START_CAPITAL.toLocaleString()}. Returns are derived from
          backtest curves — directional, not predictive.
        </p>
      </FramedPanel>

      {/* AUTO — FULL PERIOD */}
      <FramedPanel
        title={`AUTO — ${isYearScoped ? formatRange(yearRange).toUpperCase() : 'FULL PERIOD'}`}
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            top {AUTO_TOP_N} by {scoreLabel(score)}
          </span>
        }
      >
        {scopedPool.length < SIZE_MIN ? (
          <p className="text-term-muted text-sm">
            — need at least {SIZE_MIN} tests in the candidate pool —
          </p>
        ) : fullPeriodResults.length === 0 ? (
          <p className="text-term-muted text-sm">— no rankings —</p>
        ) : (
          <RankedList
            results={fullPeriodResults}
            tests={scopedPool}
            score={score}
            onAdopt={adoptPortfolio}
          />
        )}
      </FramedPanel>

      {/* YEAR-BY-YEAR */}
      {computeYoY ? (
        <FramedPanel
          title="AUTO — YEAR-BY-YEAR"
          titleRight={
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              best per year by {scoreLabel(score)}
            </span>
          }
        >
          {yoYResults.length === 0 ? (
            <p className="text-term-muted text-sm">— no years to score —</p>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-term-muted text-[10px] uppercase tracking-wider text-left border-b border-dashed border-term-borderDim">
                  <th className="py-1 pr-2">Year</th>
                  <th className="py-1 pr-2">Combination</th>
                  <th className="py-1 pr-2 text-right">Score</th>
                  <th className="py-1 pr-2 text-right">Net %</th>
                  <th className="py-1 pr-2 text-right">Max DD</th>
                  <th className="py-1 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {yoYResults.map(({ year, best }) => (
                  <tr
                    key={year}
                    className="border-b border-dashed border-term-borderDim/40"
                  >
                    <td className="py-1.5 pr-2 text-term-text tabular-nums">
                      {year}
                    </td>
                    <td className="py-1.5 pr-2 text-term-muted truncate max-w-[480px] font-mono">
                      {best
                        ? best.testIds
                            .map((id) => tests.find((t) => t.id === id))
                            .map((t) =>
                              t ? formatTestLabel(t) : '—',
                            )
                            .join('  +  ')
                        : '— insufficient data —'}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        best && best.score >= 0
                          ? 'text-term-pos'
                          : 'text-term-red'
                      }`}
                    >
                      {best ? best.score.toFixed(2) : '—'}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        best && best.metrics.netPnlPct >= 0
                          ? 'text-term-pos'
                          : 'text-term-red'
                      }`}
                    >
                      {best ? fmtSignedPct(best.metrics.netPnlPct) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-term-amber tabular-nums">
                      {best
                        ? `${best.metrics.maxDrawdownPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {best ? (
                        <BracketedButton
                          variant="secondary"
                          size="sm"
                          onClick={() => adoptPortfolio(best.testIds)}
                        >
                          Adopt
                        </BracketedButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FramedPanel>
      ) : null}

      {/* MANUAL BUILDER */}
      <FramedPanel
        title="MANUAL BUILDER"
        titleRight={
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            {manualIds.length} / {SIZE_MAX} picked
          </span>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Candidate list */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value)}
              placeholder="filter by EA / symbol / timeframe…"
              className="bg-term-bg border-b border-term-green/70 text-term-text font-mono px-1 py-1 focus:outline-none focus:border-term-greenBright"
            />
            <div className="border border-dashed border-term-borderDim max-h-72 overflow-y-auto">
              {filteredPool.length === 0 ? (
                <p className="text-term-muted text-sm p-2">— empty pool —</p>
              ) : (
                filteredPool.map((t) => {
                  const picked = manualIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleManual(t.id)}
                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 font-mono text-xs text-left border-b border-dashed border-term-borderDim/40 last:border-b-0 ${
                        picked
                          ? 'text-term-pos bg-term-pos/10'
                          : 'text-term-text hover:bg-term-text/5'
                      }`}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span aria-hidden="true">{picked ? '▣' : '▢'}</span>
                        <span className="truncate text-term-text">
                          {formatTestLabel(t)}
                        </span>
                      </span>
                      <span className="tabular-nums text-term-muted shrink-0">
                        PF {fmtNum(t.profit_factor, 2)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2">
              <BracketedButton
                variant="secondary"
                size="sm"
                onClick={clearManual}
                disabled={manualIds.length === 0}
              >
                Clear
              </BracketedButton>
              <span className="text-term-dim text-[10px] italic">
                pick {SIZE_MIN}–{SIZE_MAX} tests to preview
              </span>
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-2">
            {manualPreview ? (
              <ManualPreview
                tests={manualTests}
                preview={manualPreview}
                onOpen={(id) => navigate(`/tests/${id}`)}
              />
            ) : (
              <p className="text-term-muted text-sm">
                — preview appears once {SIZE_MIN}+ tests are picked —
              </p>
            )}
          </div>
        </div>
      </FramedPanel>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function RankedList({
  results,
  tests,
  score,
  onAdopt,
}: {
  results: RankedPortfolio[];
  tests: readonly Test[];
  score: ScoreKey;
  onAdopt: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {results.map((r, i) => (
        <div
          key={r.testIds.join(',')}
          className="border border-dashed border-term-borderDim p-3 flex flex-col gap-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-3">
              <span className="text-term-dim text-xs tabular-nums">
                #{i + 1}
              </span>
              <BracketedTag variant={r.score >= 0 ? 'active' : 'paused'}>
                {scoreLabel(score)} {r.score.toFixed(2)}
              </BracketedTag>
            </div>
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => onAdopt(r.testIds)}
            >
              Open in builder
            </BracketedButton>
          </div>

          <div className="text-xs font-mono text-term-text">
            {r.testIds
              .map((id) => tests.find((t) => t.id === id))
              .map((t) => (t ? formatTestLabel(t) : '— missing —'))
              .join('  +  ')}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
            <Metric
              label="Net %"
              v={fmtSignedPct(r.metrics.netPnlPct)}
              tone={r.metrics.netPnlPct >= 0 ? 'pos' : 'red'}
            />
            <Metric
              label="Max DD %"
              v={`${r.metrics.maxDrawdownPct.toFixed(1)}%`}
              tone="amber"
            />
            <Metric label="Lose run" v={`${r.metrics.maxLosingStreak}`} />
            <Metric
              label="Lose %"
              v={fmtSignedPct(
                (r.metrics.maxLosingStreakPnl / r.metrics.startCapital) * 100,
              )}
              tone="red"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ManualPreview({
  tests,
  preview,
  onOpen,
}: {
  tests: Test[];
  preview: {
    weights: number[];
    curve: import('@/types/domain').EquityCurve;
    metrics: PortfolioMetrics;
  };
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <EquityCurveChart
        data={preview.curve}
        height={260}
        asPercent
        initialBalances={[
          {
            value: preview.metrics.startCapital,
            color: 'rgb(var(--term-muted))',
            label: 'Start (0%)',
          },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiTile
          label="NET %"
          value={fmtSignedPct(preview.metrics.netPnlPct)}
          tone={preview.metrics.netPnlPct >= 0 ? 'positive' : 'negative'}
        />
        <KpiTile
          label="MAX DD %"
          value={`${preview.metrics.maxDrawdownPct.toFixed(1)}%`}
          tone="warn"
        />
        <KpiTile
          label="SHARPE"
          value={preview.metrics.sharpe.toFixed(2)}
        />
        <KpiTile
          label="LOSE STREAK"
          value={`${preview.metrics.maxLosingStreak} (${fmtSignedPct(
            (preview.metrics.maxLosingStreakPnl /
              preview.metrics.startCapital) *
              100,
          )})`}
          tone="warn"
        />
      </div>

      <div className="border-t border-dashed border-term-borderDim pt-2">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          Constituents
        </span>
        <ul className="mt-1 flex flex-col gap-0.5 text-xs font-mono">
          {tests.map((t, i) => (
            <li
              key={t.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3"
            >
              {/* Short label — clickable, opens test detail. */}
              <button
                type="button"
                onClick={() => onOpen(t.id)}
                className="text-term-text hover:underline truncate"
                title="Open test"
              >
                {formatTestLabel(t)}
              </button>
              {/* Full EA name — right-aligned, dim, truncated.
                  Disambiguates which underlying EA each short label
                  refers to without expanding the rest of the row. */}
              <span
                className="text-term-muted truncate text-right"
                title={t.ea_name}
              >
                {cleanEaName(t.ea_name)}
              </span>
              {/* Allocation weight. */}
              <span className="text-term-dim tabular-nums shrink-0 w-10 text-right">
                {(preview.weights[i]! * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Metric({
  label,
  v,
  tone,
}: {
  label: string;
  v: string;
  tone?: 'pos' | 'red' | 'amber';
}) {
  const color =
    tone === 'pos'
      ? 'text-term-pos'
      : tone === 'red'
        ? 'text-term-red'
        : tone === 'amber'
          ? 'text-term-amber'
          : 'text-term-text';
  return (
    <div className="flex flex-col">
      <span className="text-term-muted text-[10px] uppercase tracking-wider">
        {label}
      </span>
      <span className={`tabular-nums ${color}`}>{v}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────

/** `+12.3%` / `-4.5%` — always shows a sign for clarity in side-by-side reads. */
function fmtSignedPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

/**
 * Display form of an EA name — strips the trailing `(vDDMMYY)` suffix
 * that some MT5 exports embed (version is already shown in the short
 * label) and any trailing underscores. The raw value is preserved on
 * the `title` attribute so power users can still hover for the
 * verbatim string.
 */
function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}
