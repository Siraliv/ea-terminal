import { forwardRef, type SelectHTMLAttributes } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  tone?: 'green' | 'red';
};

/**
 * Terminal-styled native `<select>`. Rendered inside square brackets
 * (`[ STRATEGY ▾ ]`-feel) with a trailing `▾` glyph. Uses
 * `appearance-none` so the OS chrome doesn't break the aesthetic.
 * Options themselves render with default OS styling — a known
 * compromise, acceptable because they only appear briefly.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { tone = 'green', className, children, ...rest },
  ref,
) {
  const ruleColor =
    tone === 'red'
      ? 'border-term-red/80 focus:border-term-red'
      : 'border-term-green/70 focus:border-term-greenBright';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 font-mono text-term-text',
        'border-0 border-b bg-term-bg',
        ruleColor,
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span aria-hidden="true" className="text-term-green/70 select-none">
        [
      </span>
      <select
        ref={ref}
        {...rest}
        className={[
          'appearance-none bg-term-bg text-term-text font-mono px-1 py-1 pr-3',
          'border-0 focus:outline-none',
          'disabled:text-term-dim',
        ].join(' ')}
      >
        {children}
      </select>
      <span aria-hidden="true" className="text-term-green/70 select-none pr-1">
        ▾ ]
      </span>
    </span>
  );
});
