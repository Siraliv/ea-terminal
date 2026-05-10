import { forwardRef, type TextareaHTMLAttributes } from 'react';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  tone?: 'green' | 'red';
};

/**
 * Multiline variant of `Input`. Same frame language: black bg, thin
 * phosphor-green bottom rule (no top/side borders), monospace body,
 * phosphor caret. Use for playbook fields — entry conditions, invalid
 * conditions, best sessions, etc.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { tone = 'green', className, rows = 3, ...rest },
  ref,
) {
  const ruleColor =
    tone === 'red'
      ? 'border-term-red/80 focus:border-term-red'
      : 'border-term-green/70 focus:border-term-greenBright';

  return (
    <textarea
      ref={ref}
      rows={rows}
      {...rest}
      className={[
        'bg-term-bg text-term-text font-mono px-1 py-1 resize-y',
        'border-0 border-b',
        ruleColor,
        'focus:outline-none caret-term-greenBright',
        'disabled:text-term-dim disabled:border-term-dim',
        'placeholder:text-term-dim leading-[1.4]',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    />
  );
});
