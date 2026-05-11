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

export interface MetricBarsDatum {
  /** Short label shown beneath the bar (e.g. rank number "1"). */
  label: string;
  /**
   * Metric value. `null` keeps the X-axis slot reserved but skips the
   * bar — used to render fixed-width placeholder slots.
   */
  value: number | null;
  /** Bar fill colour. */
  color: string;
}

export interface MetricBarsProps {
  data: readonly MetricBarsDatum[];
  /** Height in px. Default 140 — kept short so 3 charts fit a row. */
  height?: number;
  /** Y-axis label formatter. */
  format?: (v: number) => string;
  /** Whether higher values are good. Drawdown sets false. */
  higherIsBetter?: boolean;
  /** Absolute cap on a single bar's thickness in px. Default 24. */
  maxBarSize?: number;
}

/**
 * Compact bar chart for one performance metric across N strategy slots.
 *
 * Minimal chrome: no grid, no axis lines, terse Y-axis ticks, slot
 * numbers on the X. `value: null` rows reserve the slot without
 * drawing a bar — used to keep bar widths consistent regardless of
 * how many strategies are filled in.
 *
 * Bars are tinted to match the equity-curve overlay colours so the
 * same strategy reads the same in both views.
 */
export function MetricBars({
  data,
  height = 140,
  format = (v) => v.toFixed(2),
  higherIsBetter = true,
  maxBarSize = 24,
}: MetricBarsProps) {
  if (data.length === 0) return null;

  const values = data
    .map((d) => d.value)
    .filter((v): v is number => typeof v === 'number');
  const min = values.length > 0 ? Math.min(0, ...values) : 0;
  const max = values.length > 0 ? Math.max(0, ...values) : 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data as MetricBarsDatum[]}
        margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
        barCategoryGap="20%"
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
                format={({ value }) =>
                  typeof value === 'number' ? format(value) : '—'
                }
              />
            );
          }}
        />
        <Bar
          dataKey="value"
          isAnimationActive={false}
          maxBarSize={maxBarSize}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
        {/* `max` referenced so future tweaks (winner highlight) keep
            it in scope; the line itself stays invisible. */}
        <ReferenceLine
          y={higherIsBetter ? max : min}
          stroke="transparent"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
