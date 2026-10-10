# ClearScript — pharmacist review console (`web/`)

The screen a pharmacist uses to turn a faxed prescription into a verified order. Every field is
tied to the fax pixels it came from, flags explain themselves, and the "Call prescriber" voice
loop never dials without a click.

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 · TanStack Query v5 · zod ·
Radix · Recharts · MSW v2 · Vitest · Playwright.

## Run it

```bash
cd web
npm install
cp .env.example .env.local
npm run mock:dev          # http://localhost:3000, full demo story, no backend needed
```

| Mode               | How                                                                        | What happens                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **mock** (default) | `NEXT_PUBLIC_API_MODE=mock`                                                | MSW intercepts `fetch`, XHR and the WebSocket in the browser. In-memory state: resolving, calls, and approvals all work and reset on reload.                          |
| **live**           | `NEXT_PUBLIC_API_MODE=live` + `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_WS_URL` | Talks to the real API. Every response is zod-validated; a mismatch shows an error rather than rendering unvalidated data. Report mismatches in `BACKEND_REQUESTS.md`. |

Add `?demo=1` to any URL for presentation mode: type +10%, dev badges hidden, and a "Synthetic data"
ribbon. It sticks for the tab; `?demo=0` turns it off.

## Scripts

|                                                         |                                                                        |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev` / `mock:dev`                              | Dev server (`mock:dev` forces mock mode)                               |
| `npm run build` / `start`                               | Production build (standalone output)                                   |
| `npm run lint` · `typecheck`                            | ESLint · `tsc --noEmit`                                                |
| `npm test`                                              | Vitest unit + component tests (`--coverage` enforces ≥ 80 % on `lib/`) |
| `npm run test:e2e`                                      | Playwright against mock mode, including axe WCAG A/AA scans            |
| `E2E_LIVE=1 NEXT_PUBLIC_API_MODE=live npm run test:e2e` | Adds `e2e/live.spec.ts` against a real backend                         |

pnpm works too (`pnpm <script>`); the lockfile in the repo is npm's.

## Keyboard

| Where    | Keys                           | Action                                                                              |
| -------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Anywhere | `?`                            | Shortcut help                                                                       |
|          | `U`                            | Upload a fax                                                                        |
| Queue    | `↑` `↓` (or `J` `K`) · `Enter` | Move · open order                                                                   |
| Order    | `J` / `K`                      | Next / previous flagged field                                                       |
|          | `Enter`                        | Open the selected field; press again in the drawer to **accept**                    |
|          | `E`                            | Edit the field (Enter saves, Esc cancels)                                           |
|          | `C`                            | Call the prescriber about the field (opens the confirm card; never dials by itself) |
|          | `B`                            | Show every field's box on the fax                                                   |
|          | `Ctrl/⌘ Enter`                 | Approve (opens the confirm dialog)                                                  |
|          | `Esc`                          | Close the drawer                                                                    |

Mouse-free path for the smudged demo order: `J` `Enter` `J` `E` _500 mg_ `Enter` `Esc` `Ctrl+Enter` `Enter`.

## Demo story (mock fixtures)

| Order                                | What it shows                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ord_clean`                          | Metformin 500 mg, all green → approve → FHIR bundle                                                                                                        |
| `ord_smudged`                        | Strength **red** (readers split 850/500, OCR 41%), drug name yellow (look-alike), frequency yellow (days-supply mismatch). The call confirms 500 mg. |
| `ord_controlled`                     | Oxycodone CII with refills → red; DEA checksum fails → red                                                                                                 |
| `ord_processing`                     | Still being read                                                                                                                                           |
| `ord_lisinopril`, `ord_atorvastatin` | Ready, so bulk approve is available                                                                                                                        |

The fax pages are SVGs generated in `mocks/fax.ts`. That layout is also the source of every
evidence bbox, so overlays and crops line up by construction.

## How it's put together

```
app/(console)/      layout (nav, header, live pill), queue/, orders/[id]/, metrics/ (each with error.tsx)
components/
  fax/              FaxViewer (zoom/pan = one CSS transform), BoxOverlay (percent-positioned), Crop (canvas)
  fields/           FieldPanel, FieldRow, FieldDrawer, TriageBadge
  call/             CallPanel (confirm → stepper → transcript → result), Transcript, CallResult
  order/            OrderReview (page logic + hotkeys), ApproveBar, FhirModal, SafetyBanner
  queue/  metrics/  shell/  ui/
lib/
  api/              types.ts (contract mirror), schemas.ts (zod + compile-time drift guards), client.ts, hooks.ts, keys.ts
  realtime.ts       WebSocket with 1→30 s backoff; patches query caches in place; poll fallback
  order.ts          pure domain logic shared by the UI and the mock server (majority read, resolution, recount, sort)
  geometry.ts       bbox → CSS %, crop rects   keyboard.ts  hotkeys   format.ts
mocks/              MSW handlers, in-memory db with timed call lifecycle, ws link, fixtures
```

Performance notes:

- One cached queue list, filtered on the client. Tab switches are instant, and socket events patch the list in place instead of refetching.
- Rows, field rows and the overlay layer are memoized. Panning re-renders only the transform, and hovering re-renders two rows.
- Hovering a queue row prefetches that order, so opening it is instant.
- Recharts loads in its own chunk on the metrics route only. Mock code is dynamically imported, so live builds never ship it.
- Optimistic resolve/accept, with rollback and a toast on error.
