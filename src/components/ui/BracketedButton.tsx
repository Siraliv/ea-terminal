import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type BracketedButtonVariant = 'primary' | 'secondary' | 'destructive';
export type BracketedButtonSize = 'sm' | 'md';

export type BracketedButtonProps = {
  /** Visible button label. Will be rendered in ALL CAPS, wrapped in brackets. */
  children: ReactNode;
  variant?: BracketedButtonVariant;
  size?: BracketedButtonSize;
  /** Render with a leading glyph (e.g. ▸ ▲ +). */
  leadingGlyph?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

// `primary` uses `--term-greenBright` (the always-bright UI accent
// token), not `--term-green`. The latter is repurposed in Emerald
// Dusk for the "sunken" frame ink — near-black — which made primary
// buttons render as black-on-graphite there. greenBright stays
// phosphor in every theme, so the primary state reads as a clear
// highlight regardless of which theme is active.
const variantBase: Record<BracketedButtonVariant, string> = {
  primary: 'text-term-greenBright border-term-greenBright/70',
  secondary: 'text-term-text border-term-text/70',
  destructive: 'text-term-red border-term-red/70',
};

const variantHover: Record<BracketedButtonVariant, string> = {
  primary: 'hover:bg-term-greenBright hover:text-term-bg',
  secondary: 'hover:bg-term-text hover:text-term-bg',
  destructive: 'hover:bg-term-red hover:text-term-bg',
};

const sizePx: Record<BracketedButtonSize, string> = {
  sm: 'text-xs px-1 py-0',
  md: 'text-sm px-1 py-0',
};

/**
 * A text-only bracketed button: `[ LABEL ]`. No fill, no shadow, no radius.
 * Hover inverts foreground/background — a CRT highlight effect.
 */
export function BracketedButton({
  children,
  variant = 'primary',
  size = 'md',
  leadingGlyph,
  className,
  disabled,
  type = 'button',
  ...rest
}: BracketedButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        'font-mono uppercase tracking-wide select-none',
        'inline-flex items-center gap-1 whitespace-nowrap',
        'transition-colors duration-[80ms]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
        variantBase[variant],
        !disabled ? variantHover[variant] : '',
        sizePx[size],
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...rest}
    >
      <span aria-hidden="true">[</span>
      {leadingGlyph ? <span aria-hidden="true">{leadingGlyph}</span> : null}
      <span>{children}</span>
      <span aria-hidden="true">]</span>
    </button>
  );
}
