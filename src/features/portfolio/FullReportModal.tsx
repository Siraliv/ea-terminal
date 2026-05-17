import { useEffect } from 'react';
import { BracketedTag, FramedPanel } from '@/components/ui';
import type {
  PortfolioReport,
  ReportBand,
} from '@/lib/portfolioReport';
import type { PortfolioMetrics } from '@/lib/portfolio';
import { formatTestLabel } from '@/lib/testCode';
import type { Test } from '@/types/domain';

export interface FullReportModalProps {
  /** When non-null, the modal opens with this report. */
  report: PortfolioReport | null;
  metrics: PortfolioMetrics | null;
  tests: readonly Test[];
  onClose: () => void;
}

/**
 * Full-page deep-dive report. Opens when the user clicks
 * [ VIEW FULL REPORT ] on the summary panel.
 *
 * Layout (top-to-bottom inside a fixed-overlay scroll container):
 *   1. Headline + composite score band
 *   2. Constituents list
 *   3. Sub-score breakdown table (rationale per dimension)
 *   4. Strengths bullets
 *   5. Concerns bullets
 *   6. Recommendations (only those that fired)
 *   7. Warnings (only if any)
 *   8. Metric glossary footer for unfamiliar readers
 *
 * Dismiss triggers: ESC, click on the backdrop, the × button. Body
 * scroll is locked while the modal is open so the page underneath
 * doesn't drift.
 */
export function FullReportModal({
  report,
  metrics,
  tests,
  onClose,
}: FullReportModalProps) {
  useEffect(() => {
    if (!report) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [report, onClose]);

  if (!report || !metrics) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Portfolio quality report"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 flex items-start justify-center p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-term-bg border border-term-green/60 w-full max-w-3xl p-5 my-8 flex flex-col gap-4 font-mono cursor-default"
      >
        {/* Header */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-term-greenBright text-base font-pixel tracking-wide">
              PORTFOLIO REPORT
            </h2>
            <BracketedTag variant={variantForBand(report.band)}>
              {report.band.toUpperCase()} ·{' '}
              {report.compositeScore.toFixed(1)}/10
            </BracketedTag>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-term-muted hover:text-term-greenBright text-sm"
          >
            [ × close ]
          </button>
        </div>

        <p className="text-term-text text-sm leading-snug">
          {report.headline}
        </p>

        {/* Constituents */}
        <FramedPanel title="CONSTITUENTS">
          <ul className="flex flex-col gap-0.5 text-xs">
            {tests.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[auto_1fr] items-center gap-3"
              >
                <span className="text-term-text">{formatTestLabel(t)}</span>
                <span
                  className="text-term-muted truncate text-right"
                  title={t.ea_name}
                >
                  {cleanEaName(t.ea_name)}
                </span>
              </li>
            ))}
          </ul>
        </FramedPanel>

        {/* Sub-score breakdown */}
        <FramedPanel title="SCORE BREAKDOWN">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-term-muted text-[10px] uppercase tracking-wider text-left border-b border-dashed border-term-borderDim">
                <th className="py-1 pr-2">Dimension</th>
                <th className="py-1 pr-2 text-right">Score</th>
                <th className="py-1 pr-2 text-right">Weight</th>
                <th className="py-1 pr-2">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {report.subScores.map((s) => (
                <tr
                  key={s.key}
                  className="border-b border-dashed border-term-borderDim/40 align-top"
                >
                  <td className="py-1.5 pr-2 text-term-text">{s.label}</td>
                  <td
                    className={`py-1.5 pr-2 text-right tabular-nums ${scoreColorClass(s.value)}`}
                  >
                    {s.value.toFixed(1)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-term-muted tabular-nums">
                    {(s.weight * 100).toFixed(0)}%
                  </td>
                  <td className="py-1.5 pr-2 text-term-muted leading-snug">
                    {s.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FramedPanel>

        {/* Strengths */}
        {report.strengths.length > 0 ? (
          <FramedPanel title="STRENGTHS">
            <ul className="flex flex-col gap-1.5 text-xs text-term-text leading-snug">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-term-pos shrink-0">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </FramedPanel>
        ) : null}

        {/* Concerns */}
        {report.concerns.length > 0 ? (
          <FramedPanel title="CONCERNS">
            <ul className="flex flex-col gap-1.5 text-xs text-term-text leading-snug">
              {report.concerns.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-term-amber shrink-0">▸</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </FramedPanel>
        ) : null}

        {/* Recommendations */}
        {report.recommendations.length > 0 ? (
          <FramedPanel title="RECOMMENDATIONS">
            <ul className="flex flex-col gap-1.5 text-xs text-term-text leading-snug">
              {report.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-term-greenBright shrink-0">→</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </FramedPanel>
        ) : null}

        {/* Leave-one-out */}
        {report.leaveOneOut && report.leaveOneOut.entries.length > 0 ? (
          <FramedPanel
            title="LEAVE-ONE-OUT — CONSTITUENT FRAGILITY"
            titleRight={
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                stability {report.leaveOneOut.stabilityRatio.toFixed(2)}
              </span>
            }
          >
            <p className="text-term-text text-xs leading-snug mb-2">
              Each row drops one constituent and re-evaluates the
              remaining strategies at equal weights. A stable portfolio
              shows similar Sharpe values across all rows; if one
              dramatically lower row is the load-bearing strategy.
              Stability ratio = lowest-after-drop Sharpe ÷ full Sharpe;
              <span className="text-term-pos"> ≥ 0.75 robust</span>,
              <span className="text-term-amber"> 0.25–0.75 fragile</span>,
              <span className="text-term-red"> &lt; 0.25 single-strategy bet in disguise</span>.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-term-muted text-[10px] uppercase tracking-wider text-left border-b border-dashed border-term-borderDim">
                  <th className="py-1 pr-2">Dropped</th>
                  <th className="py-1 pr-2 text-right">Sharpe without</th>
                  <th className="py-1 pr-2 text-right">Sortino without</th>
                  <th className="py-1 pr-2 text-right">Δ vs full</th>
                </tr>
              </thead>
              <tbody>
                {report.leaveOneOut.entries.map((e) => {
                  const t = tests.find((x) => x.id === e.droppedTestId);
                  const delta = e.sharpe - report.leaveOneOut!.fullSharpe;
                  const isWorst =
                    e.droppedTestId ===
                    report.leaveOneOut!.loadBearingTestId;
                  return (
                    <tr
                      key={e.droppedTestId}
                      className={`border-b border-dashed border-term-borderDim/40 ${
                        isWorst ? 'bg-term-red/10' : ''
                      }`}
                    >
                      <td className="py-1.5 pr-2 text-term-text">
                        {t ? formatTestLabel(t) : e.droppedTestId}
                        {isWorst ? (
                          <span className="text-term-red ml-2 text-[10px]">
                            ← load-bearing
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-term-text">
                        {e.sharpe.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-term-muted">
                        {e.sortino.toFixed(2)}
                      </td>
                      <td
                        className={`py-1.5 pr-2 text-right tabular-nums ${
                          delta >= 0 ? 'text-term-pos' : 'text-term-red'
                        }`}
                      >
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-1.5 pr-2 text-term-muted">
                    (full portfolio)
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-term-text font-semibold">
                    {report.leaveOneOut.fullSharpe.toFixed(2)}
                  </td>
                  <td className="py-1.5 pr-2" />
                  <td className="py-1.5 pr-2" />
                </tr>
              </tbody>
            </table>
          </FramedPanel>
        ) : null}

        {/* Walk-forward */}
        {report.walkForward && report.walkForward.folds.length > 0 ? (
          <FramedPanel
            title="WALK-FORWARD — IN-SAMPLE vs OUT-OF-SAMPLE"
            titleRight={
              <span className="text-term-muted text-[10px] uppercase tracking-wider">
                gap {report.walkForward.overfitGap.toFixed(2)}
              </span>
            }
          >
            <p className="text-term-text text-xs leading-snug mb-2">
              For each fold, the optimiser searches only data{' '}
              <em>before</em> the fold (in-sample), then evaluates the
              winning combo on the fold's data (out-of-sample). Large
              IS↔OOS gaps mean the optimiser is picking combos that
              don't generalise — i.e. curve-fitting.{' '}
              <span className="text-term-pos">Gap &lt; 0.3 healthy</span>,
              <span className="text-term-amber"> 0.3–1.0 expected</span>,
              <span className="text-term-red"> &gt; 1.0 overfit</span>.
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-term-muted text-[10px] uppercase tracking-wider text-left border-b border-dashed border-term-borderDim">
                  <th className="py-1 pr-2">Fold</th>
                  <th className="py-1 pr-2">Window</th>
                  <th className="py-1 pr-2">IS combo</th>
                  <th className="py-1 pr-2 text-right">IS</th>
                  <th className="py-1 pr-2 text-right">OOS</th>
                </tr>
              </thead>
              <tbody>
                {report.walkForward.folds.map((f) => (
                  <tr
                    key={f.fold}
                    className="border-b border-dashed border-term-borderDim/40"
                  >
                    <td className="py-1.5 pr-2 text-term-dim tabular-nums">
                      #{f.fold}
                    </td>
                    <td className="py-1.5 pr-2 text-term-muted tabular-nums">
                      {f.oosStart.slice(0, 10)} → {f.oosEnd.slice(0, 10)}
                    </td>
                    <td className="py-1.5 pr-2 text-term-text truncate max-w-[200px]">
                      {f.chosenTestIds
                        .map((id) => tests.find((t) => t.id === id))
                        .map((t) => (t ? formatTestLabel(t) : '—'))
                        .join(' + ')}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        f.inSampleScore >= 0
                          ? 'text-term-text'
                          : 'text-term-red'
                      }`}
                    >
                      {f.inSampleScore.toFixed(2)}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right tabular-nums ${
                        f.outOfSampleScore >= 0
                          ? 'text-term-pos'
                          : 'text-term-red'
                      }`}
                    >
                      {f.outOfSampleScore.toFixed(2)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-2 text-term-muted text-[10px] uppercase tracking-wider">
                    mean
                  </td>
                  <td />
                  <td />
                  <td className="py-2 pr-2 text-right tabular-nums text-term-text font-semibold">
                    {report.walkForward.meanInSample.toFixed(2)}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-term-pos font-semibold">
                    {report.walkForward.meanOutOfSample.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            {report.walkForward.negativeOosFolds > 0 ? (
              <p className="text-term-amber text-[11px] italic mt-2">
                ⚠ {report.walkForward.negativeOosFolds} of{' '}
                {report.walkForward.folds.length} folds had non-positive
                out-of-sample scores.
              </p>
            ) : null}
          </FramedPanel>
        ) : null}

        {/* Warnings */}
        {report.warnings.length > 0 ? (
          <FramedPanel title="WARNINGS">
            <ul className="flex flex-col gap-1.5 text-xs text-term-amber leading-snug">
              {report.warnings.map((w, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0">⚠</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </FramedPanel>
        ) : null}

        {/* Glossary footer */}
        <FramedPanel title="METRIC GLOSSARY">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] leading-snug">
            {GLOSSARY.map(([term, defn]) => (
              <div key={term} className="flex flex-col">
                <dt className="text-term-muted uppercase tracking-wider text-[10px]">
                  {term}
                </dt>
                <dd className="text-term-text">{defn}</dd>
              </div>
            ))}
          </dl>
        </FramedPanel>

        <p className="text-term-dim text-[10px] italic leading-snug">
          Report is rules-based and deterministic — every line traces to a
          specific metric and threshold in `src/lib/portfolioReport.ts`.
          No external model is called.
        </p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Glossary — kept inline so it lives next to the report rendering
// (rather than getting buried in a separate help page).
// ────────────────────────────────────────────────────────────────

const GLOSSARY: Array<readonly [string, string]> = [
  ['Sharpe', 'Annualised mean return ÷ total volatility. Punishes upside swings as much as downside.'],
  ['Sortino', 'Like Sharpe but only counts downside volatility. Better fit for asymmetric strategies.'],
  ['Calmar', 'Annualised return ÷ max drawdown %. Tells you how much return per unit of worst-case pain.'],
  ['Recovery', 'Net PnL ÷ |max drawdown $|. Below 1 means the worst drawdown exceeded total realised profit.'],
  ['Max DD %', 'Worst peak-to-trough drop, as % of the running peak. Depth of pain.'],
  ['Longest DD', 'Longest single continuous stretch spent below a prior peak, in days. Duration of pain.'],
  ['Time underwater', 'Fraction of the period spent below a prior peak. Most strategies sit 30–50%; > 80% is heavy.'],
  ['Avg corr', 'Average pairwise Pearson correlation between constituents. 0 = independent, 1 = lockstep.'],
  ['Leave-one-out', 'Drop each constituent and re-score the rest. Reveals whether the portfolio depends on a single load-bearing strategy.'],
  ['Stability ratio', 'Lowest leave-one-out Sharpe ÷ full-portfolio Sharpe. ≥ 0.75 robust, < 0.25 single-strategy bet.'],
  ['Walk-forward', 'Optimise on past data, evaluate on the next slice. Repeated across chronological folds.'],
  ['IS / OOS gap', 'In-sample minus out-of-sample average score. Large gap = the optimiser is curve-fitting; healthy gap is < 0.3.'],
];

function variantForBand(band: ReportBand): 'active' | 'paused' | 'breached' {
  switch (band) {
    case 'Excellent':
    case 'Strong':
    case 'Solid':
      return 'active';
    case 'Decent':
    case 'Marginal':
      return 'paused';
    case 'Weak':
    case 'Poor':
      return 'breached';
  }
}

function scoreColorClass(value: number): string {
  if (value >= 7.5) return 'text-term-pos';
  if (value >= 5) return 'text-term-text';
  if (value >= 3) return 'text-term-amber';
  return 'text-term-red';
}

function cleanEaName(name: string): string {
  return name.replace(/\s*\(v\d{6}\)\s*$/, '').replace(/_+$/, '');
}
