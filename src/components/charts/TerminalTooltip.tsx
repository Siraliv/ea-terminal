import type { TooltipProps } from 'recharts';
import { chartTheme, shortDate } from './theme';

/**
 * Monospace tooltip — no rounded chip, no shadow. Just a framed
 * `key : value` listing that reads like a short `stdout` block.
 *
 * Recharts passes us `payload` (the array of series values at the
 * hovered x-index) and `label` (the x-axis value). We format values
 * via a caller-supplied `format(entry)` fn so the same component
 * works for dollars, percentages, or raw numbers.
 */
export function TerminalTooltip({
  active,
  payload,
  label,
  format,
}: TooltipProps<number, string> & {
  format: (entry: { name?: string; value?: number; color?: string }) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="font-mono text-xs bg-term-bg border border-term-green/60 px-2 py-1"
      style={{ color: chartTheme.text }}
    >
      <div className="text-term-muted mb-0.5">
        {typeof label === 'string' ? shortDate(label) : label}
      </div>
      {payload.map((entry, i) => (
        <div key={i} className="flex gap-2">
          <span style={{ color: entry.color ?? chartTheme.green }} aria-hidden="true">
            ▸
          </span>
          <span className="tabular-nums">
            {format({ name: entry.name, value: entry.value, color: entry.color })}
          </span>
        </div>
      ))}
    </div>
  );
}
