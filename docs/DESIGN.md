# Design Spec — Pomodoro App ("calm & warm", Farsi-first, RTL)

> Reference in Cursor with `@docs/DESIGN.md`. Visual mockups live in `docs/design/` (PNG exports if present) and the mockup source in `docs/design/source/*.dc.html`.
> The `.dc.html` files are **design mockups, not app code**: `{{ holes }}`, `<sc-for>`, `<sc-if>` are mockup syntax. Read them for exact markup, spacing and copy; rebuild them as React + Tailwind components.

## 1. Direction
Calm, paper-like and warm. Soft rounded shapes, one accent per timer phase, generous spacing. Phone-first; desktop is the same design in a sidebar layout. Only the light "warm" theme is designed so far; "night" and "forest" (free) and the Pro themes are still to do.

## 2. Tokens (put these in `web/src/app/globals.css` under `@theme`, Tailwind v4)

```css
@theme {
  --color-ground: #F6F1E9;      /* app background */
  --color-surface: #FFFBF5;     /* cards, nav */
  --color-surface-2: #EBE2D4;   /* segmented-control track, empty heat cell */
  --color-line: #E4D8C7;        /* card borders, dividers */
  --color-line-strong: #CDBFAE; /* input / outlined button borders */
  --color-ink: #2B2420;         /* text */
  --color-muted: #66594E;       /* secondary text (4.5:1 on ground) */

  --color-focus: #B8472F;       /* focus phase accent, primary buttons */
  --color-focus-soft: #F3DDD3;  /* tinted chips */
  --color-focus-ink: #8A2F1B;   /* text on focus-soft */
  --color-short: #3F7352;       /* short break accent, "done" check */
  --color-long: #35688A;        /* long break accent */

  --color-pro-bg: #F6E7C1;      /* Pro badges, lock chips */
  --color-pro-ink: #6B4500;

  --color-ring-track: #E6D9C8;
  --color-switch-off: #8F8171;

  /* heatmap intensity 0–4 (text on 4 is white, others ink) */
  --color-heat-0: #EBE2D4;
  --color-heat-1: #F0C9B8;
  --color-heat-2: #E39C80;
  --color-heat-3: #C9694A;
  --color-heat-4: #8F3320;

  --font-sans: "Vazirmatn", Tahoma, "Segoe UI", sans-serif;
}
```

The phase accent (`focus` / `short` / `long`) is one CSS variable `--phase` set on the timer screen; ring, play button, active tab, auto-start switches and dots all read it.

**Type** (Vazirmatn 400/500/600/700, self-hosted): timer digits 64px/600 (phone) · h1 22px/700 · card title 16px/600 · body 15px · secondary 13px · labels 12px (never smaller). Farsi needs generous line-height (1.5–2 for paragraphs).
**Radii:** pill 22px · cards 20px · feature cards 24–28px · tab track 16px / tab 12px · inputs/buttons 14–16px · full-round for icon buttons.
**Touch targets:** every control ≥ 44×44px.
**Phone frame:** 390×844; screen padding 16px; bottom nav 64px.

## 3. Components (see mockups for exact markup)
- **Phase tabs** (segmented): track `surface-2`, active tab filled with phase accent + white text.
- **Timer ring:** SVG, r=122 in a 280 box, 12px stroke, round caps, track `ring-track`, starts at 12 o'clock. Progress = `strokeDashoffset = C × (1 − elapsed/planned)`. Digits are LTR (`dir="ltr"`), Persian numerals.
- **Controls:** reset (56px outline) · play/pause (84px filled, phase accent) · skip (56px outline). In RTL the order is reset → play → skip from the right.
- **Cycle dots:** 4 dots; done = filled, current = outlined with accent border, upcoming = grey outline.
- **Auto-start switches:** three `role="switch"` buttons (focus / short / long) in one card; on = phase accent track, off = `switch-off`.
- **Streak chip:** flame icon + "N روز پیاپی", `focus-soft` background. This is the **current** streak. On the stats page the card labeled «رکورد پیاپی» is the **best** streak, not the current one.
- **Task row:** native checkbox (44px hit area), title, "done/planned" count; active task has a 2px focus-colored border and "در حال تمرکز" tag.
- **Heatmap:** calendar grid, 7 columns × up to 6 rows, today has a 2px ink inset ring, future days dashed outline. The week starts on **Saturday for `fa` only**; other locales use their usual first day. Dates are **Jalali** for `fa` (`Intl` with `fa-IR-u-ca-persian`) and Gregorian otherwise.
- **7-day bars:** daily focus minutes for today and the six days before it. Shown on the phone when «۷ روز» is selected (the phone mockup omits this chart). On desktop it also sits beside the month heatmap. Values are printed on the bars, not color alone.
- **Pro lock:** `pro-bg` pill / lock icon; tapping goes to Pricing. The check is always repeated on the server.
- **Plan cards:** radio group (native `<input type=radio>`), recommended plan has a 2px focus border + "پیشنهاد ما" tag.

## 4. RTL rules
`dir="rtl"` on `<html>` for `fa`; logical Tailwind utilities only. Back chevrons point right in RTL; "next/forward" chevrons and the skip icon point left. Play triangle is not mirrored. Timer digits and phone numbers are `dir="ltr"`.

## 5. Screen inventory
| Screen | Phone | Desktop |
|---|---|---|
| Timer | `Main.dc.html` | `DesktopTimer.dc.html` |
| Stats (heatmap, streak) | `Stats.dc.html` | `DesktopStats.dc.html` |
| Tasks | `Tasks.dc.html` | `DesktopTasks.dc.html` |
| Settings | `Settings.dc.html` | `DesktopSettings.dc.html` |
| Pricing | `Pricing.dc.html` | (same layout, centered card) |
| Landing page | `Landing.dc.html` (responsive) | same file |

**Placeholders still open:** app name (shown as "پومودورو"), prices (`[قیمت]`), Enamad badge, all sample data (stats, tasks, phone number). Don't ship these literally.

## 6. Responsive behaviour
Below 768px: bottom nav + single column (phone designs). From 768px: right-hand sidebar nav + content area (desktop designs). The same components and tokens are used at both sizes.
