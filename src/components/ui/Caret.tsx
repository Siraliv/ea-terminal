import { type HTMLAttributes } from 'react';

export type CaretProps = {
  /** Glyph dimensions follow the surrounding font size. */
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

/**
 * Inline 1 Hz block-cursor blinker. Diegetic accent — append to the end
 * of a typed-out tagline, page subtitle, or empty-state line to give
 * the surface that "the terminal is alive" feel.
 *
 *   <span>Trading Journal<Caret /></span>
 *
 * Animation uses the existing `term-caret` keyframe in `index.css`
 * (50/50 opacity step at 1 Hz). On `prefers-reduced-motion: reduce`,
 * the blink is disabled and the caret stays solid (still informative,
 * just not animating).
 *
 * Color resolves to the theme's primary accent (`--term-greenBright`),
 * so it retunes automatically across emerald / smoke / paper.
 */
export function Caret({ className, ...rest }: CaretProps) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      className={['term-caret', className ?? ''].join(' ').trim()}
    />
  );
}
