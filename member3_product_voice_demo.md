# Member 3 — Product, Voice Agent & Demo Lead

**Mission:** Build the thing the founder sees and touches: the pharmacist review console, the "Call prescriber" voice loop, the FHIR output, and the pitch. If it isn't visible in the demo, it didn't happen.

**You own:** `web/` (Next.js console), `integrations/elevenlabs.py` + the call endpoint, `pipeline/output/` (FHIR), the API contract, the pitch deck, and the demo run.

**Sponsors you integrate:** ElevenLabs (voice agent). You also surface Tavily, Block Convey and Nicrron in the UI and deck.

---

## 0. Unblock yourself first

- [ ] Write the **API contract** (endpoints below) in `api/CONTRACT.md` and agree it with Member 1.
- [ ] Build against Member 1's fixture-backed endpoints from the start. Don't wait for the real pipeline.
- [ ] Set up the Next.js app in `web/` (Next 15, Tailwind).
  - Reuse from the old repo: `frontend/src/lib/s3.ts`, `frontend/src/app/api/upload/route.ts` (presigned upload), and the `react-pdf` setup in `frontend/src/app/(user)/upload/page.tsx`.
  - Skip the old auth, history and admin pages.

**API contract**

```
POST /faxes                                   upload → {fax_id}
GET  /orders?status=needs_review|blocked|ready|approved
GET  /orders/{id}                             full PrescriptionOrder
GET  /faxes/{id}/pages/{n}.png                original page image
POST /orders/{id}/fields/{name}/resolve       {action: accept|edit, value?}
POST /orders/{id}/fields/{name}/call          → {call_id}
GET  /calls/{call_id}                         status, transcript, result
POST /orders/{id}/approve                     → FHIR bundle (409 if any red)
WS   /ws/orders                               live status updates
```

## 1. Queue screen — `web/app/queue`

- [ ] One row per order: received time, patient initials, drug, prescriber, red and yellow counts.
- [ ] Sort red first, then by age. Update live over WebSocket.
- [ ] Upload button (drag and drop a fax). It shows processing progress.
- [ ] Show a "Ready" badge on orders with no flags. Bulk approve is allowed only when no high-risk fields exist.

## 2. Order review screen (the core) — `web/app/orders/[id]`

- [ ] **Left:** the original fax image (zoom and pan), drawn on a canvas with bounding-box overlays.
- [ ] **Right:** fields grouped as Patient / Drug / Directions / Prescriber. Each row shows the value, a colored dot **and text** (never color alone), and the reason line.
- [ ] Hover a field to highlight its box on the image. Click a field to open the **drawer**:
  - each reader's value plus the image crop it read, side by side
  - the checks that touched the field
  - the confidence score
- [ ] Field actions: **Accept**, **Edit** (inline), **Call prescriber**.
- [ ] Badges: Tavily drug-safety notice, and "View trace" (Block Convey `trace_url`).
- [ ] **Approve** stays disabled while any red field remains.
- [ ] Keyboard: J/K to the next or previous flag, Enter to accept, E to edit.

## 3. ElevenLabs "Call prescriber" — `integrations/elevenlabs.py`

- [ ] Create an ElevenLabs agent scoped to one job: confirm specific prescription fields with a prescriber's office.
  - Never give medical advice.
  - Never accept changes to fields it wasn't asked about.
  - Use patient initials only, unless the office asks to verify identity.
- [ ] Connect a Twilio number in ElevenLabs.
- [ ] Endpoint `POST /orders/{id}/fields/{name}/call`:
  1. Get the number from Member 2's `lookup_callback(prescriber)` (fax header, NPI Registry, Tavily).
  2. Call `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call` with `agent_id`, `agent_phone_number_id`, `to_number`.
  3. Pass the question in `conversation_initiation_client_data.dynamic_variables`: `pharmacy_name`, `prescriber_name`, `patient_initials`, `drug`, `field_label`, `candidate_values`.
- [ ] When the call ends, fetch the transcript and the structured result (`confirmed_value`, `confirmed_by`) via webhook or by polling the conversation.
  - Save it as a `prescriber_call` Read on the field.
  - Call `retriage`.
  - The field turns green **only after the pharmacist clicks Accept**.
- [ ] **Call panel UI:** number + its source, the question, live status, transcript, and the structured answer with Accept / Reject.
- [ ] A pharmacist starts every call. Nothing dials automatically.

## 4. Output — `pipeline/output/`

- [ ] `to_fhir(order)` returns a FHIR R4 Bundle: `MedicationRequest` + `Patient` + `Practitioner` (RxNorm code in `medicationCodeableConcept`, structured `dosageInstruction` from the sig).
- [ ] CSV export row for pharmacy systems that import files.
- [ ] Approval writes an `AuditEvent` (approver, timestamp). Show the JSON in a modal after approving.

## 5. Metrics page — `web/app/metrics`

- [ ] Read Member 2's `metrics.json`: silent error rate vs naive baseline, trap catch rate, flag rate, accuracy, ECE, cost and latency per fax.
- [ ] Show the threshold tradeoff curve, the reliability diagram, and the ablation table.

## 6. Pitch and demo (you run it)

- [ ] **Deck, 6–8 slides:**
  1. Problem: confident wrong orders
  2. Live demo
  3. How it works: architecture with the 4 sponsor services labeled
  4. The number: silent errors vs naive
  5. Business: wedge, per-fax pricing, the correction-data moat
  6. Ask: shadow-mode pilot
- [ ] **Demo runbook:**
  - pre-processed results for every demo fax
  - a phone to play the prescriber's office
  - a **pre-recorded backup video** of the full flow
  - a backup browser-based ElevenLabs session if phone signal fails
- [ ] Run 2 full rehearsals with all three of us.

**Script (5 minutes)**

| # | Who | What |
|---|---|---|
| 1 | You (30 s) | Hook: the naive pipeline confidently ships the wrong strength |
| 2 | Member 1 (45 s) | Clean fax → all green, traceable to its box → approve → FHIR |
| 3 | Member 2 (75 s) | Smudged fax → strength red with reasons, look-alike flag, crops in the drawer |
| 4 | You (75 s) | Call prescriber → phone rings on stage → "500" → transcript lands → accept → approve |
| 5 | You (45 s) | Metrics slide + open the Block Convey trace |
| 6 | Member 1 (30 s) | Close: shadow-mode pilot next week |

---

## Interfaces

| You give | To | Shape |
|---|---|---|
| API contract | Member 1 | `api/CONTRACT.md` |
| `to_fhir(order)` | Member 1 (approve endpoint) | FHIR Bundle dict |
| Call results as `prescriber_call` Reads | Member 2 (`retriage`) | `Read` |
| Deck + demo runbook | Everyone | Slides + `DEMO.md` |

| You need | From |
|---|---|
| Fixture endpoints, then real orders + page images + `trace_url` | Member 1 |
| `lookup_callback`, `retriage`, `metrics.json`, demo faxes | Member 2 |

## Definition of done

- [ ] A pharmacist can go from queue → review → resolve every flag → approve, without touching code.
- [ ] One live outbound call completes and writes its answer back to the field.
- [ ] The FHIR output validates against the R4 schema.
- [ ] The demo runs end to end twice in a row without help, and the backup video is recorded.

## Fallbacks

- If Twilio or phone signal fails, use the browser ElevenLabs session, or the recorded call clip.
- If canvas overlays fight you, show crops in the drawer only and put a simple highlighted rectangle on an `<img>`.
