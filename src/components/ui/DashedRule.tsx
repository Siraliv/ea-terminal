import { type HTMLAttributes } from 'react';

export type DashedRuleProps = {
  /** Vertical margin token. Default `'md'` ≈ 12 px. */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

const SPACING: Record<NonNullable<DashedRuleProps['spacing']>, string> = {
  none: 'my-0',
  sm: 'my-1',
  md: 'my-3',
  lg: 'my-5',
};

/**
 * Horizontal dashed divider, 1 px tall, drawn with a `repeating-linear-
 * gradient` against `--term-borderDim`. The default ASCII frame language
 * uses Unicode `─` glyphs in `FramedPanel`; this primitive is for
 * sub-sectioning *inside* a panel body where embedding more box-drawing
 * would feel noisy.
 *
 *   PERFORMANCE
 *   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 *   42 trades · 58.3% win
 *
 * Pairs naturally with `<SectionHead>`. Both consume the Phase 1
 * `--term-borderDim` token so they retheme automatically.
 */
export function DashedRule({ spacing = 'md', className, ...rest }: DashedRuleProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      {...rest}
      className={['term-rule-dashed', SPACING[spacing], className ?? '']
        .join(' ')
        .trim()}
    />
  );
}
