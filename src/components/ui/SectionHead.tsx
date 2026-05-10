import { type ReactNode } from 'react';

export type SectionHeadProps = {
  /** ALL-CAPS section label rendered on the left. */
  label: ReactNode;
  /** Right-aligned slot for actions (BracketedButtons, MultiSelects). */
  right?: ReactNode;
  /** Trailing meta line in muted color (e.g. "21 trades", "April 2026"). */
  meta?: ReactNode;
  /** Extra wrapper classes. */
  className?: string;
};

/**
 * Sub-section header for use *inside* a FramedPanel body when a single
 * panel needs to subdivide its content into labeled groups.
 *
 *   ┌─ DASHBOARD ──────────────────────────────────────────────┐
 *   │  PERFORMANCE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  21 TRADES   │
 *   │  ...                                                      │
 *   │                                                            │
 *   │  EQUITY CURVE ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   CUMULATIVE   │
 *   │  ...                                                      │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The label uses the theme's primary green with the optional phosphor
 * halo (`text-glow`); the rule between label and meta is a 1 px
 * `term-rule-dashed`. Different from `PageHeader` (which is the
 * page-level top header) and from `FramedPanel`'s top rule (which is
 * box-drawing). Use `<SectionHead>` for *intra-panel* sub-sectioning.
 */
export function SectionHead({ label, right, meta, className }: SectionHeadProps) {
  return (
    <div
      className={[
        'flex items-baseline gap-3 min-h-[1.4em]',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span className="font-mono text-xs uppercase tracking-wider text-term-green text-glow shrink-0">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="term-rule-dashed flex-1 min-w-0 self-center"
      />
      {right ? (
        <span className="flex items-center gap-2 shrink-0">{right}</span>
      ) : null}
      {meta ? (
        <span className="font-mono text-xs uppercase tracking-wide text-term-muted shrink-0">
          {meta}
        </span>
      ) : null}
    </div>
  );
}
