import { type ReactNode } from 'react';

export type KVProps = {
  /** ALL-CAPS key on the left. */
  k: ReactNode;
  /** Value on the right. */
  v: ReactNode;
  /** Tint for the value — semantic colors. Default `neutral`. */
  tone?: 'positive' | 'negative' | 'warn' | 'neutral' | 'muted';
  /** Last row in a stack — drops the dashed bottom rule. */
  last?: boolean;
  className?: string;
};

const TONE: Record<NonNullable<KVProps['tone']>, string> = {
  positive: 'text-term-greenBright',
  negative: 'text-term-red',
  warn: 'text-term-amber',
  neutral: 'text-term-text',
  muted: 'text-term-muted',
};

/**
 * Key/value row with a dashed-bottom divider. Used to stack labeled
 * facts inside a strategy / account card without resorting to a full
 * table.
 *
 *   NET PNL          +$684.04   ← positive tone
 *   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 *   WIN RATE         60.0%
 *   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
 *   TICKERS          [ NQ ] [ ES ]
 *
 * Pass `last` on the final row to drop the trailing rule. Numeric
 * values are tabular-nums by default for column alignment when several
 * `<KV>` rows stack.
 */
export function KV({ k, v, tone = 'neutral', last = false, className }: KVProps) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-3 py-1 text-xs',
        last ? '' : 'border-b border-dashed border-term-borderDim',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span className="uppercase tracking-wide text-term-muted">{k}</span>
      <span className={['font-mono tabular-nums', TONE[tone]].join(' ')}>{v}</span>
    </div>
  );
}
