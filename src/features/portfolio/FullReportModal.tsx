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
