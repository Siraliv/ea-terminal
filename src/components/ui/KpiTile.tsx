import type { ReactNode } from 'react';

export type KpiTileProps = {
  /** Small uppercase label (rendered in muted color). */
  label: string;
  /** Big value line — typically a formatted string. */
  value: ReactNode;
  /** Optional secondary line underneath the value. */
  hint?: ReactNode;
  /** Tint for the value — 'positive' → green, 'negative' → red, 'warn' → amber, 'neutral' → off-white. */
  tone?: 'positive' | 'negative' | 'warn' | 'neutral' | 'muted';
  /** Optional extra classes on the outer tile. */
  className?: string;
};

const toneMap: Record<NonNullable<KpiTileProps['tone']>, string> = {
  positive: 'text-term-greenBright',
  negative: 'text-term-red',
  warn: 'text-term-amber',
  neutral: 'text-term-text',
  muted: 'text-term-muted',
};

/**
 * One KPI tile in the dashboard strip. No frame — the parent strip
 * draws a single outer frame and separates tiles with a `│` divider.
 * Using a framed-per-tile variant felt noisy; a flat label/value block
 * reads like a single CRT row.
 */
export function KpiTile({ label, value, hint, tone = 'neutral', className }: KpiTileProps) {
  return (
    <div
      className={['flex flex-col px-2 py-1 min-w-0', className ?? ''].join(' ').trim()}
    >
      <span className="text-[10px] uppercase tracking-wide text-term-muted whitespace-nowrap">
        {label}
      </span>
      <span
        className={[
          'font-mono text-base tabular-nums whitespace-nowrap',
          toneMap[tone],
        ].join(' ')}
      >
        {value}
      </span>
      {hint ? (
        <span className="text-[10px] text-term-dim tabular-nums whitespace-nowrap">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
