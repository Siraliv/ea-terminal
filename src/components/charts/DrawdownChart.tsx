import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import type { EquityPoint } from '@/types/domain';
import { TerminalTooltip } from './TerminalTooltip';
import { axisLine, axisTick, chartTheme, gridProps } from './theme';

export interface DrawdownChartProps {
  /** Combined portfolio (or single test) equity curve. */
  data: readonly EquityPoint[];
  /** Height in px. Default 140 — designed to sit under an equity chart. */
  height?: number;
}

interface DDRow {
  ts: number;
  /** Drawdown as a *negative* percentage from the running peak. */
  dd: number;
}

/**
 * Drawdown curve — running `(balance − peak) / peak` plotted as a
 * negative-only filled area. Pairs with `EquityCurveChart`: stack
 * them vertically and the user can read **depth** (this chart)
 * alongside **duration** (the flat bottoms here showing how long
 * the system was underwater).
 *
 * Always rendered in % regardless of how the equity chart above is
 * configured — drawdown only makes sense as a fractional metric.
 */
export function DrawdownChart({ data, height = 140 }: DrawdownChartProps) {
  const rows = useMemo<DDRow[]>(() => {
    if (data.length === 0) return [];
    let peak = data[0]!.b;
    const out: DDRow[] = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const b = data[i]!.b;
      if (b > peak) peak = b;
      const dd = peak > 0 ? (b / peak - 1) * 100 : 0;
      out[i] = { ts: Date.parse(data[i]!.t), dd };
    }
    return out;
  }, [data]);

  if (rows.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={rows}
        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
      >
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tick={axisTick}
          axisLine={axisLine}
          tickLine={false}
          tickFormatter={(v: number) => {
            const d = new Date(v);
            return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
          }}
          minTickGap={48}
        />
        <YAxis
          tick={axisTick}
          axisLine={axisLine}
          tickLine={false}
          width={48}
          // Drawdown is always ≤ 0 — pin the top of the axis at 0
          // so the user reads "depth from breakeven" unambiguously.
          domain={['dataMin', 0]}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <ReferenceLine y={0} stroke={chartTheme.muted} strokeDasharray="3 3" />
        <Tooltip
          content={(props) => {
            const tp = props as unknown as TooltipProps<number, string>;
            const rawLabel = tp.label;
            const ts =
              typeof rawLabel === 'number' ? rawLabel : Number(rawLabel);
            const date = Number.isFinite(ts)
              ? new Date(ts).toISOString().slice(0, 10)
              : String(rawLabel ?? '');
            return (
              <TerminalTooltip
                {...tp}
                label={date}
                format={({ value }) =>
                  typeof value === 'number'
                    ? `${value.toFixed(2)}%`
                    : String(value)
                }
              />
            );
          }}
        />
        <Area
          dataKey="dd"
          type="monotone"
          stroke={chartTheme.red}
          strokeWidth={1.2}
          fill={chartTheme.red}
          fillOpacity={0.18}
          isAnimationActive={false}
          name="Drawdown"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
