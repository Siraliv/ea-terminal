import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { TerminalTooltip } from './TerminalTooltip';
import {
  axisLine,
  axisTick,
  chartTheme,
  compactMoney,
  gridProps,
} from './theme';
import type { EquityPoint } from '@/types/domain';

export interface EquityCurveChartProps {
  /** Single curve. */
  data: readonly EquityPoint[];
  /** Optional additional curves to overlay (Compare page). */
  overlays?: { id: string; label: string; data: readonly EquityPoint[]; color: string }[];
  /** Chart height in px. Default 320. */
  height?: number;
  /** Initial deposit — drawn as a horizontal reference line (optional). */
  initialDeposit?: number | null;
}

interface ChartRow {
  ts: number; // epoch ms
  iso: string;
  primary?: number;
  [overlayKey: string]: number | string | undefined;
}

const PRIMARY_KEY = 'primary';

function fmtTooltipDate(iso: string): string {
  return iso.slice(0, 10);
}

export function EquityCurveChart({
  data,
  overlays = [],
  height = 320,
  initialDeposit,
}: EquityCurveChartProps) {
  const rows = useMemo<ChartRow[]>(() => {
    // Build a unified timeline keyed by epoch-ms across primary + overlays.
    const map = new Map<number, ChartRow>();

    for (const p of data) {
      const ts = Date.parse(p.t);
      const existing = map.get(ts) ?? { ts, iso: p.t };
      existing[PRIMARY_KEY] = p.b;
      map.set(ts, existing);
    }

    for (const ov of overlays) {
      for (const p of ov.data) {
        const ts = Date.parse(p.t);
        const existing = map.get(ts) ?? { ts, iso: p.t };
        existing[ov.id] = p.b;
        map.set(ts, existing);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
  }, [data, overlays]);

  const xDomain = useMemo<[number, number] | undefined>(() => {
    if (rows.length === 0) return undefined;
    return [rows[0]!.ts, rows[rows.length - 1]!.ts];
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={rows}
        margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
      >
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={xDomain ?? ['auto', 'auto']}
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
          width={68}
          tickFormatter={compactMoney}
          domain={['auto', 'auto']}
        />
        <Tooltip
          content={(props) => {
            const tooltipProps =
              props as unknown as TooltipProps<number, string>;
            return (
              <TerminalTooltip
                {...tooltipProps}
                format={({ name, value }) => {
                  const v =
                    typeof value === 'number'
                      ? `$${value.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}`
                      : String(value);
                  return name ? `${name}: ${v}` : v;
                }}
              />
            );
          }}
          labelFormatter={(label: unknown) => {
            const ts = typeof label === 'number' ? label : Number(label);
            return Number.isFinite(ts)
              ? fmtTooltipDate(new Date(ts).toISOString())
              : String(label);
          }}
        />

        {initialDeposit != null ? (
          <Line
            dataKey={() => initialDeposit}
            stroke={chartTheme.dim}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
            name="Initial deposit"
          />
        ) : null}

        <Line
          dataKey={PRIMARY_KEY}
          stroke={chartTheme.pos}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          name="Balance"
          connectNulls
        />

        {overlays.map((ov) => (
          <Line
            key={ov.id}
            dataKey={ov.id}
            stroke={ov.color}
            strokeWidth={1.25}
            dot={false}
            isAnimationActive={false}
            name={ov.label}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
