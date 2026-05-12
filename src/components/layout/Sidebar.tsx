import { NavLink } from 'react-router-dom';
import { BracketedButton, BracketedTag } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { ThemePicker } from './ThemePicker';

type NavItem = {
  to: string;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'DASHBOARD' },
  { to: '/upload', label: 'UPLOAD' },
  { to: '/tests', label: 'TESTS' },
  { to: '/compare', label: 'COMPARE' },
  { to: '/eas', label: 'EAs' },
];

const EXTRA_ITEMS: NavItem[] = [];

/**
 * Persistent left rail. Terminal-styled: pixel-font wordmark up top, five
 * primary nav items in the middle, and a session footer with the signed-in
 * email + `[ Sign Out ]`. Active item is bright phosphor green wrapped in
 * `▶ … ◀`; inactive items show a dim `▸` glyph on hover-invert.
 *
 * The right-edge rule is a single vertical box-drawing character in the DOM
 * (`│`), not a CSS border — keeps the whole frame language consistent with
 * `FramedPanel`.
 */
export function Sidebar() {
  const { user, signOut } = useAuth();

  return (
    <aside
      aria-label="Primary"
      className="shrink-0 w-56 h-screen sticky top-0 bg-term-bg flex flex-col"
    >
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar body */}
        <div className="flex-1 flex flex-col min-h-0 py-5 px-4 gap-6 overflow-y-auto">
          {/* Wordmark — Press Start 2P pixel font is preserved verbatim;
              `text-glow` adds a phosphor halo on emerald (resolves to
              0-alpha on smoke and paper so the wordmark stays flat
              there). Phase 8 — switched to text-term-gold; in emerald
              that token resolves to greenBright so the wordmark stays
              phosphor, in smoke it renders antique-gold, in paper it
              renders the kit's dark-orange accent. The dashed bottom
              border separates the brand block from the SECTIONS nav. */}
          <div className="flex flex-col gap-1 pb-3 border-b border-dashed border-term-borderDim">
            <span className="font-pixel text-term-gold text-[22px] leading-none tracking-tight text-glow">
              SIRALIV
            </span>
            <span className="text-term-muted text-[10px] uppercase tracking-widest">
              EA Terminal
            </span>
          </div>

          {/* Primary nav */}
          <nav aria-label="Sections" className="flex flex-col gap-1">
            <SidebarSectionLabel>SECTIONS</SidebarSectionLabel>
            {NAV_ITEMS.map((item) => (
              <SidebarLink key={item.to} to={item.to} label={item.label} />
            ))}
          </nav>

          {/* Secondary (system) */}
          <nav aria-label="System" className="flex flex-col gap-1">
            <SidebarSectionLabel>SYSTEM</SidebarSectionLabel>
            {EXTRA_ITEMS.map((item) => (
              <SidebarLink key={item.to} to={item.to} label={item.label} />
            ))}
          </nav>

          {/* Theme picker — the user specifically requested this slot
              between SYSTEM and SESSION in the original brief. */}
          <ThemePicker />

          <div className="flex-1" />

          {/* Session footer — dashed top border mirrors the wordmark's
              bottom border so the sidebar reads as three rules: brand
              header, scrolling nav body, session footer. */}
          <div className="flex flex-col gap-2 text-xs pt-3 border-t border-dashed border-term-borderDim">
            <SidebarSectionLabel>SESSION</SidebarSectionLabel>
            <div className="flex items-center gap-2">
              <BracketedTag variant="active" leadingGlyph="●">
                ONLINE
              </BracketedTag>
            </div>
            <span
              className="text-term-muted truncate"
              title={user?.email ?? 'anonymous'}
            >
              {user?.email ?? 'anonymous'}
            </span>
            <BracketedButton
              variant="secondary"
              size="sm"
              onClick={() => void signOut()}
            >
              Sign Out
            </BracketedButton>
          </div>
        </div>

        {/* Right-edge rule (box-drawing, not CSS border) */}
        <div
          aria-hidden="true"
          className="w-[1ch] text-term-green/60 font-mono text-xs leading-none overflow-hidden select-none whitespace-pre"
        >
          {'│\n'.repeat(120)}
        </div>
      </div>
    </aside>
  );
}

function SidebarSectionLabel({ children }: { children: string }) {
  return (
    <span className="text-term-dim text-[10px] uppercase tracking-[0.2em] pt-1">
      {children}
    </span>
  );
}

function SidebarLink({ to, label }: NavItem) {
  return (
    <NavLink
      to={to}
      end={false}
      className={({ isActive }) =>
        [
          'font-mono text-sm uppercase tracking-wide select-none',
          // Border-left is always 2px wide; only the COLOR changes when
          // active. This keeps the layout from shifting horizontally as
          // routes flip between active/inactive states.
          'border-l-2 pl-2 pr-1 py-[2px] transition-colors duration-[80ms]',
          isActive
            // Phase 8 — active label + border switch from phosphor green
            // to headline gold so the active route reads as a typographic
            // accent matching the wordmark, page titles, and [ ACTIVE ]
            // tag. text-glow stays for the soft halo on emerald.
            ? 'text-term-gold text-glow border-l-term-gold'
            : 'text-term-text border-l-transparent hover:bg-term-text hover:text-term-bg',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={isActive ? '' : 'text-term-dim'}>
            {isActive ? '▶' : '▸'}
          </span>
          <span>{label}</span>
          {isActive ? (
            <span aria-hidden="true" className="ml-auto">
              ◀
            </span>
          ) : null}
        </span>
      )}
    </NavLink>
  );
}
