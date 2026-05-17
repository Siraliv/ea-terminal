import { BracketedButton, BracketedTag, InfoChip } from '@/components/ui';
import type { PortfolioReport, ReportBand } from '@/lib/portfolioReport';

export interface ReportSummaryProps {
  report: PortfolioReport;
  /** Opens the full deep-dive report. */
  onOpenFull: () => void;
}

/**
 * Compact "Composite Quality Score" panel.
 *
 * Sits in the bottom-left of the Manual Builder. Pairs the headline
 * verdict with a horizontal score bar, then 3-5 mixed-tone bullets
 * the user can scan in seconds. A primary [ VIEW FULL REPORT ]
 * button opens the deep-dive modal underneath.
 */
export function ReportSummary({ report, onOpenFull }: ReportSummaryProps) {
  return (
    <div className="flex flex-col gap-3 border border-dashed border-term-borderDim p-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            Composite Quality Score
          </span>
          <InfoChip
            ariaLabel="About the quality score"
            width="w-72"
            text={
              'A rules-based 0-10 rating that combines five sub-scores: ' +
              'risk-adjusted return (Sortino, 30%), drawdown depth & ' +
              'recovery (25%), drawdown duration (15%), diversification ' +
              'via avg correlation (15%), and annualised return (15%). ' +
              'Validation deductions (leave-one-out fragility + ' +
              'walk-forward overfit) can lower the score further. ' +
              'Open the full report for the breakdown.'
            }
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <ValidationChip report={report} />
          <BracketedTag variant={variantForBand(report.band)}>
            {report.band.toUpperCase()}
          </BracketedTag>
        </div>
      </div>

      <ScoreBar
        score={report.compositeScore}
        rawScore={report.rawCompositeScore}
        band={report.band}
      />

      <p className="text-term-text text-sm leading-snug">
        {report.headline}
      </p>

      <ul className="flex flex-col gap-1.5 text-sm font-mono leading-snug">
        {report.observations.map((line, i) => (
          <li
            key={i}
            className={
              line.startsWith('+')
                ? 'text-term-pos'
                : line.startsWith('▸')
                  ? 'text-term-amber'
                  : 'text-term-text'
            }
          >
            {line}
          </li>
        ))}
      </ul>

      {report.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1.5 text-sm font-mono leading-snug border border-dashed border-term-amber/60 px-2 py-1.5">
          {report.warnings.map((w, i) => (
            <li key={i} className="text-term-amber">
              ⚠ {w}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-end">
        <BracketedButton
          variant="primary"
          size="sm"
          onClick={onOpenFull}
        >
          View Full Report
        </BracketedButton>
      </div>
    </div>
  );
}

/**
 * Horizontal score track with a marker showing where the composite
 * lands on the 0-10 scale. Ticks at 1/10 boundaries (in muted).
 *
 * When `rawScore !== score` (validation deductions reduced the
 * composite), a ghost marker shows the raw pre-deduction position
 * and the readout below renders `8.1 → 5.6` to make the cause
 * legible at a glance.
 */
function ScoreBar({
  score,
  rawScore,
  band,
}: {
  score: number;
  rawScore: number;
  band: ReportBand;
}) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const rawPct = Math.max(0, Math.min(100, (rawScore / 10) * 100));
  const tone = bandColorClass(band);
  const deducted = Math.abs(rawScore - score) > 0.05;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2 bg-term-text/10">
        {/* Tick lines at 1/10 boundaries — keeps the scale honest. */}
        {Array.from({ length: 9 }, (_, i) => i + 1).map((i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-term-bg"
            style={{ left: `${i * 10}%` }}
          />
        ))}
        {/* Ghost marker at the pre-deduction position. */}
        {deducted ? (
          <div
            className="absolute top-0 bottom-0 w-1 border-l border-r border-term-muted opacity-40"
            style={{ left: `calc(${rawPct}% - 2px)` }}
            title={`Raw score before validation deductions: ${rawScore.toFixed(1)}`}
          />
        ) : null}
        {/* Marker — a thin vertical pillar in the band's tone. */}
        <div
          className={`absolute top-0 bottom-0 w-1 ${tone}`}
          style={{
            left: `calc(${pct}% - 2px)`,
            backgroundColor: 'currentColor',
          }}
        />
      </div>
      <div className="flex items-baseline justify-between text-[10px] font-mono">
        <span className="text-term-dim">0 · poor</span>
        <span className={`tabular-nums text-sm font-bold ${tone}`}>
          {deducted ? (
            <>
              <span className="text-term-muted line-through mr-1.5">
                {rawScore.toFixed(1)}
              </span>
              <span>{score.toFixed(1)}</span>
            </>
          ) : (
            `${score.toFixed(1)} / 10`
          )}
        </span>
        <span className="text-term-dim">10 · excellent</span>
      </div>
    </div>
  );
}

/**
 * Pass/fail-style chip summarising the validation outcomes for the
 * compact summary. One of:
 *   - VALIDATED — both checks ran and the portfolio passed (stable +
 *     no overfit)
 *   - FRAGILE — leave-one-out stability is low
 *   - OVERFIT — walk-forward IS/OOS gap is large
 *   - FRAGILE+OVERFIT — both
 *   - (nothing) — neither check ran (insufficient data)
 */
function ValidationChip({ report }: { report: PortfolioReport }) {
  const loo = report.leaveOneOut;
  const wf = report.walkForward;
  const ranLoo = loo && loo.entries.length > 0;
  const ranWf = wf && wf.folds.length > 0;
  if (!ranLoo && !ranWf) return null;

  const fragile = ranLoo && loo!.stabilityRatio < 0.5;
  const overfit =
    ranWf &&
    (wf!.overfitGap >= 0.6 || wf!.negativeOosFolds > wf!.folds.length / 2);

  if (!fragile && !overfit) {
    return (
      <BracketedTag
        variant="active"
        title={
          (ranLoo
            ? `Leave-one-out stability ${loo!.stabilityRatio.toFixed(2)}. `
            : '') +
          (ranWf
            ? `Walk-forward IS/OOS gap ${wf!.overfitGap.toFixed(2)} across ${wf!.folds.length} folds.`
            : '')
        }
      >
        VALIDATED
      </BracketedTag>
    );
  }
  const labels: string[] = [];
  if (fragile) labels.push('FRAGILE');
  if (overfit) labels.push('OVERFIT');
  return (
    <BracketedTag
      variant="breached"
      title={
        (fragile && loo
          ? `Stability ${loo.stabilityRatio.toFixed(2)} — load-bearing constituent. `
          : '') +
        (overfit && wf
          ? `Walk-forward gap ${wf.overfitGap.toFixed(2)} — optimiser is curve-fitting.`
          : '')
      }
    >
      {labels.join(' + ')}
    </BracketedTag>
  );
}

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

function bandColorClass(band: ReportBand): string {
  switch (band) {
    case 'Excellent':
    case 'Strong':
      return 'text-term-greenBright';
    case 'Solid':
      return 'text-term-pos';
    case 'Decent':
    case 'Marginal':
      return 'text-term-amber';
    case 'Weak':
    case 'Poor':
      return 'text-term-red';
  }
}
