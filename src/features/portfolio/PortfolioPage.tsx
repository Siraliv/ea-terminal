import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  BracketedButton,
  BracketedTag,
  FramedPanel,
  InfoChip,
  Input,
  KpiTile,
  Select,
} from '@/components/ui';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { DrawdownChart } from '@/components/charts/DrawdownChart';
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
  combinePortfolio,
  computeMetrics,
  findBestPortfolios,
  scoreLabel,
  type PortfolioMetrics,
  type RankedPortfolio,
  type ScoreKey,
} from '@/lib/portfolio';
import { formatTestLabel } from '@/lib/testCode';
import {
  deleteSavedPortfolio,
  listSavedPortfolios,
  savePortfolio,
  type SavedPortfolio,
} from '@/lib/savedPortfolios';
import { CorrelationMatrix } from './CorrelationMatrix';
import { ReportSummary } from './ReportSummary';
import { FullReportModal } from './FullReportModal';
import { composeReport, type PortfolioReport } from '@/lib/portfolioReport';
import type { Test } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const DEFAULT_START_CAPITAL = 100_000;
const POOL_CAP = 15;
const SIZE_MIN = 2;
const SIZE_MAX = 5;
const AUTO_TOP_N = 5;
/**
 * Pool selection criterion — which metric determines which `POOL_CAP`
 * tests are eligible for combination. Each criterion picks the same
 * 15 number of tests but ordered differently, so changing this can
 * radically change the AUTO recommendations.
 */
type PoolCriterion =
  | 'profit_factor'
  | 'sharpe_ratio'
  | 'total_net_profit'
  | 'recovery_factor'
  | 'balance_dd_max_pct';

const POOL_CRITERIA: Array<{
  key: PoolCriterion;
  label: string;
  /** Higher value = better? false for drawdown. */
  higherIsBetter: boolean;
}> = [
  { key: 'profit_factor', label: 'Profit Factor', higherIsBetter: true },
  { key: 'sharpe_ratio', label: 'Sharpe', higherIsBetter: true },
  { key: 'total_net_profit', label: 'Net PnL', higherIsBetter: true },
  { key: 'recovery_factor', label: 'Recovery', higherIsBetter: true },
  {
    key: 'balance_dd_max_pct',
    label: 'Max DD (lowest)',
    higherIsBetter: false,
  },
];

/**
 * Average pairwise correlation above this threshold trips a
 * concentration warning — the constituents move together, so the
 * portfolio doesn't actually diversify away its own variance.
 */
const HIGH_CORRELATION_THRESHOLD = 0.7;

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
  const [startCapital, setStartCapital] = useState<number>(
    DEFAULT_START_CAPITAL,
  );
  const [poolCriterion, setPoolCriterion] = useState<PoolCriterion>(
    'profit_factor',
  );

  // Saved portfolios — localStorage-backed for v1. Lazy-seeded on
  // first render so the initial load doesn't bounce through an
  // effect+setState pair; subsequent updates flow via the save /
  // delete callbacks below which re-read storage and patch state.
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>(
    () => listSavedPortfolios(),
  );

  // Full-report modal — null when closed.
  const [fullReportOpen, setFullReportOpen] = useState(false);

  const yearOptions = useMemo(() => availableYears(tests), [tests]);
  const isYearScoped = !isAllRange(yearRange);

  // Range-scoped candidate pool — top `POOL_CAP` by the chosen pool
  // criterion within the active window. Raw curves are not fetched
  // here at the pool stage (we'd need them for every test, expensive
  // on year-by-year search); we use the persisted downsampled curve
  // as the projection source. Portfolio recommendations are
  // directional, not audit-grade.
  const candidatePool = useMemo(() => {
    const crit = POOL_CRITERIA.find((c) => c.key === poolCriterion)!;
    return tests
      .filter((t) => matchesYearRange(t, yearRange))
      .map((t) => applyYearRangeScope(t, yearRange))
      .filter(
        (t) =>
          typeof t[poolCriterion] === 'number' &&
          Number.isFinite(t[poolCriterion] as number) &&
          t.equity_curve.length >= 2,
      )
      .sort((a, b) => {
        const av = a[poolCriterion] as number;
        const bv = b[poolCriterion] as number;
        return crit.higherIsBetter ? bv - av : av - bv;
      })
      .slice(0, POOL_CAP);
  }, [tests, yearRange, poolCriterion]);

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
      startCapital,
    });
  }, [scopedPool, score, startCapital]);

  // ── Year-by-year optimisation (button-triggered) ────────────────
  const yoYPool = useMemo(() => {
    // Year-by-year uses the *unscoped* tests but filters by year inside
    // each iteration. Cap at top POOL_CAP by the current pool criterion
    // so the search stays bounded and reflects user intent.
    const crit = POOL_CRITERIA.find((c) => c.key === poolCriterion)!;
    return tests
      .filter(
        (t) =>
          typeof t[poolCriterion] === 'number' &&
          Number.isFinite(t[poolCriterion] as number) &&
          t.equity_curve.length >= 2,
      )
      .sort((a, b) => {
        const av = a[poolCriterion] as number;
        const bv = b[poolCriterion] as number;
        return crit.higherIsBetter ? bv - av : av - bv;
      })
      .slice(0, POOL_CAP);
  }, [tests, poolCriterion]);

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
        startCapital,
      });
      return { year: y, best: top[0] ?? null };
    });
  }, [computeYoY, yearOptions, yoYPool, score, startCapital]);

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
    const { curve, correlation } = combinePortfolio(
      manualTests,
      weights,
      startCapital,
    );
    const metrics = computeMetrics(curve, startCapital, correlation);
    return { weights, curve, correlation, metrics };
  }, [manualTests, startCapital]);

  // Composite Quality Score + narrative — computed only when there's
  // a previewable portfolio. Pure derivation; no side-effects.
  const manualReport = useMemo<PortfolioReport | null>(() => {
    if (!manualPreview) return null;
    return composeReport(manualPreview.metrics, manualTests);
  }, [manualPreview, manualTests]);

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

  /** Save the current manual portfolio to localStorage under a name. */
  const saveCurrentPortfolio = useCallback(() => {
    if (manualTests.length < SIZE_MIN || !manualPreview) return;
    const defaultName = manualTests
      .map((t) => formatTestLabel(t))
      .join(' + ');
    const name = window.prompt(
      'Save this portfolio as:',
      defaultName.length > 60 ? `${manualTests.length} strategies` : defaultName,
    );
    if (!name) return;
    savePortfolio({
      name: name.trim() || defaultName,
      testIds: manualTests.map((t) => t.id),
      weights: manualPreview.weights,
      scoreKey: score,
      startCapital,
    });
    setSavedPortfolios(listSavedPortfolios());
  }, [manualTests, manualPreview, score, startCapital]);

  const loadSavedPortfolio = useCallback(
    (p: SavedPortfolio) => {
      setManualIds(p.testIds.slice(0, SIZE_MAX));
      // Mirror the saved start capital so the preview matches what
      // the user had when they saved.
      if (Number.isFinite(p.startCapital) && p.startCapital > 0) {
        setStartCapital(p.startCapital);
      }
    },
    [],
  );

  const removeSavedPortfolio = useCallback((id: string) => {
    if (!window.confirm('Delete this saved portfolio?')) return;
    deleteSavedPortfolio(id);
    setSavedPortfolios(listSavedPortfolios());
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
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                Score
              </span>
              <InfoChip
                ariaLabel="About score function"
                width="w-72"
                text={
                  'Risk-adjusted return metric used to rank candidate ' +
                  'portfolios. Sharpe uses total volatility; Sortino only ' +
                  'punishes downside volatility (usually a better fit for ' +
                  'asymmetric strategies); Calmar = annual return ÷ max ' +
                  'drawdown; Recovery = net PnL ÷ max drawdown $.'
                }
              />
            </div>
            <Select
              className="w-full"
              value={score}
              onChange={(e) => setScore(e.target.value as ScoreKey)}
            >
              <option value="sharpe">Sharpe</option>
              <option value="sortino">Sortino</option>
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                To year
              </span>
              {/* Reset to the open range. Only shown when at least
                  one endpoint is set, so the chrome stays quiet
                  when there's nothing to clear. */}
              {isYearScoped ? (
                <button
                  type="button"
                  onClick={() => setYearRange(ALL_RANGE)}
                  className="text-term-muted hover:text-term-text text-[10px] font-mono uppercase tracking-wider"
                  title="Clear the year range (back to start–end)"
                >
                  [ × clear ]
                </button>
              ) : null}
            </div>
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
            <div className="flex items-center gap-2">
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                Year-by-year
              </span>
              <InfoChip
                ariaLabel="About year-by-year compute"
                width="w-72"
                text={
                  `Re-runs the portfolio optimiser separately for each ` +
                  `calendar year. For every year, the same top-${POOL_CAP} ` +
                  `pool is scoped to that year and the best ` +
                  `${SIZE_MIN}–${SIZE_MAX}-test combination (by the current ` +
                  `Score) is shown in the table below. Useful for spotting ` +
                  `which strategies dominated in different market regimes — ` +
                  `and for catching combinations that look great over the ` +
                  `whole period only because of one explosive year.`
                }
              />
            </div>
            <BracketedButton
              variant={computeYoY ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setComputeYoY((v) => !v)}
            >
              {computeYoY ? 'Hide' : 'Compute'}
            </BracketedButton>
          </div>

          {/* Pool criterion — which 15 tests qualify as candidates. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                Pool
              </span>
              <InfoChip
                ariaLabel="About pool criterion"
                width="w-72"
                text={
                  `Which ${POOL_CAP} tests are eligible for combination. ` +
                  `Changing this can radically change the AUTO suggestions ` +
                  `— a Sharpe-ranked pool surfaces steady strategies; a ` +
                  `Net PnL-ranked pool surfaces high-return ones; a ` +
                  `Max-DD-ascending pool surfaces the safest. Picking ` +
                  `from a single dimension is itself a bias, so try ` +
                  `multiple and compare results.`
                }
              />
            </div>
            <Select
              className="w-full"
              value={poolCriterion}
              onChange={(e) =>
                setPoolCriterion(e.target.value as PoolCriterion)
              }
            >
              {POOL_CRITERIA.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Start capital — drives the dollar values shown in saved
              portfolios. The page itself displays everything in %, so
              this matters most for the "if I'd allocated $X" framing. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                Start $
              </span>
              <InfoChip
                ariaLabel="About starting capital"
                width="w-72"
                text={
                  'Seed capital used when compounding the combined ' +
                  'portfolio return back into dollars. Affects the ' +
                  'absolute Net $ / Drawdown $ numbers on saved ' +
                  'portfolios and any future projections. Percentage ' +
                  'metrics on this page are unchanged by it.'
                }
              />
            </div>
            <Input
              className="w-full"
              type="number"
              min={1000}
              step={1000}
              value={startCapital}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) setStartCapital(n);
              }}
            />
          </div>
        </div>
        <p className="text-term-dim text-[10px] italic mt-3 leading-snug">
          Pool: top {POOL_CAP} by{' '}
          {POOL_CRITERIA.find((c) => c.key === poolCriterion)?.label ??
            poolCriterion}{' '}
          within the active range. Sizes searched: {SIZE_MIN}–{SIZE_MAX}.
          Weights are equal (1/N) per constituent. Capital seeded at $
          {startCapital.toLocaleString()}. Returns are derived from
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
                  <th className="py-1 pr-2 text-right">Sortino</th>
                  <th className="py-1 pr-2 text-right">Corr</th>
                  <th className="py-1 pr-2 text-right">
                    <span className="inline-flex items-center gap-1.5 justify-end w-full">
                      <span>Adopt</span>
                      <InfoChip
                        ariaLabel="About Adopt"
                        placement="top-left"
                        text={
                          'Loads this year’s best combination into ' +
                          'the Manual Builder below so you can preview the ' +
                          'combined equity curve, see its metrics, and ' +
                          'swap constituents in / out before saving.'
                        }
                      />
                    </span>
                  </th>
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
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        best && best.metrics.sortino >= 0
                          ? 'text-term-pos'
                          : 'text-term-red'
                      }`}
                    >
                      {best ? best.metrics.sortino.toFixed(2) : '—'}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        best &&
                        best.metrics.avgPairwiseCorrelation >=
                          HIGH_CORRELATION_THRESHOLD
                          ? 'text-term-red'
                          : 'text-term-muted'
                      }`}
                    >
                      {best
                        ? best.metrics.avgPairwiseCorrelation.toFixed(2)
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

            {/* Composite Quality Score panel — only renders when there's
                a previewable portfolio. Fills the otherwise-empty space
                below the candidate list on wide screens. */}
            {manualReport ? (
              <ReportSummary
                report={manualReport}
                onOpenFull={() => setFullReportOpen(true)}
              />
            ) : null}
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-2">
            {manualPreview ? (
              <ManualPreview
                tests={manualTests}
                preview={manualPreview}
                onOpen={(id) => navigate(`/tests/${id}`)}
                onSave={saveCurrentPortfolio}
              />
            ) : (
              <p className="text-term-muted text-sm">
                — preview appears once {SIZE_MIN}+ tests are picked —
              </p>
            )}
          </div>
        </div>
      </FramedPanel>

      {/* SAVED PORTFOLIOS — only renders when the user has saved at
          least one. localStorage-backed; no infra, no sync. */}
      {savedPortfolios.length > 0 ? (
        <FramedPanel
          title="SAVED PORTFOLIOS"
          titleRight={
            <span className="text-term-muted text-[10px] uppercase tracking-wider">
              {savedPortfolios.length} saved
            </span>
          }
        >
          <ul className="flex flex-col gap-1">
            {savedPortfolios.map((p) => {
              const constituents = p.testIds
                .map((id) => tests.find((t) => t.id === id))
                .filter((t): t is Test => !!t)
                .map((t) => formatTestLabel(t));
              const missing = p.testIds.length - constituents.length;
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1 border-b border-dashed border-term-borderDim/40 last:border-b-0"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-term-text font-mono text-sm truncate">
                      {p.name}
                    </span>
                    <span className="text-term-muted text-[11px] font-mono truncate">
                      {constituents.join(' + ')}
                      {missing > 0 ? (
                        <span className="text-term-red">
                          {' '}
                          · {missing} missing
                        </span>
                      ) : null}
                      <span className="text-term-dim">
                        {' '}
                        · {scoreLabel(p.scoreKey)} · $
                        {p.startCapital.toLocaleString()}
                      </span>
                    </span>
                  </div>
                  <BracketedButton
                    variant="secondary"
                    size="sm"
                    onClick={() => loadSavedPortfolio(p)}
                    disabled={constituents.length < SIZE_MIN}
                  >
                    Load
                  </BracketedButton>
                  <BracketedButton
                    variant="destructive"
                    size="sm"
                    onClick={() => removeSavedPortfolio(p.id)}
                  >
                    Delete
                  </BracketedButton>
                </li>
              );
            })}
          </ul>
        </FramedPanel>
      ) : null}

      {/* Full deep-dive report — rendered at the document root via a
          fixed overlay; only mounted when the user actually opens it. */}
      <FullReportModal
        report={fullReportOpen ? manualReport : null}
        metrics={fullReportOpen ? manualPreview?.metrics ?? null : null}
        tests={manualTests}
        onClose={() => setFullReportOpen(false)}
      />
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
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-term-dim text-xs tabular-nums">
                #{i + 1}
              </span>
              <BracketedTag variant={r.score >= 0 ? 'active' : 'paused'}>
                {scoreLabel(score)} {r.score.toFixed(2)}
              </BracketedTag>
              {/* Concentration warning when the constituents move
                  together — high pairwise correlation means the
                  Sharpe score above is flattered by dependence. */}
              {r.metrics.avgPairwiseCorrelation >=
              HIGH_CORRELATION_THRESHOLD ? (
                <BracketedTag variant="breached">
                  HIGH CORR {r.metrics.avgPairwiseCorrelation.toFixed(2)}
                </BracketedTag>
              ) : null}
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

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
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
            <Metric
              label="Sortino"
              v={r.metrics.sortino.toFixed(2)}
              tone={r.metrics.sortino >= 0 ? 'pos' : 'red'}
            />
            <Metric
              label="Underwater %"
              v={`${r.metrics.timeUnderwaterPct.toFixed(0)}%`}
              tone="amber"
            />
            <Metric
              label="Avg corr"
              v={r.metrics.avgPairwiseCorrelation.toFixed(2)}
              tone={
                r.metrics.avgPairwiseCorrelation >=
                HIGH_CORRELATION_THRESHOLD
                  ? 'red'
                  : undefined
              }
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
  onSave,
}: {
  tests: Test[];
  preview: {
    weights: number[];
    curve: import('@/types/domain').EquityCurve;
    correlation: number[][];
    metrics: PortfolioMetrics;
  };
  onOpen: (id: string) => void;
  onSave: () => void;
}) {
  const highCorr =
    preview.metrics.avgPairwiseCorrelation >= HIGH_CORRELATION_THRESHOLD;
  return (
    <div className="flex flex-col gap-3">
      <EquityCurveChart
        data={preview.curve}
        height={220}
        asPercent
      />

      {/* Drawdown chart sits directly underneath the equity curve so
          the user reads depth + duration together. Sized small so the
          combined block fits in the right column of the builder. */}
      <DrawdownChart data={preview.curve} height={110} />

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
        <KpiTile label="SHARPE" value={preview.metrics.sharpe.toFixed(2)} />
        <KpiTile label="SORTINO" value={preview.metrics.sortino.toFixed(2)} />
        <KpiTile
          label="TIME UNDERWATER"
          value={`${preview.metrics.timeUnderwaterPct.toFixed(0)}%`}
          tone="warn"
        />
        <KpiTile
          label="LONGEST DD"
          value={`${preview.metrics.longestUnderwaterDays.toFixed(0)}d`}
          tone="warn"
        />
        <KpiTile
          label="AVG CORR"
          value={preview.metrics.avgPairwiseCorrelation.toFixed(2)}
          tone={highCorr ? 'negative' : 'neutral'}
        />
        <KpiTile
          label="RECOVERY"
          value={preview.metrics.recovery.toFixed(2)}
        />
      </div>

      {highCorr ? (
        <div className="text-[11px] font-mono text-term-red leading-snug border border-dashed border-term-red/60 px-2 py-1.5">
          ▲ Average pairwise correlation is{' '}
          {preview.metrics.avgPairwiseCorrelation.toFixed(2)} — the
          constituents move together, so this portfolio is closer to
          one leveraged strategy than a diversified set. Sharpe /
          Sortino above are flattered by that dependence.
        </div>
      ) : null}

      {/* Correlation heatmap — only meaningful for 2+ constituents,
          which is enforced upstream (preview is null below SIZE_MIN). */}
      <div className="border-t border-dashed border-term-borderDim pt-2">
        <CorrelationMatrix
          matrix={preview.correlation}
          labels={tests.map((t) => t.test_code ?? '…')}
          caption={
            `avg pairwise = ${preview.metrics.avgPairwiseCorrelation.toFixed(2)} ` +
            `(${highCorr ? 'concentrated' : 'diversified'})`
          }
        />
      </div>

      <div className="border-t border-dashed border-term-borderDim pt-2 flex items-center justify-between gap-2">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          Constituents
        </span>
        <BracketedButton variant="primary" size="sm" onClick={onSave}>
          Save Portfolio
        </BracketedButton>
      </div>
      <ul className="flex flex-col gap-0.5 text-xs font-mono">
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
            {/* Full EA name — right-aligned, dim, truncated. */}
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
