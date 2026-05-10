import { useThemeStore, type TermTheme } from '@/store/theme';

type ThemeOption = {
  key: TermTheme;
  label: string;
};

const THEME_OPTIONS: readonly ThemeOption[] = [
  { key: 'smoke',   label: 'SMOKE'   },
  { key: 'emerald', label: 'EMERALD' },
  { key: 'paper',   label: 'PAPER'   },
];

/**
 * Sidebar theme selector. Three text-only rows that match the sidebar
 * nav vocabulary exactly — `▶ LABEL ◀` for the active theme, `▸ LABEL`
 * for inactive. No preview swatches: the user picks a theme by name,
 * not by color square (and the live preview is the entire app
 * retuning the moment they click).
 *
 * Names are user-facing ("Smoke", "Emerald", "Paper") so they're
 * baked in here rather than derived from the store key.
 */
export function ThemePicker() {
  const active = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <nav aria-label="Theme" className="flex flex-col gap-1">
      <span className="text-term-dim text-[10px] uppercase tracking-[0.2em] pt-1">
        THEME
      </span>
      {THEME_OPTIONS.map((opt) => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setTheme(opt.key)}
            aria-pressed={isActive}
            aria-label={`Switch to ${opt.label.toLowerCase()} theme`}
            className={[
              'font-mono text-sm uppercase tracking-wide select-none',
              // Mirrors SidebarLink: 2px border-left always reserved so
              // picking a theme doesn't shift the picker horizontally.
              'border-l-2 pl-2 pr-1 py-[2px] transition-colors duration-[80ms] text-left',
              isActive
                // Phase 8 — match SidebarLink's gold-active treatment.
                ? 'text-term-gold text-glow border-l-term-gold'
                : 'text-term-text border-l-transparent hover:bg-term-text hover:text-term-bg',
            ].join(' ')}
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className={isActive ? '' : 'text-term-dim'}>
                {isActive ? '▶' : '▸'}
              </span>
              <span>{opt.label}</span>
              {isActive ? (
                <span aria-hidden="true" className="ml-auto">
                  ◀
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
