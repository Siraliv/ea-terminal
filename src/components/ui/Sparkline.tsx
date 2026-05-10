import { type HTMLAttributes } from 'react';

export type SparklineProps = {
  /** Numeric series rendered as block-character bars. Empty → renders nothing. */
  values: readonly number[];
  /**
   * Color ramp:
   *  - 'mono'    → single off-white color (default)
   *  - 'semantic' → bars below zero turn red, at/above turn green
   */
  tone?: 'mono' | 'semantic';
  /** Override min/max for scaling (e.g. shared baseline across sparklines). */
  min?: number;
  max?: number;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

const BARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Inline block-character sparkline. Each value maps to a character in
 * the `▁▂▃▄▅▆▇█` ramp scaled to the series min/max.
 *
 *   ▂▃▅▃▇█▅▆  +3.1% (7d)
 */
export function Sparkline({
  values,
  tone = 'mono',
  min,
  max,
  className,
  ...rest
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <span
        {...rest}
        className={['font-mono text-term-dim', className ?? ''].join(' ').trim()}
        aria-hidden="true"
      >
        {'·'.repeat(8)}
      </span>
    );
  }

  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi - lo || 1;
  const lastIdx = BARS.length - 1;

  return (
    <span
      {...rest}
      className={['font-mono select-none', className ?? ''].join(' ').trim()}
      aria-label={`Sparkline of ${values.length} values`}
    >
      {values.map((v, i) => {
        const ratio = (v - lo) / range;
        const idx = Math.max(0, Math.min(lastIdx, Math.round(ratio * lastIdx)));
        const color =
          tone === 'semantic'
            ? v < 0
              ? 'text-term-red'
              : 'text-term-green'
            : 'text-term-text';
        return (
          <span key={i} className={color}>
            {BARS[idx]}
          </span>
        );
      })}
    </span>
  );
}
