import { type HTMLAttributes } from 'react';

export type AsciiProgressProps = {
  /** Fill percentage, 0-100. Values outside the range are clamped. */
  value: number;
  /** Total bar width in characters. */
  width?: number;
  /** Optional label rendered on the left (e.g. "DAILY LOSS"). */
  label?: string;
  /** Threshold at which the fill color switches to amber. Default 60. */
  amberAt?: number;
  /** Threshold at which the fill color switches to red. Default 85. */
  redAt?: number;
  /** Hide the trailing `42%` numeric readout. */
  hideReadout?: boolean;
  /** Hide the `◆` position marker at the fill's leading edge. */
  hideMarker?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

const FULL = '█';
const EMPTY = '·';
const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']; // 1/8..7/8

/**
 * ASCII progress gauge with sub-character resolution.
 *
 *   DAILY LOSS  |████████▎····················| 34%
 *
 * Color shifts green → amber → red as the fill crosses the configured
 * thresholds. A `◆` marker is placed at the leading edge of the fill to
 * read as a current-position indicator on prop-firm dashboards.
 */
export function AsciiProgress({
  value,
  width = 30,
  label,
  amberAt = 60,
  redAt = 85,
  hideReadout = false,
  hideMarker = false,
  className,
  ...rest
}: AsciiProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  const totalEighths = Math.round((pct / 100) * width * 8);
  const fullCount = Math.floor(totalEighths / 8);
  const partialIdx = totalEighths % 8;
  const hasPartial = partialIdx > 0 && fullCount < width;

  const fullStr = FULL.repeat(Math.min(fullCount, width));
  const partialChar = hasPartial ? PARTIALS[partialIdx] : '';
  const emptyCount = Math.max(0, width - fullCount - (hasPartial ? 1 : 0));
  const emptyStr = EMPTY.repeat(emptyCount);

  const color =
    pct >= redAt
      ? 'text-term-red'
      : pct >= amberAt
        ? 'text-term-amber'
        : 'text-term-green';

  return (
    <div
      {...rest}
      className={[
        'font-mono text-sm whitespace-pre select-none flex items-center gap-2',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
    >
      {label ? (
        <span className="uppercase tracking-wide text-term-muted shrink-0">{label}</span>
      ) : null}
      <span className="text-term-dim shrink-0">|</span>
      <span className={[color, 'shrink-0'].join(' ')}>
        {fullStr}
        {partialChar}
        {!hideMarker && pct > 0 && pct < 100 ? '◆' : ''}
        <span className="text-term-dim">
          {/* If marker consumed a slot, shrink empty by one */}
          {!hideMarker && pct > 0 && pct < 100
            ? emptyStr.slice(1)
            : emptyStr}
        </span>
      </span>
      <span className="text-term-dim shrink-0">|</span>
      {!hideReadout ? (
        <span className={[color, 'tabular-nums shrink-0'].join(' ')}>{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}
