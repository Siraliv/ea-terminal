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
              'Open the full report for the breakdown.'
            }
          />
        </div>
        <BracketedTag variant={variantForBand(report.band)}>
          {report.band.toUpperCase()}
        </BracketedTag>
      </div>

      <ScoreBar score={report.compositeScore} band={report.band} />

      <p className="text-term-text text-xs leading-snug">
        {report.headline}
      </p>

      <ul className="flex flex-col gap-1 text-[11px] font-mono leading-snug">
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
        <ul className="flex flex-col gap-1 text-[11px] font-mono leading-snug border border-dashed border-term-amber/60 px-2 py-1.5">
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
 * lands on the 0-10 scale. Ticks at 1/10 boundaries (in muted),
 * with a coloured marker at the actual score.
 */
function ScoreBar({
  score,
  band,
}: {
  score: number;
  band: ReportBand;
}) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const tone = bandColorClass(band);
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
          {score.toFixed(1)} / 10
        </span>
        <span className="text-term-dim">10 · excellent</span>
      </div>
    </div>
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
