import { type ReactNode, type HTMLAttributes } from 'react';

export type FramedPanelProps = {
  /** Title embedded in the top box-drawing rule, rendered in ALL CAPS. */
  title?: string;
  /** Right-aligned slot in the top rule (e.g. status chips, counts). */
  titleRight?: ReactNode;
  /** Panel body. */
  children?: ReactNode;
  /** Extra class names applied to the root wrapper. */
  className?: string;
  /** Extra class names applied to the interior content cell. */
  bodyClassName?: string;
  /** Frame color — defaults to phosphor green. */
  frameColor?: 'green' | 'red' | 'amber' | 'muted';
} & Omit<HTMLAttributes<HTMLDivElement>, 'title'>;

const frameColorMap: Record<NonNullable<FramedPanelProps['frameColor']>, string> = {
  green: 'text-term-green/70',
  red: 'text-term-red/70',
  amber: 'text-term-amber/70',
  muted: 'text-term-muted/70',
};

/**
 * A black-interior panel whose border is rendered entirely in Unicode
 * box-drawing characters. Title is embedded in the top rule as
 * `┌─ TITLE ──────────────────────┐`.
 *
 * Frame glyphs live in the DOM (not CSS borders) so the aesthetic reads
 * as monospace text, copy-paste friendly, and composable inside a
 * monospace grid.
 */
export function FramedPanel({
  title,
  titleRight,
  children,
  className,
  bodyClassName,
  frameColor = 'green',
  ...rest
}: FramedPanelProps) {
  const frame = frameColorMap[frameColor];

  return (
    <div
      {...rest}
      className={['font-mono leading-[1.4] text-term-text', className ?? ''].join(' ').trim()}
    >
      {/* Top rule: ┌─ TITLE ──────── ...right... ─┐ */}
      <div className={['flex items-center whitespace-pre select-none', frame].join(' ')}>
        <span aria-hidden="true">┌─</span>
        {title ? (
          // Phase 8 — title text gets the headline gold accent. Frame
          // glyphs (`┌─` / `─┐`) on either side stay in --term-green/70
          // so the box-drawing language is unchanged; only the title
          // word itself is gold.
          <span className="px-1 text-term-gold uppercase tracking-wide">{title}</span>
        ) : (
          <span aria-hidden="true">─</span>
        )}
        <span aria-hidden="true" className="flex-1 min-w-0 overflow-hidden">
          {'─'.repeat(400)}
        </span>
        {titleRight ? (
          <span className="px-1 text-term-text normal-case tracking-normal">{titleRight}</span>
        ) : null}
        <span aria-hidden="true">─┐</span>
      </div>

      {/* Body row: │ ... │
          Body bg = `bg-term-bgRaised` (Phase 6 depth pass). The frame
          glyphs sit outside the body and continue to render on the page
          background, so the panel reads as a CRT bezel around a faintly
          lifted "screen" surface. The lift is 5–10 RGB points per theme:
          imperceptible per panel, but stacked across a page it creates
          unmistakable physical hierarchy without abandoning the Unicode
          frame language. */}
      <div className="flex">
        <span aria-hidden="true" className={['select-none', frame].join(' ')}>
          │
        </span>
        <div
          className={['flex-1 min-w-0 px-2 py-1.5 bg-term-bgRaised', bodyClassName ?? '']
            .join(' ')
            .trim()}
        >
          {children}
        </div>
        <span aria-hidden="true" className={['select-none', frame].join(' ')}>
          │
        </span>
      </div>

      {/* Bottom rule: └──────────────┘ */}
      <div className={['whitespace-pre select-none flex', frame].join(' ')}>
        <span aria-hidden="true">└</span>
        <span aria-hidden="true" className="flex-1 min-w-0 overflow-hidden">
          {'─'.repeat(400)}
        </span>
        <span aria-hidden="true">┘</span>
      </div>
    </div>
  );
}
