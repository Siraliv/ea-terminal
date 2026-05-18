# Emerald Dusk — theme port guide

Self-contained recipe for porting the Emerald Dusk theme to another
project. Captures the visual identity, the CSS variable system, the
clever tricks (and one pitfall that bit us), and what to verify after
applying it.

> Emerald Dusk is the "lifted graphite" variant of the Emerald terminal
> theme. Same phosphor green vocabulary for accents, but the background
> sits on a soft graphite (#16181A) instead of pure black, and the
> FramedPanel rules drop into a near-black ink so panels read as
> *inset into the page* rather than glowing on top.

---

## 1. The visual identity in one paragraph

A dark UI that **inverts the figure-ground relationship** compared to
classic dark themes. Instead of glowing accents over black, the page
itself is the bright surface (graphite, just enough above black to be
noticeable) and the panel frames + dividers are darker than the page —
near-black ink seams cut *into* the surface. Phosphor-green accents
stay phosphor for active states, headlines, and chart positives, so the
"emerald" identity carries through. The net feel is quieter, more
"document on a desk" than "stuff on a CRT."

---

## 2. The CSS variable system

The theme is delivered via a `:root[data-theme='emerald-dusk']` block in
your global CSS. Every colour is an `R G B` triplet so you can compose
opacity at the use site with `rgb(var(--term-foo) / 0.5)`.

### 2.1 Base palette

```css
:root[data-theme='emerald-dusk'] {
  /* Lifted graphite surface stack. Each layer a notch above the
     previous so bg / panel / raised states stay perceptible without
     going pure black. */
  --term-bg:          22  24  26;    /* #16181A — page graphite       */
  --term-bgSoft:      28  30  33;    /* #1C1E21                       */
  --term-surface:     34  37  40;    /* #222528                       */

  /* Foreground stack. Lifted vs Emerald to compensate for the
     brighter bg — Emerald's #4A4A4A `dim` reads ~3.5:1 on pure black
     but drops below 2:1 on graphite. */
  --term-text:        232 232 232;   /* #E8E8E8 — body text           */
  --term-muted:       178 178 178;   /* #B2B2B2 — labels, captions    */
  --term-dim:         128 128 128;   /* #808080 — disclaimers, hints  */

  /* THE KEY TRICK: --term-green is repurposed here from phosphor
     green to near-black ink. Drives every panel frame character
     (FramedPanel uses text-term-green/70 for the box-drawing) and
     reads as a sunken charcoal seam against the lifted bg. */
  --term-green:       6   6   6;     /* #060606 — frame ink           */
  --term-greenBright: 0   255 127;   /* same as Emerald — active accent */
  --term-greenDim:    31  93  58;    /* same as Emerald               */

  /* Semantic POSITIVE — kept phosphor so equity curves / win
     indicators / [ ACTIVE ] tags still read emerald-green. */
  --term-pos:         61  220 132;   /* #3DDC84                       */

  --term-red:         255 77  77;
  --term-amber:       232 155 60;
  --term-neutral:     110 110 110;

  /* Headline accent — kept identical to greenBright so the wordmark
     and active nav tier stays bright phosphor against the seams. */
  --term-gold:        0   255 127;

  /* Borders. CRITICAL — these used to mirror Emerald's tier (#1C1F22)
     but that's BRIGHTER than the graphite bg, so dashed dividers
     disappeared. They must be darker than the bg to read as sunken
     seams. */
  --term-border:      14  14  16;    /* #0E0E10 — body dividers       */
  --term-borderDim:   6   6   8;     /* #060608 — faint dashed rules  */
  --term-borderHot:   0   255 127;   /* phosphor for active outline   */

  /* Soft phosphor glow on bright accents — kept lighter than Emerald
     because the lifted bg amplifies bloom. */
  --term-glowText:    0 0 5px  rgba(61, 220, 132, 0.32);
  --term-glowSoft:    0 0 10px rgba(61, 220, 132, 0.14);
  --term-glowStrong:  0 0 16px rgba(61, 220, 132, 0.40);

  color-scheme: dark;
}
```

### 2.2 Token semantics — who uses what

| Token | Where it shows up | Visual role |
|---|---|---|
| `--term-bg` | Page background | The lifted graphite surface |
| `--term-bgSoft` | Hover rows, secondary panels | One notch lighter than bg |
| `--term-surface` | Raised cards | Two notches lighter |
| `--term-text` | Body text | Primary readable |
| `--term-muted` | Labels, captions | Secondary |
| `--term-dim` | Disclaimers, footnotes | Tertiary |
| `--term-green` (sic) | FramedPanel `┌─ ─┐` glyphs, sidebar rule | **Sunken seam ink** |
| `--term-greenBright` | Wordmark, [ ACTIVE ] tag, primary buttons, active nav | Phosphor accent |
| `--term-pos` | Equity curves, positive PnL, win tags | Phosphor positive |
| `--term-red` | Drawdown areas, negative PnL | Red accent |
| `--term-amber` | Warnings | Amber accent |
| `--term-border` | Body dividers | Inset dark line |
| `--term-borderDim` | Dashed dividers, grid lines, axis baselines | Faintest seam |

---

## 3. The trick that makes it work

Most dark themes treat their "primary" colour token as a bright glow.
In Emerald Dusk we **rebind that token to near-black** and rely on
`--term-greenBright` for actual bright phosphor accents.

This means:

- `text-term-green/70` (which FramedPanel uses for its frame characters)
  resolves to a low-opacity near-black → reads as a **sunken seam**
  against the lifted bg.
- `text-term-greenBright` stays phosphor — used by buttons, wordmark,
  active state.

The same principle drives `--term-border` and `--term-borderDim`:
both **darker than the bg**, so dashed dividers read as inset cuts.

If you keep this duality in your head — *"green = ink, greenBright =
glow"* — porting the rest is mechanical.

---

## 4. Where to apply the theme

### 4.1 Activate via attribute

In your top-level component or auth shell, set the attribute on
`<html>`:

```ts
document.documentElement.setAttribute('data-theme', 'emerald-dusk');
```

A simple Zustand store (or any state library) can persist the choice in
`localStorage` and toggle the attribute when the user picks a theme.

### 4.2 Consume from Tailwind

Map the variables in `tailwind.config.js` so every utility class
participates:

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        'term-bg':          'rgb(var(--term-bg) / <alpha-value>)',
        'term-bgSoft':      'rgb(var(--term-bgSoft) / <alpha-value>)',
        'term-surface':     'rgb(var(--term-surface) / <alpha-value>)',
        'term-text':        'rgb(var(--term-text) / <alpha-value>)',
        'term-muted':       'rgb(var(--term-muted) / <alpha-value>)',
        'term-dim':         'rgb(var(--term-dim) / <alpha-value>)',
        'term-green':       'rgb(var(--term-green) / <alpha-value>)',
        'term-greenBright': 'rgb(var(--term-greenBright) / <alpha-value>)',
        'term-greenDim':    'rgb(var(--term-greenDim) / <alpha-value>)',
        'term-pos':         'rgb(var(--term-pos) / <alpha-value>)',
        'term-red':         'rgb(var(--term-red) / <alpha-value>)',
        'term-amber':       'rgb(var(--term-amber) / <alpha-value>)',
        'term-gold':        'rgb(var(--term-gold) / <alpha-value>)',
        'term-border':      'rgb(var(--term-border) / <alpha-value>)',
        'term-borderDim':   'rgb(var(--term-borderDim) / <alpha-value>)',
        'term-neutral':     'rgb(var(--term-neutral) / <alpha-value>)',
      },
      boxShadow: {
        glow:       'var(--term-glowText)',
        'glow-sm':  'var(--term-glowSoft)',
        'glow-lg':  'var(--term-glowStrong)',
      },
    },
  },
};
```

### 4.3 Chart libraries (Recharts etc.)

In the chart theme constants, map JS-side colour helpers to the same
variables so charts retheme live:

```ts
export const chartTheme = {
  green:        'rgb(var(--term-green))',
  greenBright:  'rgb(var(--term-greenBright))',
  pos:          'rgb(var(--term-pos))',
  red:          'rgb(var(--term-red))',
  amber:        'rgb(var(--term-amber))',
  text:         'rgb(var(--term-text))',
  muted:        'rgb(var(--term-muted))',
  dim:          'rgb(var(--term-dim))',
  bg:           'rgb(var(--term-bg))',
  borderDim:    'rgb(var(--term-borderDim))',
};

// Use borderDim for grid lines + axis baselines, NOT chartTheme.green
// at low opacity. On graphite, a faded near-black disappears; a
// solid near-black reads as a sunken seam.
export const gridProps = {
  stroke: chartTheme.borderDim,
  strokeOpacity: 1,
  strokeDasharray: '2 3',
  vertical: false,
} as const;
```

---

## 5. Pitfalls (the ones that cost us hours)

### 5.1 Primary buttons render invisible

The classic dark-theme pattern is `bg-primary` / `text-primary`. Under
Emerald Dusk `--term-green` is near-black, so a button styled `text-term-green` reads as black-on-graphite — invisible.

**Fix**: use `--term-greenBright` for everything that should glow.
Reserve `--term-green` exclusively for the "ink" tier (frame characters,
sunken seams).

### 5.2 Borders that mirror Emerald disappear

We initially set `--term-borderDim` to the same value as Emerald's
(`#1C1F22`). That worked against pure black; on graphite (#16181A) it's
*brighter* than the surface, so dashed dividers wash out completely.

**Fix**: borders must be **darker** than `--term-bg`, not lighter.
Treat them as the "ink" tier — same family as `--term-green`'s
near-black, just a touch different so the eye registers them as
separate.

### 5.3 Faded grid lines disappear

Same root cause. Recharts grid lines at `strokeOpacity: 0.12` of
`--term-green` (#060606) become roughly invisible against graphite.

**Fix**: use `--term-borderDim` directly at `strokeOpacity: 1`. The
*colour* controls the subtlety, not the opacity.

### 5.4 Muted text is hard to read

Emerald's `--term-dim: #4A4A4A` is barely passable on pure black (~3.5:1
contrast). On graphite it drops below 2:1 and reads as illegible
grey-on-grey.

**Fix**: lift the foreground stack — `text` to `#E8E8E8`, `muted` to
`#B2B2B2`, `dim` to `#808080`. Preserves the perceived contrast users
expect from Emerald.

### 5.5 Frame glyphs lose alpha

`FramedPanel` typically uses `text-term-green/70` for its box-drawing
characters. The `/70` cuts opacity to compensate for the bright
phosphor on black. With Dusk's near-black ink, `/70` of `#060606` is
still very dark — that's *the point*. Don't bump it back up to `/100`
"because it looks faint"; the faintness is the design.

---

## 6. Verification checklist

After porting, walk through these to confirm the theme reads correctly:

- [ ] FramedPanel `┌─ ─┐` glyphs visible as **dark seams** against the
      graphite bg (not as bright lines)
- [ ] Page wordmark / `[ ACTIVE ]` tags still bright phosphor green
- [ ] Primary buttons (any `text-term-greenBright` or similar bright
      variant) clearly visible
- [ ] **Dashed dividers** between table rows / panel sections **visible**
      as darker-than-bg seams
- [ ] **Chart grid lines** visible on every chart (equity, drawdown,
      Pareto scatter, anything with a `CartesianGrid`)
- [ ] Italic disclaimer text (`text-term-dim`) **readable** without
      squinting — should sit at ~4:1 contrast against the bg
- [ ] Active sidebar nav row reads as bright phosphor with the
      `▶ … ◀` arrows visible
- [ ] Equity curve (`text-term-pos`) renders in clear phosphor green —
      not the near-black ink colour
- [ ] No element silently disappears (open every page and scroll)

---

## 7. Quick ports for other component libraries

The recipe doesn't care about React or Tailwind specifically. The
variables are the source of truth; you can consume them from:

- **CSS Modules**: `color: rgb(var(--term-text));`
- **styled-components**: `color: rgb(var(--term-text));` in template
  strings — they resolve at paint time
- **vanilla-extract**: declare `--term-*` in your global theme and
  reference from any sprinkle
- **SCSS**: same — CSS variables are interpolated at runtime
- **Chakra / MUI**: extend the theme palette to map `palette.primary.main`
  → `rgb(var(--term-greenBright))`, `palette.background.default` →
  `rgb(var(--term-bg))`, etc.

The only requirement is that your component library lets you set a
real CSS colour (not a typed token) somewhere. If it accepts hex or rgb,
you can plug the variables in.

---

## 8. Companion themes (the Emerald family)

If you want a theme picker — say, "let users pick between black-bg and
graphite-bg dark variants" — the sibling theme is **Emerald** (pure
black bg, phosphor `--term-green`). The two share the entire vocabulary
of accent colours and only differ on:

- `--term-bg`: `0 0 0` vs `22 24 26`
- `--term-green`: phosphor `61 220 132` vs ink `6 6 6`
- `--term-border` / `--term-borderDim`: brighter vs darker than bg
- `--term-text` / `--term-muted` / `--term-dim`: slightly lifted for
  Dusk to keep contrast against the lifted bg

Implementing Emerald first is actually the cleaner path — it forces you
to discover what `--term-green` is used for. Dusk then becomes a single
`:root[data-theme='emerald-dusk']` block that overrides the relevant
tokens.

---

## 9. The one-line litmus test

> **In Emerald Dusk, `--term-green` is the ink. `--term-greenBright`
> is the glow. Borders are darker than the page.**

If you keep that in your head, the rest is just paint.

---

End of guide.
