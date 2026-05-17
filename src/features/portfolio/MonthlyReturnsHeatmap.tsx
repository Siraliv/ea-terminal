import { useEffect, useMemo, useState } from 'react';
import { InfoChip } from '@/components/ui';
import {
  monthlyReturns,
  type MonthlyReturn,
} from '@/lib/portfolio';
import type { EquityPoint } from '@/types/domain';

export interface MonthlyReturnsHeatmapProps {
  /** Portfolio (or single test) equity curve. */
  curve: readonly EquityPoint[];
}

const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/**
 * Year × month heatmap of portfolio returns.
 *
 * Reveals seasonality and consistency at a glance: a system with
 * a clear edge shows rows of mostly-green cells; one whose edge
 * came from a single explosive month shows one dark green tile
 * surrounded by neutral / red. The YTD column at the right
 * compounds the year's months honestly (not a naïve sum).
 *
 * Coloring saturates at ±10% — most monthly returns sit inside
 * that band so the contrast is informative without losing the
 * extreme outliers (they just hit the cap color).
 */
export function MonthlyReturnsHeatmap({ curve }: MonthlyReturnsHeatmapProps) {
  const grid = useMemo(() => buildGrid(monthlyReturns(curve)), [curve]);
  const [expanded, setExpanded] = useState(false);

  // Lock body scroll while the expanded modal is open; ESC closes it.
  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  if (grid.years.length === 0) {
    return (
      <p className="text-term-muted text-xs italic">
        — at least 2 months of data needed for the heatmap —
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-term-muted text-[10px] uppercase tracking-wider">
            Monthly returns
          </span>
          <InfoChip
            ariaLabel="About monthly returns heatmap"
            width="w-72"
            text={
              'Each cell shows the portfolio return for that month. ' +
              'Green = positive, red = negative; deeper shades for larger ' +
              'moves (saturates at ±10%). YTD compounds the months in the ' +
              "row honestly. Useful for seeing whether an edge is " +
              'consistent or concentrated in one month / one regime.'
            }
          />
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-term-muted hover:text-term-text text-[10px] font-mono uppercase tracking-wider"
          title="View the heatmap full-width"
        >
          [ ⤢ expand ]
        </button>
      </div>
      <div className="overflow-x-auto">
        <HeatmapTable grid={grid} />
      </div>

      {expanded ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Monthly returns heatmap, expanded view"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 bg-black/85 flex items-start justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-term-bg border border-term-green/60 w-full max-w-5xl p-5 my-8 flex flex-col gap-3 font-mono cursor-default"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-term-greenBright text-base font-pixel tracking-wide">
                  MONTHLY RETURNS
                </h2>
                <span className="text-term-muted text-[10px] uppercase tracking-wider">
                  {grid.years.length} year{grid.years.length === 1 ? '' : 's'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="text-term-muted hover:text-term-greenBright text-sm"
              >
                [ × close ]
              </button>
            </div>
            {/* No overflow-x wrapper — the modal is wide enough to
                fit all 12 months + YTD without horizontal scroll. */}
            <HeatmapTable grid={grid} cellPadding="px-3 py-1" cellMinWidth="min-w-[3.5rem]" />
            <p className="text-term-dim text-[10px] italic">
              ESC or click outside to close.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Shared table body — rendered both in the compact left-column panel
 * (with horizontal scroll for narrow screens) and in the expanded
 * full-width modal. Optional `cellPadding` / `cellMinWidth` overrides
 * let the modal breathe with more whitespace per cell.
 */
function HeatmapTable({
  grid,
  cellPadding = 'px-1.5 py-0.5',
  cellMinWidth = 'min-w-[3rem]',
}: {
  grid: Grid;
  cellPadding?: string;
  cellMinWidth?: string;
}) {
  return (
    <table className="font-mono text-[10px] border-separate border-spacing-0 w-full">
      <thead>
        <tr>
          <th className={cellPadding}></th>
          {MONTH_LABELS.map((m) => (
            <th
              key={m}
              className={`${cellPadding} text-term-muted font-normal text-center ${cellMinWidth}`}
            >
              {m}
            </th>
          ))}
          <th
            className={`${cellPadding} text-term-muted font-normal text-center border-l border-term-borderDim`}
          >
            YTD
          </th>
        </tr>
      </thead>
      <tbody>
        {grid.years.map((year) => {
          const row = grid.byYear.get(year)!;
          const ytd = ytdReturn(row);
          return (
            <tr key={year}>
              <td className={`${cellPadding} text-term-muted text-right`}>
                {year}
              </td>
              {row.map((cell, i) => (
                <td
                  key={i}
                  title={cell != null ? `${cell.toFixed(2)}%` : 'no data'}
                  className={`${cellPadding} text-center tabular-nums`}
                  style={{
                    backgroundColor:
                      cell != null ? tintFor(cell) : 'transparent',
                    color:
                      cell != null
                        ? textColorFor(cell)
                        : 'rgb(var(--term-dim))',
                  }}
                >
                  {cell != null ? cell.toFixed(1) : '—'}
                </td>
              ))}
              <td
                className={`${cellPadding} text-center tabular-nums font-semibold border-l border-term-borderDim`}
                style={{
                  backgroundColor: tintFor(ytd, 0.5),
                  color: textColorFor(ytd),
                }}
              >
                {ytd >= 0 ? '+' : ''}
                {ytd.toFixed(1)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface Grid {
  years: number[];
  byYear: Map<number, (number | null)[]>;
}

function buildGrid(returns: readonly MonthlyReturn[]): Grid {
  const byYear = new Map<number, (number | null)[]>();
  for (const r of returns) {
    if (!byYear.has(r.year)) {
      byYear.set(r.year, new Array(12).fill(null));
    }
    byYear.get(r.year)![r.month] = r.returnPct;
  }
  const years = Array.from(byYear.keys()).sort();
  return { years, byYear };
}

/**
 * Compound the year's monthly returns into a YTD figure. Missing
 * months contribute nothing (multiply by 1). Avoids the naïve-sum
 * trap that would push 12 × 5% to 60% when the compounded answer
 * is closer to 79%.
 */
function ytdReturn(months: (number | null)[]): number {
  let factor = 1;
  for (const r of months) {
    if (r == null) continue;
    factor *= 1 + r / 100;
  }
  return (factor - 1) * 100;
}

/**
 * Map a monthly return % to a faint background tint. Saturates at
 * ±10% so a single +50% month doesn't make every other cell look
 * like grey. The `boost` parameter (default 1) lets the YTD column
 * use a slightly dimmer fill so it doesn't visually compete with
 * the per-month cells.
 */
function tintFor(pct: number, boost = 1): string {
  if (!Number.isFinite(pct)) return 'transparent';
  const abs = Math.min(Math.abs(pct) / 10, 1); // 0..1
  const alpha = abs * 0.32 * boost;
  if (pct >= 0) return `rgba(61, 220, 132, ${alpha})`;
  return `rgba(255, 77, 77, ${alpha})`;
}

function textColorFor(pct: number): string {
  if (!Number.isFinite(pct) || pct === 0) return 'rgb(var(--term-text))';
  return pct > 0 ? 'rgb(var(--term-pos))' : 'rgb(var(--term-red))';
}
