# DESIGN.md: Fokus Kuliah

## Design Read

Reading this as: single-page student study timer and deadline tracker for university students in Indonesia, in a warm campus paper-and-ink visual language, dial ENERGY 2 / RHYTHM 2 / MOTION 1.

## Identity & Character

- **Product**: Fokus Kuliah (25/5 Pomodoro timer + academic deadline ledger, client-only with `localStorage`).
- **Metaphor**: Kertas & Tinta Kampus (unbleached study notebook paper, fountain-pen ink, terracotta bookmark accent for focus, sage ink for rest).
- **Dials**:
  - `ENERGY 2`: Clear typographic contrast between the serif editorial masthead, tabular countdown numerals, and tactile solid-ink buttons without neon glow or heavy gradients.
  - `RHYTHM 2`: Horizontal editorial masthead followed by an asymmetric two-column workspace on desktop (sticky timer panel + wider deadline ledger) and a quiet colophon footer.
  - `MOTION 1`: Instantaneous hover/active feedback and smooth ring progress stroke only, stopped under `prefers-reduced-motion: reduce`.

## Color System

Core neutral surfaces and ink (verified >= 4.5:1 text contrast, >= 3.0:1 UI border contrast):

- `--paper`: `#F6F2EA` (page canvas, warm study paper)
- `--card`: `#FFFDF8` (elevated sheet surface)
- `--inset`: `#EFE9DD` (recessed paper for segmented switcher and input surfaces)
- `--ink`: `#1C1B18` (primary text, 16.94:1 on `--card`, 15.42:1 on `--paper`)
- `--muted`: `#57534A` (secondary labels and course metadata, 7.54:1 on `--card`)
- `--subtle`: `#766F61` (footer and helper captions, 4.90:1 on `--card`)
- `--rule`: `#D8D0C1` (structural notebook dividers)
- `--rule-strong`: `#847B6C` (interactive control borders, 4.11:1 on `--card`)

Active mode accents (1 accent active per mode):

- Focus mode (`body[data-mode="focus"]`):
  - `--accent`: `#B8432E` (terracotta ink, 5.41:1 with white text, 5.32:1 on `--card`)
  - `--accent-hover`: `#993422` (7.32:1 with white text)
  - `--accent-tint`: `#F9EAE6` (6.25:1 with `--accent-hover`)
- Break mode (`body[data-mode="break"]`):
  - `--accent`: `#1F6E58` (sage/forest ink, 6.12:1 with white text, 6.02:1 on `--card`)
  - `--accent-hover`: `#175544` (8.68:1 with white text)
  - `--accent-tint`: `#E5F2ED` (7.55:1 with `--accent-hover`)

Semantic urgency tags (paired with text and border so status is never color-only):

- Late: `#FBEAE8` bg / `#9E221B` text (6.68:1)
- Today: `#FBF0DF` bg / `#8F4A07` text (5.91:1)
- Soon (1 to 7 days): `#F8F3DC` bg / `#6E5606` text (6.29:1)
- Later: `#EBF0F7` bg / `#2B4C7E` text (7.52:1)
- Done: `#E6F2EC` bg / `#195C42` text (6.89:1)

## Typography & Radius

- **Display / Headings**: `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif` for academic notebook character and zero-latency offline loading.
- **UI & Numerals**: `"Segoe UI", system-ui, -apple-system, sans-serif` with `font-variant-numeric: tabular-nums` on the countdown and counters so digits never jitter.
- **Radius hierarchy**: `12px` for sheet cards, `8px` for buttons and form fields, `4px` for status tags, `50%` exclusively for the circular clock ring.

## Purpose-Gate Decisions (R-31)

- **No hero gradient / no radial glow**: Solid paper tones preserve readability and give the app a grounded study-desk feel instead of a generic AI landing page.
- **No emojis**: Removed decorative emojis (`🎓`, `🍅`, `📌`, `🎉`, `🗑`, `▶`) and replaced functional control glyphs with minimal geometric SVGs paired with clear Indonesian labels.
- **Clock dial ticks**: Subtle 12/3/6/9 o'clock tick marks inside the SVG ring act as the product's identity motif, reinforcing the desk-clock metaphor.
- **Asymmetric 5fr / 7fr layout**: Gives the Pomodoro ring focused breathing room on the left while giving task titles, course names, and urgency tags enough width on the right without crowding.
