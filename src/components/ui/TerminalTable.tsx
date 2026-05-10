import { type ReactNode, type HTMLAttributes, type Key } from 'react';

export type TerminalColumn<Row> = {
  /** Unique column id — also used as React key for the header cell. */
  id: string;
  /** Header label, rendered in ALL CAPS. */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: Row) => ReactNode;
  /** Optional right-align for numeric cells (default: left). */
  align?: 'left' | 'right';
  /** Optional explicit width (Tailwind class or CSS value). */
  width?: string;
  /** Tailwind class applied to every cell in this column. */
  className?: string;
  /** Hide this column — useful for "R Multiple hidden by default". */
  hidden?: boolean;
};

export type TerminalTableProps<Row> = {
  columns: readonly TerminalColumn<Row>[];
  rows: readonly Row[];
  /** Extracts a stable key from each row. Falls back to index. */
  rowKey?: (row: Row, index: number) => Key;
  /** Row click handler. When provided, rows render with a pointer cursor. */
  onRowClick?: (row: Row) => void;
  /**
   * Per-row Tailwind class override. Appended to the base row classes,
   * so you can layer e.g. `term-sync-flash` on top of hover/cursor
   * styling without re-implementing the defaults.
   */
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** Rendered when `rows` is empty. */
  emptyMessage?: ReactNode;
} & Omit<HTMLAttributes<HTMLTableElement>, 'children'>;

/**
 * Headless monospace table primitive.
 *
 * - Sticky header with `─` underline.
 * - Numerics right-aligned, text left-aligned.
 * - Row hover inverts fg/bg (CRT highlight effect).
 * - No row dividers — the monospace grid carries alignment.
 */
export function TerminalTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  emptyMessage = '— no data —',
  className,
  ...rest
}: TerminalTableProps<Row>) {
  const visibleCols = columns.filter((c) => !c.hidden);

  return (
    <div className="w-full overflow-x-auto">
      <table
        {...rest}
        className={[
          'font-mono text-sm w-full border-separate border-spacing-0 tabular-nums',
          className ?? '',
        ]
          .join(' ')
          .trim()}
      >
        <thead className="sticky top-0 bg-term-bg z-10">
          <tr>
            {visibleCols.map((col) => (
              <th
                key={col.id}
                className={[
                  'uppercase tracking-wide text-term-text font-normal',
                  'px-2 pt-0 pb-0 whitespace-nowrap',
                  col.align === 'right' ? 'text-right' : 'text-left',
                  col.width ?? '',
                  col.className ?? '',
                ]
                  .join(' ')
                  .trim()}
              >
                {col.header}
              </th>
            ))}
          </tr>
          {/*
           * Header underline. Rendered as a single colSpan cell instead of
           * one-rule-per-column because per-column `─`.repeat(N) propagates
           * column min-widths upward in an auto-layout table and forces the
           * whole table wider than its container. A single spanning cell
           * carries the same visual `─` rule without affecting column sizing.
           */}
          <tr aria-hidden="true">
            <th
              colSpan={visibleCols.length}
              className="text-term-green/70 px-2 py-0 select-none overflow-hidden text-left border-b border-term-green/60"
              style={{ lineHeight: 0, fontSize: 0 }}
            >
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={visibleCols.length}
                className="px-2 py-2 text-term-muted text-center italic"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row, i) : i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                className={[
                  'hover:bg-term-text hover:text-term-bg',
                  'transition-colors duration-[60ms]',
                  onRowClick ? 'cursor-pointer' : '',
                  rowClassName?.(row, i) ?? '',
                ]
                  .join(' ')
                  .trim()}
              >
                {visibleCols.map((col) => (
                  <td
                    key={col.id}
                    className={[
                      'px-2 py-0.5 whitespace-nowrap',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.className ?? '',
                    ]
                      .join(' ')
                      .trim()}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
