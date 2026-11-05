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
  --color-focus-ink: #8A2F1B;   /* text on focus-soft; destructive buttons */
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
- **Navigation:** five destinations, in this order: تایمر · کارها · یادداشت‌ها · آمار · تنظیمات. Phone: bottom nav, 5 equal tabs, 24px icon + 12px label, active = `focus` colour + 600 weight. Desktop: right-hand sidebar, 48px rows, active = `focus-soft` fill + `focus-ink` text. The Notes icon is a sticky note (page with a folded corner).
- **Phase tabs** (segmented): track `surface-2`, active tab filled with phase accent + white text.
- **Timer ring:** SVG, r=122 in a 280 box, 12px stroke, round caps, track `ring-track`, starts at 12 o'clock. Progress = `strokeDashoffset = C × (1 − elapsed/planned)`. Digits are LTR (`dir="ltr"`), Persian numerals.
- **Controls:** reset (56px outline) · play/pause (84px filled, phase accent) · skip (56px outline). In RTL the order is reset → play → skip from the right.
- **Cycle dots:** 4 dots; done = filled, current = outlined with accent border, upcoming = grey outline.
- **Auto-start switches:** three `role="switch"` buttons (focus / short / long) in one card; on = phase accent track, off = `switch-off`.
- **Streak chip:** flame icon + "N روز پیاپی", `focus-soft` background.
- **Task row:** native checkbox (44px hit area), title, "done/planned" count; active task has a 2px focus-colored border and "در حال تمرکز" tag.
- **Heatmap:** calendar grid, Saturday first, 7 columns × up to 6 rows, today has a 2px ink inset ring, future days dashed outline. Dates are **Jalali** (`Intl` with `fa-IR-u-ca-persian`).
- **Pro lock:** `pro-bg` pill / lock icon; tapping goes to Pricing. The check is always repeated on the server.
- **Pro tag:** small `pro-bg` / `pro-ink` pill reading "پرو", next to the title of a Pro-only screen (Notes).
- **Plan cards:** radio group (native `<input type=radio>`), recommended plan has a 2px focus border + "پیشنهاد ما" tag.
- **Ambient sound row (phone timer, below the auto-start card):** one 48px card = link area (rain icon · "صدای محیطی" label · current sound name · forward chevron) that opens the Ambient screen, plus a separate 44px round play/pause button (`surface-2`). The link and the button are siblings, never nested.
- **Sound tile (Ambient screen, desktop timer section):** icon above a label, 3-column grid, gap 10px, min height 96px (phone) / 88px (desktop). Selected (playing) = 2px `focus` border + `focus-soft` fill + `focus-ink` text. Free-but-unselected = `surface` fill + `line` border. Pro-locked = same, muted icon, and a 20–22px `pro-bg` circle with a lock icon at the inline-start top corner; tapping goes to Pricing. Tile text is 12px on desktop, 13px on phone.
- **Volume slider:** native `<input type=range>` with a speaker icon and a Persian-digit percentage, 44px tall, `accent-color` = `focus`. In RTL the slider's minimum is on the right.
- **Note card (list):** `surface` card, radius 20 (phone) / 16 (desktop list), padding 14×16. Title 15px/600; body preview 13px `muted`, clamped to 2 lines; meta row = date (12px `muted`, "امروز، ۱۰:۲۴" / "دیروز" / Jalali "۱۲ آبان") + optional linked-task chip (`focus-soft` / `focus-ink`, check-square icon). Desktop selected card = 2px `focus` border; others `ground` fill + `line` border.
- **Note editor:** borderless title input (22px/700 phone, 26px/700 desktop), meta row (date + linked-task chip, or a dashed "+ پیوند به یک کار" button when none), hairline divider, borderless auto-growing textarea (15–16px, line-height 2), footer with Persian-digit word count and "همگام با همه دستگاه‌ها". Autosaves: a small green check + "ذخیره شد" at the top; there is no Save button.
- **Delete confirmation:** never delete on the first tap. Phone: bottom sheet over a 45% `ink` scrim (`role="dialog"`, `aria-modal`), title "این یادداشت حذف شود؟", the note's title in the body text, a full-width `focus-ink` "حذف یادداشت" button and an outlined "انصراف". Desktop: an inline `focus-soft` bar (`role="alertdialog"`) above the title with the same two buttons. After deleting on phone, a short "یادداشت حذف شد" state offers "برگرداندن" (undo).

## 4. RTL rules
`dir="rtl"` on `<html>` for `fa`; logical Tailwind utilities only. Back chevrons point right in RTL; "next/forward" chevrons and the skip icon point left. Play triangle is not mirrored. Timer digits and phone numbers are `dir="ltr"`. Note text is user content: render it with `dir="auto"` so English notes read left-to-right.

## 5. Screen inventory
| Screen | Phone | Desktop |
|---|---|---|
| Timer | `Main.dc.html` | `DesktopTimer.dc.html` |
| Ambient sounds | `Ambient.dc.html` (opened from the row on the timer) | section inside `DesktopTimer.dc.html` (right column, under tasks) |
| Stats (heatmap, streak) | `Stats.dc.html` | `DesktopStats.dc.html` |
| Tasks | `Tasks.dc.html` | `DesktopTasks.dc.html` |
| Notes (Pro) | `Notes.dc.html` (list + search) → `NoteEditor.dc.html` (create / edit / delete) | `DesktopNotes.dc.html` (list and editor side by side) |
| Notes, free user | `NotesLocked.dc.html` | (same card, centered in the content area — not drawn yet) |
| Settings | `Settings.dc.html` | `DesktopSettings.dc.html` |
| Pricing | `Pricing.dc.html` | (same layout, centered card) |
| Landing page | `Landing.dc.html` (responsive) | same file |

**Ambient sounds — content and rules**
- Sounds, in order: باران (rain), نویز قهوه‌ای (brown noise), نویز سفید (white noise), نویز صورتی (pink noise), اقیانوس (ocean), آتش (fire), باد (wind), جنگل (forest), رودخانه (river).
- **Free:** one sound, باران. **Pro:** the full library, and mixing several sounds with separate volumes (see §3 of `PLAN.md`). The Ambient screen shows the mixing as an upsell card; the mixer UI itself is still to design.
- Sounds loop seamlessly, keep playing across phase changes, and are independent of the phase end chime. Audio files are self-hosted (Phase 8).
- The play/pause state and volume are per-device preferences; the selected sound syncs with the account.

**Notes — content and rules**
- **Pro only.** The Notes tab is visible to everyone. Free users see `NotesLocked` (blurred placeholder cards, a short pitch, four benefits, "ارتقا به پرو" → Pricing). The server rejects every note read/write from non-Pro accounts (`requirePro()`).
- **Create:** the round "+" button (phone header) or "یادداشت جدید" (desktop) opens an empty note in the editor; an empty note that is left without any text is discarded, not saved.
- **Edit:** tap a card (phone) or select it in the list (desktop); edits autosave (debounced, ~1s) and update the note's `updatedAt`, which sorts the list (newest first).
- **Delete:** trash button in the editor → confirmation → removed from all devices. The phone offers undo while the confirmation state is on screen.
- **Search:** filters the list by title and body as you type; an empty result shows "یادداشتی با این عبارت پیدا نشد."
- **Link to task (optional):** a note can be linked to one task; the chip shows the task title. Linking UI (picker) is still to design.
- Data model: the `Note` table in `PLAN.md` §4, plus an optional `taskId`.
- When a Pro subscription expires, notes are kept read-only (never deleted); editing unlocks again on renewal.

**Placeholders still open:** app name (shown as "پومودورو"), prices (`[قیمت]`), Enamad badge, all sample data (stats, tasks, notes, phone number). Don't ship these literally. The fire icon is a first draft and may need refining.

## 6. Responsive behaviour
Below 768px: bottom nav + single column (phone designs). From 768px: right-hand sidebar nav + content area (desktop designs). The same components and tokens are used at both sizes.
