import { useMemo } from 'react';
import {
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import { InfoChip } from '@/components/ui';
import {
  axisLine,
  axisTick,
  chartTheme,
  gridProps,
} from '@/components/charts/theme';
import { paretoFrontier, type SearchEntry } from '@/lib/portfolio';
import { formatTestLabel } from '@/lib/testCode';
import type { Test } from '@/types/domain';

export interface ParetoFrontierProps {
  /** Every combination evaluated in the search space. */
  entries: readonly SearchEntry[];
  /** All tests in the candidate pool — used to label tooltips. */
  tests: readonly Test[];
  /**
   * Test ids of the user's current "focus" portfolios — usually
   * the top-N from the AUTO panel. Plotted as bright green markers
   * so the user can see where their picks sit on the frontier.
   */
  highlightTestIds?: readonly (readonly string[])[];
  /** Height in px. Default 320. */
  height?: number;
}

interface ScatterPoint {
  x: number; // max DD %
  y: number; // annualised return %
  entry: SearchEntry;
  isFrontier: boolean;
  isHighlight: boolean;
}

/**
 * Risk-vs-return scatter of every searched combination.
 *
 * Reveals the **shape** of the achievable space: a tight cloud
 * means most combos are similar; a steep frontier means small
 * concessions on risk buy big jumps in return; a flat frontier
 * means more risk doesn't pay you back. The top-N (highlighted)
 * shows where the AUTO panel's picks land — usually but not always
 * on the frontier.
 *
 * X axis = max drawdown % (lower is better, on the left).
 * Y axis = annualised return % (higher is better, on the top).
 * The Pareto frontier connects the northwest-most points: for each
 * risk level, the combo with the highest return.
 */
export function ParetoFrontier({
  entries,
  tests,
  highlightTestIds = [],
  height = 320,
}: ParetoFrontierProps) {
  const points = useMemo<ScatterPoint[]>(() => {
    // Compute Pareto frontier and mark each point's role.
    const slim = entries
      .filter(
        (e) =>
          Number.isFinite(e.metrics.maxDrawdownPct) &&
          Number.isFinite(e.metrics.annualisedReturnPct),
      );
    const frontier = paretoFrontier(
      slim,
      (e) => e.metrics.maxDrawdownPct,
      (e) => e.metrics.annualisedReturnPct,
    );
    const frontierSet = new Set(frontier);
    const highlightKeySet = new Set(
      highlightTestIds.map((ids) => [...ids].sort().join('|')),
    );
    return slim.map((e) => {
      const key = [...e.testIds].sort().join('|');
      return {
        x: e.metrics.maxDrawdownPct,
        y: e.metrics.annualisedReturnPct,
        entry: e,
        isFrontier: frontierSet.has(e),
        isHighlight: highlightKeySet.has(key),
      };
    });
  }, [entries, highlightTestIds]);

  if (points.length === 0) {
    return (
      <p className="text-term-muted text-sm italic">
        — pool too small to search a Pareto frontier —
      </p>
    );
  }

  const frontierLine = points.filter((p) => p.isFrontier);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          Risk-vs-return cloud
        </span>
        <InfoChip
          ariaLabel="About Pareto frontier"
          width="w-80"
          text={
            "Every combination in the search space plotted as a dot. " +
            'X-axis = max drawdown %, Y-axis = annualised return %. ' +
            'The northwest line connects "efficient" portfolios — for ' +
            "each risk level, the one with the highest return. Bright " +
            'green markers are the top-N picks from the AUTO panel. ' +
            'A frontier-hugging top-N means the optimiser is finding ' +
            'good trade-offs; a top-N sitting below the frontier means ' +
            'the score function values something the frontier ignores.'
          }
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid {...gridProps} vertical />
          <XAxis
            type="number"
            dataKey="x"
            name="Max DD"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            label={{
              value: 'Max DD % →',
              position: 'insideBottom',
              offset: -2,
              fill: 'rgb(var(--term-muted))',
              fontSize: 10,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Annualised return"
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            width={56}
            tickFormatter={(v: number) =>
              `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`
            }
            label={{
              value: 'Ann. return %',
              angle: -90,
              position: 'insideLeft',
              fill: 'rgb(var(--term-muted))',
              fontSize: 10,
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={(props) => {
              const tp = props as unknown as TooltipProps<number, string>;
              if (!tp.active || !tp.payload || tp.payload.length === 0) {
                return null;
              }
              const datum = tp.payload[0]?.payload as
                | ScatterPoint
                | undefined;
              if (!datum) return null;
              const labels = datum.entry.testIds
                .map((id) => tests.find((t) => t.id === id))
                .map((t) => (t ? formatTestLabel(t) : '—'));
              return (
                <div
                  className="font-mono text-xs bg-term-bg border border-term-green/60 px-2 py-1"
                  style={{ color: 'rgb(var(--term-text))' }}
                >
                  <div className="text-term-muted mb-0.5">
                    {datum.isHighlight
                      ? 'TOP PICK'
                      : datum.isFrontier
                        ? 'FRONTIER'
                        : 'CANDIDATE'}
                  </div>
                  <div>{labels.join(' + ')}</div>
                  <div className="text-term-muted mt-0.5">
                    Ann. return{' '}
                    {datum.y >= 0 ? '+' : ''}
                    {datum.y.toFixed(1)}% · Max DD {datum.x.toFixed(1)}% ·
                    Sortino {datum.entry.metrics.sortino.toFixed(2)}
                  </div>
                </div>
              );
            }}
          />

          {/* The full point cloud (dim grey base layer). */}
          <Scatter
            data={points}
            isAnimationActive={false}
            shape="circle"
            legendType="none"
          >
            {points.map((p, i) => (
              <Cell
                key={i}
                fill={
                  p.isHighlight
                    ? chartTheme.greenBright
                    : p.isFrontier
                      ? chartTheme.pos
                      : chartTheme.muted
                }
                fillOpacity={
                  p.isHighlight ? 1 : p.isFrontier ? 0.85 : 0.3
                }
                r={p.isHighlight ? 5 : p.isFrontier ? 4 : 2.5}
                stroke={p.isHighlight ? chartTheme.bg : 'transparent'}
                strokeWidth={p.isHighlight ? 1 : 0}
              />
            ))}
          </Scatter>

          {/* Frontier as a connecting line — drawn after the cloud so
              it sits on top of the dim base layer. */}
          {frontierLine.length >= 2 ? (
            <Line
              type="monotone"
              data={frontierLine}
              dataKey="y"
              stroke={chartTheme.pos}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              legendType="none"
            />
          ) : null}
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-term-dim text-[10px] italic leading-snug">
        {points.length.toLocaleString()} combinations searched ·{' '}
        {frontierLine.length} on the Pareto frontier ·{' '}
        {points.filter((p) => p.isHighlight).length} highlighted from AUTO.
      </p>
    </div>
  );
}
