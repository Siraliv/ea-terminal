import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { TerminalTooltip } from '@/components/charts/TerminalTooltip';
import {
  axisLine,
  axisTick,
  chartTheme,
  gridProps,
} from '@/components/charts/theme';
import { InfoChip } from '@/components/ui';
import {
  constituentContributions,
  type ConstituentContribution,
} from '@/lib/portfolio';
import { formatTestLabel } from '@/lib/testCode';
import type { Test } from '@/types/domain';

export interface ContributionChartProps {
  tests: readonly Test[];
  weights: readonly number[];
  /** Used by the math layer to anchor the cumulative-contribution scale. */
  startCapital?: number;
  /** Chart height. Default 200. */
  height?: number;
}

/**
 * Stacked area chart showing each constituent's running cumulative
 * % contribution to the portfolio. Stacking the bands gives the
 * portfolio's total cumulative return curve.
 *
 * Reveals *who* is driving returns — and when. A band that goes
 * flat for half the chart is a constituent that wasn't pulling
 * its weight in that window; a band that does most of the work in
 * one region is a "fragile" contributor whose drawdowns will
 * dominate the portfolio's drawdowns.
 */
export function ContributionChart({
  tests,
  weights,
  startCapital = 100_000,
  height = 200,
}: ContributionChartProps) {
  const contributions = useMemo<ConstituentContribution[]>(
    () => constituentContributions(tests, weights, startCapital),
    [tests, weights, startCapital],
  );

  // Pivot into row-per-timestamp shape Recharts wants. Use the
  // first constituent's timeline as the spine — all constituents
  // share the same aligned timeline upstream.
  const rows = useMemo(() => {
    const spine = contributions[0]?.series ?? [];
    return spine.map((p, i) => {
      const row: Record<string, number | string> = { t: p.t, ts: Date.parse(p.t) };
      for (const c of contributions) {
        row[c.testId] = c.series[i]?.v ?? 0;
      }
      return row;
    });
  }, [contributions]);

  if (rows.length === 0) return null;

  // Colour palette mirrors the rest of the Portfolio page.
  const palette = [
    'rgb(var(--term-pos))',
    'rgb(var(--term-amber))',
    'rgb(var(--term-red))',
    'rgb(var(--term-gold))',
    'rgb(var(--term-muted))',
  ];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          Contribution breakdown
        </span>
        <InfoChip
          ariaLabel="About contribution chart"
          width="w-80"
          text={
            'Each band shows one constituent strategy\'s cumulative % ' +
            "contribution to the portfolio's return. Stacked: the band " +
            'tops add up to the portfolio total return curve. A band that ' +
            'goes flat for a stretch = that strategy wasn\'t contributing; ' +
            'a band that does most of the lifting = a load-bearing ' +
            'constituent whose drawdowns will dominate the portfolio.'
          }
        />
      </div>
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
            // Matches EquityCurveChart + DrawdownChart so the three
            // stacked charts share the same plot-area x-origin.
            width={68}
            tickFormatter={(v: number) =>
              `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
            }
          />
          <ReferenceLine y={0} stroke={chartTheme.muted} strokeDasharray="3 3" />
          <Tooltip
            content={(props) => {
              const tp = props as unknown as TooltipProps<number, string>;
              const rawLabel = tp.label;
              const ts =
                typeof rawLabel === 'number'
                  ? rawLabel
                  : Number(rawLabel);
              const date = Number.isFinite(ts)
                ? new Date(ts).toISOString().slice(0, 10)
                : String(rawLabel ?? '');
              return (
                <TerminalTooltip
                  {...tp}
                  label={date}
                  format={({ name, value }) => {
                    const id = String(name ?? '');
                    const t = tests.find((x) => x.id === id);
                    const label = t ? formatTestLabel(t) : id;
                    const v =
                      typeof value === 'number'
                        ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
                        : String(value);
                    return `${label}: ${v}`;
                  }}
                />
              );
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={20}
            wrapperStyle={{ fontSize: 10 }}
            formatter={(value: string) => {
              const t = tests.find((x) => x.id === value);
              return t ? formatTestLabel(t) : value;
            }}
          />
          {tests.map((t, i) => (
            <Area
              key={t.id}
              type="monotone"
              dataKey={t.id}
              stackId="contrib"
              stroke={palette[i % palette.length]}
              strokeWidth={1}
              fill={palette[i % palette.length]}
              fillOpacity={0.4}
              isAnimationActive={false}
              name={t.id}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
