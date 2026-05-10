import { type ReactNode, type HTMLAttributes } from 'react';

export type BracketedTagVariant =
  | 'active'
  | 'paused'
  | 'archived'
  | 'breached'
  | 'passed'
  | 'win'
  | 'loss'
  | 'breakeven'
  | 'long'
  | 'short'
  | 'prop'
  | 'personal'
  | 'demo'
  | 'ticker'
  | 'neutral';

export type BracketedTagProps = {
  children: ReactNode;
  variant?: BracketedTagVariant;
  /** Adds a leading glyph (e.g. ▲ ▼ ● ♦). */
  leadingGlyph?: string;
  /** Adds a trailing `×` action — when present, tag becomes clickable. */
  onRemove?: () => void;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'onClick'>;

const variantColor: Record<BracketedTagVariant, string> = {
  // `active` is a UI status accent → swapped to gold (Phase 8) so the
  // [ ACTIVE ] tag reads as a "headline" emphasis matching the page
  // titles and sidebar wordmark.
  active: 'text-term-gold',
  paused: 'text-term-amber',
  archived: 'text-term-muted',
  breached: 'text-term-red',
  passed: 'text-term-amber',
  // Semantic positive: WIN tag and LONG direction stay GREEN in every
  // theme via --term-pos (kit-aligned sage in smoke, forest in paper).
  win: 'text-term-pos',
  loss: 'text-term-red',
  breakeven: 'text-term-amber',
  long: 'text-term-pos',
  short: 'text-term-red',
  prop: 'text-term-green',
  personal: 'text-term-text',
  demo: 'text-term-muted',
  ticker: 'text-term-text',
  neutral: 'text-term-muted',
};

/**
 * Bracketed text tag. Replaces rounded pills from conventional UIs.
 *
 *   [ ACTIVE ]   [ NQ ]   [ WIN ]   [ BREACHED ]
 *
 * With `onRemove`, renders a filter-chip-style close marker:
 *
 *   [ TICKER: NQ × ]
 */
export function BracketedTag({
  children,
  variant = 'neutral',
  leadingGlyph,
  onRemove,
  className,
  ...rest
}: BracketedTagProps) {
  return (
    <span
      {...rest}
      className={[
        'font-mono uppercase tracking-wide select-none inline-flex items-center gap-1 whitespace-nowrap text-xs',
        variantColor[variant],
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span aria-hidden="true">[</span>
      {leadingGlyph ? <span aria-hidden="true">{leadingGlyph}</span> : null}
      <span>{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="px-0.5 hover:bg-term-text hover:text-term-bg transition-colors duration-[80ms]"
          aria-label="Remove"
        >
          ×
        </button>
      ) : null}
      <span aria-hidden="true">]</span>
    </span>
  );
}
