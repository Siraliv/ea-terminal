/**
 * Shared Recharts styling constants — monospace tick font, no decorative
 * color, axes at low opacity. One source of truth so every chart on the
 * dashboard reads like the same terminal.
 *
 * Colors resolve via CSS `rgb(var(--term-*))` so charts retheme live when
 * `data-theme` flips on <html> (Emerald / Smoke / Paper). SVG `stroke` /
 * `fill` attributes accept `rgb(var(...))` in all modern browsers.
 */

export const chartTheme = {
  // UI-accent colors — track --term-green / --term-greenBright. In smoke
  // these are cool grey, in paper they are warm orange-brown. Use for
  // axis ticks, gridlines, and any chrome that should match the page's
  // frame language rather than carry semantic meaning.
  green: 'rgb(var(--term-green))',
  greenBright: 'rgb(var(--term-greenBright))',
  greenDim: 'rgb(var(--term-greenDim))',

  // Phase 7 — semantic POSITIVE color, distinct from the UI accent.
  // Use for equity curves, positive PnL bars, win indicators. Diverges
  // from --term-green in smoke (sage) and paper (forest) so positives
  // still read as green outside emerald.
  pos: 'rgb(var(--term-pos))',

  red: 'rgb(var(--term-red))',
  amber: 'rgb(var(--term-amber))',
  text: 'rgb(var(--term-text))',
  muted: 'rgb(var(--term-muted))',
  dim: 'rgb(var(--term-dim))',
  bg: 'rgb(var(--term-bg))',
} as const;

export const axisTick = {
  fill: chartTheme.muted,
  fontSize: 11,
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const axisLine = {
  stroke: chartTheme.green,
  strokeOpacity: 0.3,
} as const;

export const gridProps = {
  stroke: chartTheme.green,
  strokeOpacity: 0.12,
  strokeDasharray: '2 3',
  vertical: false,
} as const;

/**
 * Short-form date label for x-axis ticks. Takes `YYYY-MM-DD` and
 * emits `MM/DD` — terse enough to fit 30+ ticks without overlap.
 */
export function shortDate(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : iso;
}

/**
 * Compact dollar formatter for y-axis ticks. Uses `k` / `M` suffixes
 * so a 5-character column stays monospace-aligned.
 */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
