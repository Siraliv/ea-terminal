import type { ReactNode } from 'react';
import { Caret, FramedPanel } from '@/components/ui';

export type PageHeaderProps = {
  /** Page title — rendered ALL CAPS in the top rule. */
  title: string;
  /** One-line subtitle under the title. Keep it brief. */
  subtitle?: ReactNode;
  /** Right-aligned slot for actions (buttons, tags). */
  actions?: ReactNode;
  /** Optional right slot embedded inside the top rule itself (e.g. a count chip). */
  titleRight?: ReactNode;
  /**
   * Hide the trailing 1 Hz cursor blink after the subtitle. Default
   * `false` — every page gets the diegetic terminal cursor as a small
   * "the system is alive" cue. Disable on transient subtitles where
   * the blink would be noise (rare).
   */
  hideCaret?: boolean;
};

/**
 * Standard page header. Uses `FramedPanel` so every page shares the same
 * `┌─ TITLE ─────────────────┐` ruling. Subtitle + actions share the body
 * row; actions are right-aligned.
 *
 * The subtitle gains a trailing 1 Hz block-cursor `<Caret />` by default
 * — a small phosphor accent borrowed from the orb-jnl UI Kit that makes
 * every page read as a live terminal surface. The caret resolves to the
 * theme's primary accent (greenBright) and respects
 * `prefers-reduced-motion: reduce`.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  titleRight,
  hideCaret = false,
}: PageHeaderProps) {
  const hasSubtitle = subtitle != null && subtitle !== '';
  return (
    <FramedPanel title={title} titleRight={titleRight}>
      {/* Screen-reader-only H1 — the FramedPanel title rule carries the
          same text visually, but it's a `<span>` for layout reasons.
          This keeps the page heading in the accessibility tree. */}
      <h1 className="sr-only">{title}</h1>
      <div className="flex items-center gap-4 min-h-[1.4em]">
        <div className="flex-1 text-term-muted text-sm">
          {hasSubtitle ? (
            <>
              {subtitle}
              {!hideCaret ? <Caret /> : null}
            </>
          ) : (
            <span className="text-term-dim">—</span>
          )}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
    </FramedPanel>
  );
}
