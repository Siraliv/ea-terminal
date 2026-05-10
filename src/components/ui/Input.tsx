import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Bottom rule treatment — `green` for normal focus, `red` for validation error. */
  tone?: 'green' | 'red';
};

/**
 * Terminal-styled text input. Black background, thin phosphor-green
 * bottom rule, no top/side borders, block caret on focus. Swap `tone`
 * to red when displaying a validation error on the field.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { tone = 'green', className, ...rest },
  ref,
) {
  const ruleColor =
    tone === 'red'
      ? 'border-term-red/80 focus:border-term-red'
      : 'border-term-green/70 focus:border-term-greenBright';

  return (
    <input
      ref={ref}
      {...rest}
      className={[
        'bg-term-bg text-term-text font-mono px-1 py-1',
        'border-0 border-b',
        ruleColor,
        'focus:outline-none caret-term-greenBright',
        'disabled:text-term-dim disabled:border-term-dim',
        'placeholder:text-term-dim',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    />
  );
});
