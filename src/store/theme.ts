import { create } from 'zustand';

/**
 * Terminal theme. Values match the `data-theme` attribute applied to
 * `<html>` and the selector names in `src/index.css`.
 *
 *   - `emerald`      — phosphor green on true-black. The default.
 *   - `emerald-dusk` — same phosphor-green accent vocabulary as emerald,
 *                     but with a lifted graphite bg and dark-ink panel
 *                     frames so boxes read as inset rather than outlined.
 *   - `smoke`        — kit-aligned cool blue-grey on near-black, with
 *                     antique-gold headline accents.
 *   - `paper`        — kit-aligned ledger-on-cream light theme, with
 *                     warm dark-orange headline accents.
 *
 * The earlier `halo` light theme was removed; any pre-existing
 * `'halo'` value in localStorage is rejected by `isTermTheme()` and
 * falls back to `emerald`.
 */
export type TermTheme = 'emerald' | 'emerald-dusk' | 'smoke' | 'paper';

export const TERM_THEMES: readonly TermTheme[] = [
  'emerald',
  'emerald-dusk',
  'smoke',
  'paper',
] as const;

const STORAGE_KEY = 'ea-terminal-theme';

function isTermTheme(v: unknown): v is TermTheme {
  return (
    v === 'emerald' ||
    v === 'emerald-dusk' ||
    v === 'smoke' ||
    v === 'paper'
  );
}

/** Read the saved theme from localStorage. Returns 'emerald' if missing or invalid. */
function loadTheme(): TermTheme {
  if (typeof window === 'undefined') return 'emerald';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isTermTheme(v) ? v : 'emerald';
  } catch {
    return 'emerald';
  }
}

/**
 * Apply the theme by flipping `data-theme` on `<html>`. Called
 * automatically when the store mutates, and once on startup via
 * `initTheme()` so the CSS variables resolve before first paint.
 */
function applyTheme(theme: TermTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

type ThemeStore = {
  theme: TermTheme;
  setTheme: (next: TermTheme) => void;
};

export const useThemeStore = create<ThemeStore>((set) => {
  const initial = loadTheme();
  // Re-apply on store init — `initTheme()` in main.tsx already did this
  // once, but if the store module is ever re-evaluated (HMR in dev) we
  // keep the DOM attribute in sync with the in-memory state.
  applyTheme(initial);
  return {
    theme: initial,
    setTheme: (next) => {
      applyTheme(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage blocked (private mode, storage full) — the in-memory
        // state still updates, the choice just won't persist across reloads.
      }
      set({ theme: next });
    },
  };
});

/**
 * Synchronously apply the persisted theme to the DOM. Call from
 * `src/main.tsx` **before** rendering so the first paint already uses
 * the right palette — otherwise light-theme users see a black flash.
 */
export function initTheme(): void {
  applyTheme(loadTheme());
}
