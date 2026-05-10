import { type ReactNode } from 'react';

export type FieldProps = {
  /** ALL-CAPS label shown above the control. */
  label: ReactNode;
  /**
   * Optional right-aligned slot rendered on the same row as the label.
   * Use for tiny per-field affordances — `[ SHOW ]` / `[ HIDE ]`
   * password toggles, `[ × clear ]` reset buttons, `[ generate ]`
   * helpers. Anything interactive should be a `<button type="button">`
   * to keep it from being treated as a label-click that focuses the
   * input.
   */
  labelRight?: ReactNode;
  /** The input/select/textarea/etc. */
  children: ReactNode;
  /** Optional hint rendered in dim tone below the control. */
  hint?: ReactNode;
  /** Error message in red. When present, the hint is hidden. */
  error?: ReactNode;
  /** Extra class names applied to the wrapper. */
  className?: string;
};

/**
 * Terminal-styled form field wrapper. Provides the label + optional
 * hint/error row. Keep the label concise: ALL CAPS, muted gray, above
 * the control.
 *
 * When `labelRight` is provided, the label row becomes a `flex
 * justify-between` so the action sits flush-right on the same baseline
 * as the label text.
 */
export function Field({
  label,
  labelRight,
  children,
  hint,
  error,
  className,
}: FieldProps) {
  return (
    <label className={['flex flex-col gap-1', className ?? ''].join(' ').trim()}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="uppercase text-xs text-term-muted tracking-wide">
          {label}
        </span>
        {labelRight ? <span className="shrink-0">{labelRight}</span> : null}
      </span>
      {children}
      {error ? (
        <span className="text-term-red text-xs font-mono">▼ {error}</span>
      ) : hint ? (
        <span className="text-term-dim text-xs">{hint}</span>
      ) : null}
    </label>
  );
}
