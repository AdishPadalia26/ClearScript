# ClearScript console: design system ("Lightbox")

The source of truth for every screen in `web/`. Tokens live in `app/globals.css`. Use them by
name (`bg-surface`, `text-muted`, `text-red`), never hex values in components.

## Personality and principles

A **clinical instrument**, calm and dense and keyboard-first, built for a pharmacist working a
queue. It is not a marketing site and not a dashboard.

1. **Every value is one glance from its evidence.** A field never appears without its triage,
   its reason, and, one click away, the pixels each reader saw.
2. **Uncertainty is loud; certainty is quiet.** Red and amber get color, an icon and a word.
   Verified fields recede.
3. **One bold element.** The dark *lightbox* behind the fax is the only dark surface. The
   evidence boxes glow on it. Everything else stays light and quiet.
4. **Status never lies.** Connection, save and call state come from what actually happened
   (a response or an error), never from proxies such as `navigator.onLine`.
5. **Results persist.** A meaningful outcome (approved, rejected, call answered) stays on the
   page as state. A toast may confirm it but never carries it alone.

## Color tokens (light first; dark tokens mirror them in `globals.css`)

| Role | Token | Light |
|---|---|---|
| Page background | `--bg` | `#f4f6f7` |
| Surface | `--surface` | `#ffffff` |
| Raised / hover surface | `--surface-2` | `#eef2f4` |
| Border / strong border | `--rule` / `--rule-strong` | `#d9e0e4` / `#b9c4cb` |
| Text / muted / faint | `--ink` / `--ink-muted` / `--ink-faint` | `#14202a` / `#56636e` / `#5c6873` |
| Primary action | `--accent` (+ `--accent-ink`, `--accent-bg`) | `#0a6b70` |
| Focus ring | `--focus` | `#1769d1` |
| Error / blocking | `--triage-red` (+ `-bg`) | `#b42318` |
| Warning / check | `--triage-yellow` (+ `-bg`) | `#8f5f00` |
| Success / verified | `--triage-green` (+ `-bg`) | `#1d7646` |
| Fax lightbox | `--lightbox` / `--lightbox-ink` | `#26313a` / `#c9d3da` |
| Evidence strokes on the fax | `--box-red/yellow/green` | brighter than the text tokens, so they read on paper |
| Chart series | `--series-1` / `--series-2` | `#2a78d6` / `#eb6834` (validated for color-vision deficiency in light and dark) |

Rules: triage colors mean triage only, never decoration. Chart series never reuse triage colors.
All text meets 4.5:1 against its background, including on the tints.

## Typography

- **IBM Plex Sans** (400/500/600) for UI and labels. **IBM Plex Mono** (400/500) for clinical
  *values* (drug, strength, NPI, DEA, dates) and numbers. The family switch itself says "this is data".
- Base 14px (`html`); `?demo=1` raises it to 15.4px for projectors.
- Scale: page title 20/600 · section 16/600 · panel heading 13–15/600 · body 13.5–14 ·
  meta 12–12.5 · field value 14 mono · hero numbers 26–52 mono. Line-height 1.35–1.5 for prose.
- Sentence case everywhere. No all-caps eyebrows. Tabular numerals (`.tabular`) in tables and timers.

## Spacing, layout, density

- 4px base. Common steps: 4 · 8 · 12 · 16 · 20 · 24. Rows are 44px (queue) or about 48px (fields).
- Shell: a 68px nav rail on the left at ≥ 640px; a bottom tab bar below 640px. A 48px header.
- Order review: a resizable split, 55% fax / 45% fields (25–75%) at ≥ 1024px; stacked below.
  On phones the fields come first and the fax is collapsed behind "Show fax".
- Queue: a table at ≥ 768px; a stacked list below 768px. Filter tabs scroll horizontally, never clip.
- Hit targets are at least 36px for actions (`size="lg"` is 44px for primary decisions).

## Radii, borders, shadows

- Radius: 6px (`rounded-md`) for controls, 8px (`rounded-lg`) for panels, full for status pills.
- Prefer a 1px `--rule` border over shadows. Use `--shadow-pop` only for things that float above
  the page (drawer, dialog, tooltip).

## Icons

lucide-react at 13–18px, always beside text or with an `aria-label`. One icon per meaning:
OctagonAlert = blocking, TriangleAlert = check, CircleCheck = verified, Phone = call.

## Motion

Only cause → effect: the drawer slides in (180ms), dialogs pop (170ms), a resolved field washes
green once (900ms), the live call step pulses. Easing `--ease`. `prefers-reduced-motion`
collapses all of it to about 1ms.

## Component states

Every interactive component defines: default, hover (`surface-2`), focus (2px `--focus` ring),
active/selected (`accent-bg`), disabled (faint text, no pointer, with a tooltip saying why when it
blocks a decision), loading (skeletons shaped like the content, or a labelled spinner for work
under ~2s), empty (what's missing plus the next action), error (plain cause plus Retry, inputs
preserved), and success (persistent state on the page; a toast at most confirms it).

## Accessibility constraints

WCAG 2.2 AA target. Landmarks (`nav`, `main`, `header`), one `h1` per screen, real buttons and
links, labelled icon-only controls, a visible focus everywhere, Escape closes drawers and dialogs,
focus returns to the trigger, and async updates are announced through `role="status"` or
`aria-live` regions. Charts are `aria-hidden` and paired with a data table.
