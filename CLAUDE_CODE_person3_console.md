# CLAUDE CODE BRIEF — Person 3 / Workstream A: Pharmacist Review Console (`web/`)

> Paste this whole file into Claude Code as the task brief, or save it as `web/CLAUDE.md`.
> A parallel Codex agent is building the backend half of Person 3's scope (`CODEX_person3_backend.md`).
> **You and Codex share only the API contract in §4. You never edit each other's directories.**

---

## 1. Context (read once, then build)

**Product: ClearScript** (Get Hired Hack @ Columbia Startup Lab, PillSpark track "Fax to Fill").

Pharmacies receive prescriptions as blurry faxes that technicians retype by hand. ClearScript turns a faxed prescription into a structured, verified order: patient, drug, dose, directions, prescriber. It **flags uncertain fields for a pharmacist instead of guessing.**

The backend works like this:

- **OCR/image-tested extraction:** candidate fields come from the OpenAPI contract and OCR/image reads, with Prism traces for the agent decisions.
- **Normalization against real registries:** RxNorm, the NPI Registry, a DEA checksum, and a structured sig.
- **Order-level safety rules.**
- **A calibrated confidence per field**, triaged as `green | yellow | red`, each with a plain-English reason.

**Your job:** the console the pharmacist uses, which is also the thing the hiring founder watches in the demo. It must answer one question per field: **"Do I trust this, and why?"**

**What wins:**

1. Every value is visibly tied to the pixels it came from.
2. Uncertainty is obvious and explained.
3. Resolving a flag takes seconds.
4. The "Call prescriber" voice loop feels magical but safe.
5. The metrics page proves the system beats a naive pipeline.

**Team layout** (other people's code, do not edit):

| Person | Owns |
|---|---|
| Person 1 | Core API service, `core/schema.py`, ingest, extraction, tracing |
| Person 2 | Verification, confidence scoring, benchmark, `metrics.json` |
| Person 3 (us) | **Workstream A (you):** `web/` · **Workstream B (Codex):** call backend, FHIR output, demo seed, contract tests |

---

## 2. Ownership rules (hard)

- You own **only** `web/**`, plus `contracts/types.ts` (a mirror of §4) if the repo has a `contracts/` dir.
- Never edit `api/`, `pipeline/`, `integrations/`, `core/`, `benchmark/`, or `scripts/`. If you need a backend change, write it in `web/BACKEND_REQUESTS.md` and keep going against mocks.
- Work on branch `p3/web` (a git worktree is fine). Make small commits with conventional messages (`feat(web): order review drawer`).
- **Build against mocks first (MSW).** The real backend may not exist yet. Switch with `NEXT_PUBLIC_API_MODE=mock|live`.
- Don't invent fields outside §4. If you need one, mark it optional and log it in `BACKEND_REQUESTS.md`.

---

## 3. Stack and setup

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript `strict` | `web/` is its own package |
| Styling | Tailwind CSS v4 + CSS variables for design tokens | Read the `frontend-design` guidance if available |
| Components | shadcn/ui (Radix primitives) | Dialog, Sheet (drawer), Tooltip, Tabs, Toast |
| Server state | TanStack Query v5 | Poll fallback when WebSocket is down |
| Realtime | Native WebSocket hook → invalidates queries | `/ws/orders` |
| Mocks | MSW v2 (browser + node for tests) | Fixtures in `web/mocks/fixtures/` |
| Charts | Recharts | Metrics page |
| Validation | zod schemas mirroring §4 | Parse every response, fail loudly in dev |
| Tests | Vitest + Testing Library (unit), Playwright (e2e) | E2E runs against mocks in CI |
| Lint | ESLint + Prettier, `tsc --noEmit` in CI | |

**Reuse from the earlier repo** (`AdishPadalia26/AI-Agent-for-Healthcare-Licensing-and-Credentialing`):

- `frontend/src/lib/s3.ts` and `frontend/src/app/api/upload/route.ts`: presigned S3 upload pattern. Use it only if the backend asks for direct-to-S3 upload; the default is `POST /faxes` multipart.
- `frontend/src/app/(user)/upload/page.tsx`: the `react-pdf` dynamic import with `ssr:false` pattern. Use it only if you render PDFs. Pages arrive as PNGs, so a plain `<img>` usually suffices.
- **Do not** copy the auth, history or admin pages.

**Env (`web/.env.example`):**

```
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/orders
NEXT_PUBLIC_API_MODE=mock        # mock | live
NEXT_PUBLIC_PHARMACY_NAME=Main Street Pharmacy
```

**Scripts:** `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `mock:dev` (dev with MSW forced on).

---

## 4. The API contract (shared with Codex and Person 1 — do not change unilaterally)

### 4.1 Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/faxes` | multipart `file` (pdf, tiff, png) | `{fax_id, order_ids: string[]}` (processing continues async) |
| GET | `/orders?status=` | — | `OrderSummary[]` |
| GET | `/orders/{order_id}` | — | `Order` |
| GET | `/faxes/{fax_id}/pages/{n}.png` | — | original page image (1-indexed) |
| POST | `/orders/{order_id}/fields/{field_name}/resolve` | `{action: "accept" \| "edit", value?: string}` | `Order` |
| POST | `/orders/{order_id}/fields/{field_name}/call` | `{}` | `Call` (status `queued`) |
| GET | `/calls/{call_id}` | — | `Call` |
| POST | `/calls/{call_id}/decision` | `{decision: "accept" \| "reject"}` | `Order` |
| POST | `/orders/{order_id}/approve` | `{}` | `{order: Order, fhir: object}`, or **409** `{error: "red_fields", fields: string[]}` |
| POST | `/orders/{order_id}/reject` | `{reason: string}` | `Order` |
| GET | `/orders/{order_id}/fhir` | — | FHIR R4 Bundle (only when approved) |
| GET | `/metrics` | — | `Metrics` |
| WS | `/ws/orders` | — | stream of `WsEvent` |

`field_name` is dotted, e.g. `drug.strength`, and must be URL-encoded in paths.

### 4.2 Types (put in `web/lib/api/types.ts` with matching zod schemas in `web/lib/api/schemas.ts`)

```ts
export type Triage = "green" | "yellow" | "red";
export type OrderStatus = "processing" | "needs_review" | "blocked" | "ready" | "approved" | "rejected";
export type ReadSource = "model_a" | "model_b" | "model_c" | "ocr" | "pharmacist" | "prescriber_call";

export interface Evidence {
  page: number;                                  // 1-indexed
  bbox: [number, number, number, number];        // x0,y0,x1,y1 normalized 0..1 of the ORIGINAL page
  text_seen: string;
}

export interface Read {
  source: ReadSource;
  model?: string | null;                         // e.g. "claude-…", shown in drawer
  value: string | null;
  evidence: Evidence | null;
  ocr_confidence: number | null;                 // 0..100, OCR source only
  crop_url?: string | null;                      // optional server-made crop; else crop client-side
  call_id?: string | null;                       // for prescriber_call reads
}

export interface Check {
  rule: string;                                  // "dose_range", "lasa", "dea_checksum", …
  result: "pass" | "warn" | "fail";
  severity: "red" | "yellow" | "info";
  fields: string[];
  reason: string;                                // plain English, show verbatim
}

export interface Field {
  name: string;                                  // "drug.strength"
  label: string;                                 // "Strength"
  value: string | null;
  normalized: Record<string, unknown> | null;    // e.g. {rxcui:"860975", unit:"mg"}
  reads: Read[];
  checks: Check[];
  confidence: number;                            // 0..1 calibrated
  triage: Triage;
  reasons: string[];                             // ordered, first is most important
  risk: "high" | "normal";
  resolution: null | { by: "pharmacist" | "prescriber_call"; action: "accept" | "edit"; at: string; user?: string };
}

export type Group = "patient" | "drug" | "sig" | "prescriber" | "meta";

export interface SafetyNotice { title: string; url: string; source: string; date?: string }

export interface Order {
  order_id: string;
  fax_id: string;
  page: number;                                  // page of the fax this order lives on
  page_count: number;
  received_at: string;                           // ISO
  status: OrderStatus;
  fields: Record<Group, Record<string, Field>>;  // fields.drug["drug.strength"]
  counts: { red: number; yellow: number; green: number };
  trace_url: string | null;                      // Block Convey trace
  safety_notices: SafetyNotice[];                // Tavily
  active_call_id: string | null;
  audit: { at: string; actor: string; action: string; field?: string; detail?: string }[];
}

export interface OrderSummary {
  order_id: string; fax_id: string; received_at: string; status: OrderStatus;
  patient_initials: string | null; drug_display: string | null; prescriber_display: string | null;
  counts: { red: number; yellow: number; green: number };
  has_high_risk_flag: boolean;
}

export type CallStatus = "queued" | "dialing" | "in_progress" | "completed" | "no_answer" | "failed";
export interface Call {
  call_id: string; order_id: string; field_name: string;
  status: CallStatus;
  to_number: string;                             // masked in UI except last 4
  number_source: { kind: "fax_header" | "npi_registry" | "tavily"; detail: string; agreement: boolean };
  question: string;                              // exactly what the agent will ask
  transcript: { role: "agent" | "office"; text: string; t: number }[];
  result: null | {
    outcome: "confirmed" | "unclear" | "refused";
    confirmed_value: string | null;
    confirmed_by: string | null;                 // e.g. "Maria, front desk"
    notes: string | null;
  };
  decision: null | "accept" | "reject";
  started_at: string | null; ended_at: string | null;
  error: string | null;
}

export interface Metrics {
  split: "held_out";
  n_faxes: number; n_fields: number;
  systems: {
    name: "clearscript" | "naive" | string;      // ablations: "no_ensemble","no_ocr","no_registry","no_rules"
    silent_error_rate: number; field_accuracy: number; flag_rate: number;
    flag_precision: number; trap_catch_rate: number; ece: number;
    cost_per_fax_usd: number; p50_latency_s: number;
  }[];
  tradeoff: { threshold: number; flag_rate: number; silent_error_rate: number }[];
  reliability: { bin_mid: number; accuracy: number; count: number }[];
  generated_at: string;
}

export type WsEvent =
  | { type: "order.created" | "order.updated"; order: OrderSummary }
  | { type: "call.updated"; call: Call };
```

---

## 5. Design direction

This is a **clinical instrument**, not a SaaS landing page. The model to copy is a calm, dense, keyboard-first tool like Linear or an EHR done right.

- **Layout:** full-height app shell. Narrow left nav (Queue, Metrics). Content fills the rest. No marketing hero.
- **Type:** one neutral sans (Inter or IBM Plex Sans) for UI, plus a tabular monospace (IBM Plex Mono) for values, NPIs, DEAs and doses. Mixing them signals "data vs label."
- **Triage colors as tokens:** `--triage-red`, `--triage-yellow`, `--triage-green`, each with a `-bg` tint. **Always paired with text and an icon** (red = "Blocks approval", yellow = "Check", green = "Verified"). Color is never the only signal (WCAG 1.4.1).
- **Density:** 13–14 px base in data panes. Generous hit targets on actions (≥ 36 px).
- **Motion:** only to show cause and effect (a field resolving, a box highlighting). 150–200 ms. Respect `prefers-reduced-motion`.
- **Light and dark themes** via tokens. Design light first; the demo room may be bright.
- **Empty, loading and error states** for every screen. A skeleton for the order page. An inline retry on failed actions.
- **Never show a value without its provenance** one hover or click away.

---

## 6. Build plan (in order; each step ends with its acceptance check)

### Step 0 — Scaffold

- [ ] `create-next-app` in `web/` (TS, App Router, Tailwind, ESLint). Add shadcn/ui, TanStack Query, zod, MSW, Recharts, Vitest, Playwright.
- [ ] `lib/api/{types.ts, schemas.ts, client.ts}`. `client.ts` = a typed fetch wrapper that zod-parses responses, normalizes errors into `ApiError {status, code, message, details}`, and URL-encodes `field_name`.
- [ ] `lib/api/hooks.ts`: `useOrders(status)`, `useOrder(id)`, `useResolveField()`, `useStartCall()`, `useCall(id)`, `useCallDecision()`, `useApprove()`, `useReject()`, `useMetrics()`, `useUploadFax()`.
- [ ] `lib/realtime.ts`: `useOrdersSocket()` connects, backs off exponentially (1 s → 30 s), invalidates `["orders"]` and `["order", id]` on events, and updates `["call", id]` from `call.updated`. While disconnected, TanStack polls every 3 s, and a small "Live / Reconnecting" pill shows in the header.
- **Accept:** `pnpm typecheck && pnpm lint && pnpm test` green. App boots in mock mode.

### Step 1 — Mocks that tell the demo story (`web/mocks/`)

- [ ] `handlers.ts` covers **every** §4 endpoint with realistic latency (200–600 ms).
- [ ] Fixtures in `mocks/fixtures/`. Generate fax page PNGs with a canvas or use placeholders; keep the bboxes consistent with them.
  - `order-clean.json`: all green, metformin 500 mg.
  - `order-smudged.json`: `drug.strength` red ("2 of 3 model reads saw 850 mg, 1 saw 500 mg; OCR confidence 41%"), `drug.name` yellow (look-alike), `sig.frequency` yellow (days-supply mismatch).
  - `order-controlled.json`: Schedule II with refills → red, DEA checksum fail → red.
  - `order-processing.json`.
- [ ] The mock call simulates the lifecycle on timers: `queued → dialing (1 s) → in_progress (2 s, transcript lines streamed every ~1.5 s) → completed` with `result.outcome="confirmed", confirmed_value="500 mg"`. Emit `call.updated` through a mock WebSocket (an MSW `ws` handler).
- [ ] Mock resolve, decision and approve mutate in-memory state and recompute `counts` and `status`, so the UI flow is fully clickable.
- **Accept:** you can run the whole demo story end to end in mock mode with no backend.

### Step 2 — App shell + Queue (`app/(console)/queue/page.tsx`)

- [ ] Header: pharmacy name, live status pill, **Upload fax** button.
- [ ] Table columns: Received (relative time) · Patient (initials) · Drug · Prescriber · Flags (red count + yellow count chips) · Status.
- [ ] Default sort: `blocked`, then `needs_review`, then `ready`, then `processing`, then by age. Status filter tabs: All · Blocked · Needs review · Ready · Approved.
- [ ] Row click opens the order. Keyboard: ↑/↓ moves, Enter opens.
- [ ] **Upload:** a drag-and-drop dialog. Accept PDF, TIFF, PNG ≤ 20 MB. Show progress, and on success show the new order in the `processing` state.
- [ ] **Bulk approve:** a checkbox column enabled only for `ready` orders with `has_high_risk_flag=false`. Confirm dialog shows the count.
- **Accept:** a new order appears via WebSocket without a refresh; filters and sort work; an e2e test covers upload → appears in queue.

### Step 3 — Order review (the core screen, `app/(console)/orders/[id]/page.tsx`)

**Layout:** split pane, resizable, about 55 / 45. The fax is on the left, fields on the right. On narrow screens, stack with the fax collapsible.

**Left: `FaxViewer`**

- [ ] Render the original page `<img>` inside a zoom/pan container (wheel and pinch zoom, drag pan, Fit / 100% buttons).
- [ ] Overlay layer: absolutely positioned `<div>`s using **percentages from normalized bbox**, so overlays survive any zoom with no math drift.
- [ ] Hovering or focusing a field shows its majority read's box (triage-colored outline + label). Clicking a box focuses its field on the right.
- [ ] Toggle "Show all boxes" (shortcut `B`).

**Right: `FieldPanel`**

- [ ] Sections in order: Drug, Directions, Patient, Prescriber, Meta. Drug comes first because it's highest risk.
- [ ] Each `FieldRow` shows:
  - label
  - value in mono (or "—" and "Unreadable" if null)
  - triage badge (icon + word)
  - the **first reason** inline
  - confidence as a small bar with the % on hover
  - a "Resolved by pharmacist" or "Confirmed by office" tag when resolved
- [ ] Top summary bar: "2 blocking · 1 to check · 14 verified", plus **Next flag** (`J`) and **Previous flag** (`K`).
- [ ] Safety notices (Tavily) as a dismissible info banner with links. "View trace" opens `trace_url` in a new tab (Block Convey).

**`FieldDrawer`** (a Sheet that opens on click or Enter):

- [ ] **Reads table:** one row per read. Columns: source (Model A/B/C with model name, OCR, Pharmacist, Prescriber call) · value · **image crop** · OCR confidence. Values that disagree with the majority are highlighted.
- [ ] Crops: use `crop_url` if present, otherwise crop client-side by drawing the bbox region of the page image onto a `<canvas>` with 8% padding. This side-by-side crop view is the demo's money shot; make it crisp.
- [ ] **Checks list:** each check with result icon, severity and verbatim reason.
- [ ] Normalized details, e.g. RxCUI with a link to `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=<rxcui>`, and NPI with a link to the NPPES record.
- [ ] **Actions:**
  - **Accept** (`Enter`)
  - **Edit** (`E`): inline input, value-type hints (strength suggests units)
  - **Call prescriber** (`C`): only for yellow or red fields, and only when no call is active on the order

**Approve / Reject bar** (sticky bottom):

- [ ] Approve is disabled with a tooltip listing the blocking fields while `counts.red > 0`. On click, show a confirm dialog with a compact order summary.
- [ ] On success, show a toast and a modal with **FHIR JSON** (pretty-printed, copy and download buttons). Then move to the next order in the queue.
- [ ] If the server returns 409, show which fields are blocking and scroll to the first.
- [ ] Reject requires a reason (select + free text).

**Optimism:** resolve and accept update optimistically, roll back on error, toast the error.

- **Accept:**
  - Mouse-free flow works: J → Enter → J → E (type) → Enter → Approve (`⌘/Ctrl+Enter`).
  - Overlays align at 50%, 100% and 200% zoom.
  - e2e test: `order-smudged` → resolve strength → approve succeeds; before resolving, approve is blocked.

### Step 4 — Call prescriber panel (`components/call/CallPanel.tsx`)

This is the "magic but safe" moment; design it like a phone UI inside the drawer.

- [ ] **Pre-call confirm card (pharmacist must click Start call):**
  - Who we'll call: prescriber name + masked number `(•••) •••-1234`
  - Where the number came from: `number_source.kind` + detail, with a ✓ when sources agree or ⚠ when they don't
  - The **exact question** the agent will ask
  - A line: "Shares patient initials only. Call may be recorded."
- [ ] **Live state:** status stepper `Queued → Dialing → Connected → Done`. Live transcript as chat bubbles (agent left, office right), auto-scrolling. Elapsed timer. Cancel button if the backend supports it (add `POST /calls/{id}/cancel` to `BACKEND_REQUESTS.md` as optional).
- [ ] **Result card:**
  - outcome badge (Confirmed / Unclear / Refused)
  - `confirmed_value` large in mono, next to the original candidate values
  - `confirmed_by`
  - **Accept answer** and **Reject** buttons, both calling `/calls/{id}/decision`
  - A field turns green only after Accept.
- [ ] **Failure states:** `no_answer`, `failed` (show `error`), each with **Retry** and **Resolve manually**.
- [ ] A small "Call" chip on the order header while a call is active, so a pharmacist can leave and come back.
- **Accept:** the mock lifecycle plays smoothly; a reload mid-call restores state from `GET /calls/{id}`; an e2e test covers start → transcript → accept → field green.

### Step 5 — Metrics page (`app/(console)/metrics/page.tsx`)

Read the `dataviz` skill guidance before building charts if it is available.

- [ ] **Hero stat row:** silent error rate, ClearScript vs naive (the headline, biggest). Then trap catch rate, flag rate, cost per fax, p50 latency. Each tile shows the held-out N.
- [ ] **Tradeoff curve** (line): x = flag rate, y = silent error rate. Mark the chosen operating threshold with a dot and label. Plot the naive baseline as a single labeled point.
- [ ] **Reliability diagram:** predicted confidence vs actual accuracy, a diagonal reference line, and bar opacity by bin count. Show the ECE value in the corner.
- [ ] **Ablation table:** a row per system. The silent error rate column has an inline bar. Sorted by silent error.
- [ ] A footnote: "Synthetic benchmark, held-out split, generated <date>. Real-fax pilot pending."
- **Accept:** renders from the mock `metrics.json` (fabricate a plausible one in fixtures and **label it MOCK** in the UI when in mock mode); readable on a projector (min 14 px labels).

### Step 6 — Demo mode and polish

- [ ] A `?demo=1` query flag: hides dev chrome, enlarges type 10%, adds a subtle "Synthetic data" ribbon, and disables destructive admin bits.
- [ ] Keyboard shortcut help (`?` opens an overlay).
- [ ] Error boundary per route, plus an offline banner.
- [ ] Lighthouse a11y ≥ 95 on queue and order pages. Every interactive element is reachable by keyboard, with visible focus rings.
- [ ] Performance: the order page interactive in < 1 s on mock data; images lazy-load; no layout shift when overlays mount.

### Step 7 — Switch to live and integrate

- [ ] Run with `NEXT_PUBLIC_API_MODE=live` against Codex's and Person 1's backend. Fix zod parse failures by **reporting** them in `BACKEND_REQUESTS.md` (or loosening optional fields if the contract allows), never by deleting validation.
- [ ] Add a Playwright suite `e2e/live.spec.ts` gated by `E2E_LIVE=1`.
- [ ] Add a Dockerfile for `web/` (multi-stage, `next build` → `next start`, non-root user) so Person 1 can add it to `docker-compose.yml`.

---

## 7. File map you should end up with

```
web/
  app/
    (console)/layout.tsx           # shell, nav, header, live pill
    (console)/queue/page.tsx
    (console)/orders/[id]/page.tsx
    (console)/metrics/page.tsx
    providers.tsx                  # QueryClient, theme, MSW bootstrap
  components/
    fax/FaxViewer.tsx  fax/BoxOverlay.tsx  fax/Crop.tsx
    fields/FieldPanel.tsx  fields/FieldRow.tsx  fields/FieldDrawer.tsx  fields/TriageBadge.tsx
    call/CallPanel.tsx  call/Transcript.tsx  call/CallResult.tsx
    order/ApproveBar.tsx  order/FhirModal.tsx  order/SafetyBanner.tsx
    queue/QueueTable.tsx  queue/UploadDialog.tsx
    metrics/StatTiles.tsx  metrics/TradeoffChart.tsx  metrics/ReliabilityChart.tsx  metrics/AblationTable.tsx
    ui/…                           # shadcn
  lib/api/{types,schemas,client,hooks}.ts   lib/realtime.ts   lib/keyboard.ts   lib/format.ts
  mocks/{browser,server,handlers,ws}.ts   mocks/fixtures/*
  e2e/*.spec.ts   tests/*.test.tsx
  BACKEND_REQUESTS.md   README.md   Dockerfile   .env.example
```

## 8. Testing requirements

- **Unit (Vitest):**
  - `TriageBadge` text and icon per state
  - bbox → percent style math
  - crop math with padding and clamping at page edges
  - masked phone formatting
  - zod schemas reject malformed fixtures
  - keyboard hook
- **Component:** `FieldDrawer` highlights disagreeing reads; `ApproveBar` disabled logic; `CallPanel` renders each `CallStatus`.
- **E2E (Playwright, mock mode, runs in CI):**
  1. upload → appears in queue
  2. clean order → approve → FHIR modal
  3. smudged order: approve blocked → resolve via edit → approve
  4. call flow: start → transcript → accept → field green → approve
  5. metrics page renders all four blocks
- Coverage target: logic in `lib/` ≥ 80%.

## 9. Definition of done

- [ ] All of §6 is accepted in mock mode, and the full demo story plays without a backend.
- [ ] Live mode works against the real backend for: queue, review, resolve, approve, and one real call.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all green.
- [ ] `README.md` explains how to run in mock and live modes and lists the keyboard shortcuts.
- [ ] No PHI in `console.log`. No secrets in the client bundle.

## 10. Demo choreography this UI must support (Person 3 presents)

1. **Hook:** show a "naive output" card with the wrong strength. A static fixture on the metrics page is fine.
2. Person 1 drops the **clean fax**: everything is green, hover shows boxes, approve shows FHIR.
3. Person 2 drops the **smudged fax**: red strength, open the drawer, three crops side by side.
4. **You** click **Call prescriber**: confirm card, Start, a phone rings on stage, transcript streams, "500 mg", Accept, field goes green, Approve.
5. **You** open Metrics: silent error vs naive, then click "View trace" on the order you just approved.

If any step needs more than one click to reach, fix the UI.
