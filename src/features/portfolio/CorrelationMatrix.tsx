import { InfoChip } from '@/components/ui';

export interface CorrelationMatrixProps {
  /** N×N matrix; diagonal = 1. */
  matrix: number[][];
  /** Short labels (e.g. `["A1", "A2", "B1"]`) — same order as `matrix`. */
  labels: readonly string[];
  /** Optional caption to render under the heatmap (e.g. avg pairwise). */
  caption?: string;
}

/**
 * Compact correlation heatmap.
 *
 * Each cell is colour-tinted:
 *   - Green when correlation is *low* (good for diversification).
 *   - Amber for moderate.
 *   - Red when high (constituents move together → concentration risk).
 *
 * Labels are kept short on purpose — feed in `test_code` rather than
 * the full EA name so a 5×5 matrix still fits next to other content.
 */
export function CorrelationMatrix({
  matrix,
  labels,
  caption,
}: CorrelationMatrixProps) {
  const n = matrix.length;
  if (n === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-term-muted text-[10px] uppercase tracking-wider">
          Correlation
        </span>
        <InfoChip
          ariaLabel="About correlation matrix"
          width="w-72"
          text={
            'Pearson correlation of per-step returns between each pair ' +
            'of constituents. 0 = perfectly diversifying (returns move ' +
            'independently); 1 = lockstep movement (no diversification ' +
            'benefit, just concentration). Green cells are low ' +
            'correlation (good), amber moderate, red high (warning).'
          }
        />
      </div>
      <table className="font-mono text-[10px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="px-1 py-0.5"></th>
            {labels.map((l) => (
              <th
                key={l}
                className="px-1 py-0.5 text-term-muted font-normal text-center min-w-[3.5rem]"
              >
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={`r${i}`}>
              <td className="px-1 py-0.5 text-term-muted text-right">
                {labels[i] ?? ''}
              </td>
              {row.map((v, j) => (
                <td
                  key={`c${j}`}
                  title={`r = ${v.toFixed(3)}`}
                  className="px-1 py-0.5 text-center tabular-nums"
                  style={{
                    backgroundColor: tintFor(v),
                    color: textColorFor(v),
                  }}
                >
                  {i === j ? '—' : v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {caption ? (
        <span className="text-term-dim text-[10px] italic">{caption}</span>
      ) : null}
    </div>
  );
}

/**
 * Map a Pearson r in [−1, 1] to a faint background tint:
 *   |r| < 0.3 → green (well-diversified)
 *   0.3 ≤ |r| < 0.7 → amber
 *   |r| ≥ 0.7 → red (concentration warning)
 *
 * The colours are intentionally low-saturation so a 5×5 matrix
 * doesn't dominate the page.
 */
function tintFor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'rgba(255, 77, 77, 0.22)';
  if (abs >= 0.3) return 'rgba(232, 155, 60, 0.18)';
  return 'rgba(61, 220, 132, 0.16)';
}

function textColorFor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'rgb(var(--term-red))';
  if (abs >= 0.3) return 'rgb(var(--term-amber))';
  return 'rgb(var(--term-pos))';
}
