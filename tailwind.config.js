/** @type {import('tailwindcss').Config} */
//
// Every `term.*` color resolves to `rgb(var(--name) / <alpha-value>)` so the
// same utility classes (`bg-term-bg`, `text-term-greenBright`, `border-term-green/40`,
// …) can retheme live just by swapping the `data-theme` attribute on <html>.
// The three themes (`emerald` / `smoke` / `halo`) are defined in src/index.css.
// Opacity modifiers keep working because `<alpha-value>` is substituted by
// Tailwind at build time into the `rgb()` expression.
//
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        term: {
          bg:          'rgb(var(--term-bg) / <alpha-value>)',
          bgSoft:      'rgb(var(--term-bgSoft) / <alpha-value>)',
          surface:     'rgb(var(--term-surface) / <alpha-value>)',
          text:        'rgb(var(--term-text) / <alpha-value>)',
          muted:       'rgb(var(--term-muted) / <alpha-value>)',
          dim:         'rgb(var(--term-dim) / <alpha-value>)',
          green:       'rgb(var(--term-green) / <alpha-value>)',
          greenBright: 'rgb(var(--term-greenBright) / <alpha-value>)',
          greenDim:    'rgb(var(--term-greenDim) / <alpha-value>)',
          // Phase 7 — semantic positive PnL color, distinct from the UI
          // accent (--term-green). Use for chart positive bars, equity
          // curve area fills, win-state numerics where you want the value
          // to read as "green" even in themes whose UI accent isn't.
          pos:         'rgb(var(--term-pos) / <alpha-value>)',
          // Phase 8 — headline accent (warm gold). For FramedPanel titles,
          // sidebar wordmark, active nav rows, and the [ ACTIVE ] tag.
          // Distinct from --term-amber which carries warning/breakeven
          // semantics; gold is purely typographic emphasis.
          gold:        'rgb(var(--term-gold) / <alpha-value>)',
          red:         'rgb(var(--term-red) / <alpha-value>)',
          amber:       'rgb(var(--term-amber) / <alpha-value>)',
          neutral:     'rgb(var(--term-neutral) / <alpha-value>)',
          scoreFrom:   'rgb(var(--term-scoreFrom) / <alpha-value>)',
          scoreTo:     'rgb(var(--term-scoreTo) / <alpha-value>)',

          // Phase 1 expansion — surface stack + border vocabulary.
          // RGB-triplet pattern matches the rest of the palette so opacity
          // modifiers (`bg-term-bgRaised/40`, `border-term-border/60`) work.
          bgRaised:    'rgb(var(--term-bgRaised) / <alpha-value>)',
          bgSunken:    'rgb(var(--term-bgSunken) / <alpha-value>)',
          bgOverlay:   'rgb(var(--term-bgOverlay) / <alpha-value>)',
          border:      'rgb(var(--term-border) / <alpha-value>)',
          borderDim:   'rgb(var(--term-borderDim) / <alpha-value>)',
          borderHot:   'rgb(var(--term-borderHot) / <alpha-value>)',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        pixel: ['"Press Start 2P"', 'monospace'],
      },
      borderRadius: { DEFAULT: '0px', none: '0px', sm: '0px', md: '0px', lg: '0px', full: '0px' },
      boxShadow: {
        // Defaults forced to none — the design system has no decorative shadows.
        DEFAULT: 'none', sm: 'none', md: 'none', lg: 'none', xl: 'none',
        // Phase 1 expansion — opt-in phosphor glows. These bypass the
        // forced-none defaults intentionally; reach for them when you want
        // the kit's CRT phosphor halo on a card or accented element.
        // Value resolves to 0-alpha on smoke/halo, so they're safe globally.
        'term-glow':         'var(--term-glowSoft)',
        'term-glow-strong':  'var(--term-glowStrong)',
      },
    },
  },
  plugins: [],
};
