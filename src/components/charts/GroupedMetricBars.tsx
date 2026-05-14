import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { TerminalTooltip } from './TerminalTooltip';
import { axisLine, axisTick, chartTheme } from './theme';

export interface GroupedMetricBarsDatum {
  /** Slot label shown beneath the bar group (e.g. rank number "1"). */
  label: string;
  /** First-series value (e.g. wins). `null` skips the bar. */
  primary: number | null;
  /** Second-series value (e.g. losses). `null` skips the bar. */
  secondary: number | null;
  /**
   * Tint to apply to both bars in this slot — typically matches the
   * strategy's curve colour so semantics carry across all charts on
   * the page. `null` falls back to the global wins/losses palette.
   */
  tint?: string | null;
}

export interface GroupedMetricBarsProps {
  data: readonly GroupedMetricBarsDatum[];
  /** Height in px. Default 140. */
  height?: number;
  /** Y-axis label formatter. */
  format?: (v: number) => string;
  /** Absolute cap on each bar's thickness. Default 12 (two bars per slot). */
  maxBarSize?: number;
  /** Series legend labels. */
  primaryLabel?: string;
  secondaryLabel?: string;
  /** Base colours when `datum.tint` is not provided. */
  primaryColor?: string;
  secondaryColor?: string;
}

/**
 * Two-series bar chart — wins/losses adjacent per slot.
 *
 * Each datum produces two bars side-by-side. When `datum.tint` is set
 * the strategy's curve colour replaces the default green/red palette;
 * primary bars use the full tint, secondary bars use a darkened
 * variant so the pair is still distinguishable.
 */
export function GroupedMetricBars({
  data,
  height = 140,
  format = (v) => v.toFixed(0),
  maxBarSize = 12,
  primaryLabel = 'Wins',
  secondaryLabel = 'Losses',
  primaryColor = chartTheme.pos,
  secondaryColor = chartTheme.red,
}: GroupedMetricBarsProps) {
  if (data.length === 0) return null;

  const values: number[] = [];
  for (const d of data) {
    if (typeof d.primary === 'number') values.push(d.primary);
    if (typeof d.secondary === 'number') values.push(d.secondary);
  }
  const min = values.length > 0 ? Math.min(0, ...values) : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data as GroupedMetricBarsDatum[]}
        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="25%"
        barGap={2}
      >
        <XAxis
          dataKey="label"
          tick={{ ...axisTick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tick={{ ...axisTick, fontSize: 10 }}
          axisLine={axisLine}
          tickLine={false}
          tickFormatter={format}
          width={44}
          tickCount={3}
          domain={[min === 0 ? 0 : 'dataMin', 'dataMax']}
        />
        {min < 0 ? (
          <ReferenceLine
            y={0}
            stroke={chartTheme.dim}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        ) : null}
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          content={(props) => {
            const tooltipProps =
              props as unknown as TooltipProps<number, string>;
            return (
              <TerminalTooltip
                {...tooltipProps}
                format={({ name, value }) => {
                  const v =
                    typeof value === 'number' ? format(value) : '—';
                  return name ? `${name}: ${v}` : v;
                }}
              />
            );
          }}
        />
        <Bar
          dataKey="primary"
          name={primaryLabel}
          isAnimationActive={false}
          maxBarSize={maxBarSize}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.tint ?? primaryColor} />
          ))}
        </Bar>
        <Bar
          dataKey="secondary"
          name={secondaryLabel}
          isAnimationActive={false}
          maxBarSize={maxBarSize}
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.tint ? darken(d.tint) : secondaryColor}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Pseudo-darken: wrap a stroke string in a CSS color-mix that drops
 * lightness. Works for both `rgb(var(--x))` and explicit `rgb(...)`
 * values, and stays theme-aware because the underlying CSS variable
 * resolves at paint time.
 */
function darken(color: string): string {
  return `color-mix(in srgb, ${color} 55%, black)`;
}
