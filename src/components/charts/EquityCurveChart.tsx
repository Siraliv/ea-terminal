import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
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

/** A starting-balance marker — one horizontal dashed line per entry. */
export interface InitialBalanceMarker {
  /** Balance value (USD). Lines at equal values are deduped into one. */
  value: number;
  /**
   * Stroke colour. Used only when distinct values force per-curve lines.
   * When all markers share one value, a single muted line is drawn.
   */
  color: string;
  /** Optional label shown at the line's right edge. */
  label?: string;
}

export interface EquityCurveChartProps {
  /** Single curve. */
  data: readonly EquityPoint[];
  /** Optional additional curves to overlay (Compare page). */
  overlays?: { id: string; label: string; data: readonly EquityPoint[]; color: string }[];
  /** Chart height in px. Default 320. */
  height?: number;
  /**
   * Starting balances to draw as horizontal dashed reference lines.
   * If every entry has the same `value`, a single muted line is shown.
   * If they differ, one line per entry is drawn in its own colour so
   * each curve's baseline is identifiable.
   */
  initialBalances?: readonly InitialBalanceMarker[];
  /**
   * Override the x-axis domain as `[startMs, endMs]`. Useful when the
   * visible data is a slice (e.g. one year) but the chart frame
   * should still show the full backtest period so the user can place
   * that slice in context. When omitted, the domain auto-fits to the
   * data points.
   */
  xDomainOverride?: [number, number];
  /**
   * Optional `[startMs, endMs]` window to draw as a dashed-bounded,
   * subtly shaded box on top of the chart — used by the year filter
   * to mark the active window without hiding the rest of the curve.
   * Bounds outside the chart's x domain are clipped.
   */
  highlightRange?: [number, number];
  /** Short label shown over the highlight (e.g. the selected year). */
  highlightLabel?: string;
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
  initialBalances,
  xDomainOverride,
  highlightRange,
  highlightLabel,
}: EquityCurveChartProps) {
  // Dedupe starting balances. If every curve started at the same balance
  // we collapse to a single muted reference line; otherwise each curve
  // gets its own coloured line so the baseline is unambiguous.
  const balanceLines = useMemo<InitialBalanceMarker[]>(() => {
    const list = (initialBalances ?? []).filter(
      (m): m is InitialBalanceMarker =>
        m != null && Number.isFinite(m.value),
    );
    if (list.length === 0) return [];
    const distinct = Array.from(new Set(list.map((m) => m.value)));
    if (distinct.length === 1) {
      return [{ value: distinct[0]!, color: chartTheme.muted, label: 'Start' }];
    }
    return list;
  }, [initialBalances]);
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
    if (xDomainOverride) return xDomainOverride;
    if (rows.length === 0) return undefined;
    return [rows[0]!.ts, rows[rows.length - 1]!.ts];
  }, [rows, xDomainOverride]);

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
            // The x-axis dataKey is `ts` (epoch ms), so Recharts hands
            // us a numeric `label`. Recharts' built-in `labelFormatter`
            // is only applied to the default tooltip, not to a custom
            // `content` renderer — pre-format the date here so the
            // tooltip header reads "2017-05-26" instead of "14957…".
            const rawLabel = tooltipProps.label;
            const ts =
              typeof rawLabel === 'number' ? rawLabel : Number(rawLabel);
            const formattedLabel = Number.isFinite(ts)
              ? fmtTooltipDate(new Date(ts).toISOString())
              : String(rawLabel ?? '');
            return (
              <TerminalTooltip
                {...tooltipProps}
                label={formattedLabel}
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
        />

        {/*
         * Year-scope highlight: a subtle shaded band bracketed by two
         * dashed verticals. Sits behind the balance markers and the
         * data lines so the curve stays readable. Rendered only when
         * the caller wants it (year filter, custom date range, etc.);
         * Recharts clips it to the chart's x domain automatically.
         */}
        {highlightRange ? (
          <>
            <ReferenceArea
              x1={highlightRange[0]}
              x2={highlightRange[1]}
              strokeOpacity={0}
              fill={chartTheme.green}
              fillOpacity={0.06}
              ifOverflow="hidden"
              label={
                highlightLabel
                  ? {
                      value: highlightLabel,
                      position: 'insideTop',
                      fill: chartTheme.muted,
                      fontSize: 10,
                      fontFamily:
                        '"JetBrains Mono", ui-monospace, monospace',
                    }
                  : undefined
              }
            />
            <ReferenceLine
              x={highlightRange[0]}
              stroke={chartTheme.muted}
              strokeDasharray="3 3"
              strokeWidth={1}
              ifOverflow="hidden"
            />
            <ReferenceLine
              x={highlightRange[1]}
              stroke={chartTheme.muted}
              strokeDasharray="3 3"
              strokeWidth={1}
              ifOverflow="hidden"
            />
          </>
        ) : null}

        {/*
         * Starting-balance reference lines. Drawn behind the data lines.
         * Dashed; visibility is non-negotiable — strokeWidth 1.25 and
         * full opacity. When all curves share one starting balance,
         * `balanceLines` collapses to a single muted line.
         */}
        {balanceLines.map((m, i) => (
          <ReferenceLine
            key={`bal-${i}-${m.value}`}
            y={m.value}
            stroke={m.color}
            strokeDasharray="5 4"
            strokeWidth={1.25}
            strokeOpacity={0.9}
            // `hidden` instead of `extendDomain`: if a marker sits far
            // outside the chart's auto-computed Y range, don't widen
            // the axis to fit it — that would squish the actual curve
            // into a thin band. The marker simply doesn't render
            // until the chart's range happens to cover it.
            ifOverflow="hidden"
            label={{
              value:
                m.label ??
                `$${m.value.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`,
              position: 'insideTopRight',
              fill: m.color,
              fontSize: 10,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            }}
          />
        ))}

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
