/**
 * `[?]` hover-affordance with a styled tooltip body.
 *
 * Used wherever a small button or label needs an inline "what is this?"
 * explainer — Dashboard strategy metrics, Portfolio controls, anywhere
 * a one-liner would feel clinical. Keyboard-focusable so the tooltip
 * is reachable without a mouse; the body uses the terminal aesthetic
 * (dashed border, mono font, dim bg) instead of native browser
 * tooltips so it matches the rest of the UI.
 */

export interface InfoChipProps {
  /** Tooltip text shown on hover / focus. */
  text: string;
  /** Aria label for the chip itself (e.g. `"About Profit Factor"`). */
  ariaLabel: string;
  /**
   * Where the tooltip should anchor relative to the chip. Default
   * `bottom-left` works for most contexts; switch to `top-left` when
   * the chip sits near the bottom edge of its container so the popup
   * doesn't get clipped.
   */
  placement?: 'bottom-left' | 'top-left';
  /** Override the tooltip body width. Default `w-64`. */
  width?: string;
}

export function InfoChip({
  text,
  ariaLabel,
  placement = 'bottom-left',
  width = 'w-64',
}: InfoChipProps) {
  const positionClasses =
    placement === 'top-left'
      ? 'bottom-full left-0 mb-1'
      : 'top-full left-0 mt-1';
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label={ariaLabel}
        className={[
          'inline-flex items-center justify-center',
          'w-4 h-4 rounded-sm',
          'text-[9px] font-bold leading-none',
          'text-term-muted hover:text-term-text',
          'border border-term-dim hover:border-term-muted',
          'transition-colors cursor-help',
          'focus:outline-none focus:ring-1 focus:ring-term-pos',
        ].join(' ')}
      >
        ?
      </button>
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-20',
          positionClasses,
          width,
          'max-w-[calc(100vw-2rem)]',
          'rounded-sm border border-term-dim bg-term-bg/95',
          'px-2.5 py-2',
          'text-[11px] leading-snug text-term-text',
          'font-mono shadow-lg',
          'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          'transition-opacity duration-100',
        ].join(' ')}
      >
        {text}
      </span>
    </span>
  );
}
