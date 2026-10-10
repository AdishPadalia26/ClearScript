# CODEX BRIEF — Person 3 / Workstream B: Prescriber Call Loop, FHIR Output, Contracts & Demo Backend

> Give this whole file to Codex as the task brief, or save it as `AGENTS.md` in the backend workstream root.
> A parallel Claude Code agent is building the web console (`CLAUDE_CODE_person3_console.md`) against the **same API contract (§4)**.
> **You never edit `web/`. Claude Code never edits your directories.** The contract is the only shared surface.

---

## 1. Context

**Product: ClearScript** (Get Hired Hack @ Columbia Startup Lab, PillSpark track "Fax to Fill").

ClearScript turns faxed prescription images into structured, verified orders. It uses the OpenAPI contract plus OCR/image extraction, grounds uncertain fields with agent web searches and Prism traces, normalizes against RxNorm, the NPI Registry and a DEA checksum, runs safety rules, and triages each field as `green | yellow | red` with a calibrated confidence. **It never guesses.** Uncertain fields go to a pharmacist.

**Your workstream closes the loop and produces the output:**

1. **Prescriber clarification calls.** A pharmacist clicks "Call prescriber" on a flagged field. An ElevenLabs voice agent calls the prescriber's office, asks one precise question, and returns a structured answer that becomes evidence on the field. A pharmacist must accept it before it counts.
2. **FHIR R4 output.** On approval, emit a standards-correct Bundle (`MedicationRequest`, `Patient`, `Practitioner`, `Provenance`, `DocumentReference`) plus a flat CSV row.
3. **Contract and contract tests.** An OpenAPI spec for the whole §4 surface and tests that keep Person 1's API, your routes and the web app in agreement.
4. **Demo backend.** A deterministic seed, a simulated call provider for stage safety, and the `DEMO.md` runbook.

**Team layout** (do not edit their code; depend on their interfaces via ports, §5):

| Person | Owns |
|---|---|
| Person 1 | `api/` app and DB setup, `core/schema.py`, ingest, extraction, tracing (OpenTelemetry → Block Convey) |
| Person 2 | `pipeline/normalize|verify|triage`, `integrations/tavily.py`, `benchmark/`, `retriage()`, `lookup_callback()` |
| Person 3A (Claude Code) | `web/` |
| **Person 3B (you)** | everything in §2 |

---

## 2. Ownership (hard rules)

**You own (create freely):**

```
services/calls/**                 # call domain: state machine, service, providers, ports
integrations/elevenlabs.py        # thin HTTP client
agents/elevenlabs/**              # agent config JSON + system prompt, versioned
pipeline/output/**                # FHIR + CSV builders
api/routes/calls.py               # call endpoints + ElevenLabs webhook
api/routes/output.py              # approve/reject/fhir endpoints (if Person 1 hasn't built them; coordinate)
contracts/**                      # openapi.yaml, ws-events.schema.json, fixtures for contract tests
tests/p3/**  tests/contract/**
scripts/seed_demo.py  scripts/check_contract.py
DEMO.md
```

**You may touch, minimally:** `api/main.py`, only to `include_router(...)` your routers (one line each, in a separate commit titled `chore(api): mount p3 routers`).

**Never touch:** `web/`, `core/schema.py` (propose changes in `contracts/SCHEMA_REQUESTS.md`), `pipeline/{ingest,preprocess,extract,normalize,verify,triage}`, or `benchmark/`.

**Git:** work on branch `p3/backend` (worktree OK). Use conventional commits. Every PR must pass the commands in §10.

---

## 3. Stack

| Concern | Choice |
|---|---|
| Language | Python 3.11+, fully typed, `mypy --strict` on your packages |
| Web | FastAPI routers (mounted into Person 1's app), Pydantic v2 |
| HTTP | `httpx.AsyncClient` with timeouts and retries via `tenacity` (exponential backoff, jitter, retry only on 429/5xx/timeouts) |
| Persistence | SQLModel on Person 1's engine. Your own table `calls` in `services/calls/models.py`, with a migration if Person 1 uses Alembic |
| FHIR | `fhir.resources` **R4B module** (`from fhir.resources.R4B.medicationrequest import MedicationRequest`). The library defaults to R5 from v7; the US pharmacy ecosystem is R4 |
| Background | `asyncio` tasks plus a polling reconciler (no Celery needed for v1) |
| Tests | pytest, pytest-asyncio, `respx` (HTTP mocks), `freezegun`, `hypothesis` (state machine), `schemathesis` (contract fuzzing) |
| Lint | ruff (lint + format), mypy |

**Env (`.env.example` additions, documented in your README section):**

```
CALL_PROVIDER=simulated              # simulated | elevenlabs
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_PHONE_NUMBER_ID=          # agent_phone_number_id for the Twilio number imported into ElevenLabs
ELEVENLABS_WEBHOOK_SECRET=
ELEVENLABS_BASE_URL=https://api.elevenlabs.io
CALL_ALLOWED_HOURS=08:00-18:00       # prescriber office local time
CALL_MAX_ATTEMPTS_PER_FIELD=2
CALL_DEMO_TO_NUMBER=                 # if set, ALL calls go here (stage phone); never dial real offices in demo
PHARMACY_NAME=Main Street Pharmacy
PHARMACY_CALLBACK_NUMBER=
```

---

## 4. The API contract (shared — must match `CLAUDE_CODE_person3_console.md` §4 exactly)

### 4.1 Endpoints

| Method | Path | Body | Returns | Owner |
|---|---|---|---|---|
| POST | `/faxes` | multipart `file` | `{fax_id, order_ids}` | P1 |
| GET | `/orders?status=` | — | `OrderSummary[]` | P1 |
| GET | `/orders/{order_id}` | — | `Order` | P1 |
| GET | `/faxes/{fax_id}/pages/{n}.png` | — | image | P1 |
| POST | `/orders/{order_id}/fields/{field_name}/resolve` | `{action, value?}` | `Order` | P1 |
| **POST** | `/orders/{order_id}/fields/{field_name}/call` | `{}` | `Call` | **You** |
| **GET** | `/calls/{call_id}` | — | `Call` | **You** |
| **POST** | `/calls/{call_id}/decision` | `{decision: accept\|reject}` | `Order` | **You** |
| **POST** | `/calls/{call_id}/cancel` | `{}` | `Call` | **You** (optional) |
| **POST** | `/webhooks/elevenlabs` | ElevenLabs post-call payload | `204` | **You** |
| **POST** | `/orders/{order_id}/approve` | `{}` | `{order, fhir}` or **409** `{error:"red_fields", fields}` | **You** (unless P1 built it) |
| **POST** | `/orders/{order_id}/reject` | `{reason}` | `Order` | **You** (same) |
| **GET** | `/orders/{order_id}/fhir` | — | FHIR Bundle | **You** |
| **GET** | `/orders/{order_id}/export.csv` | — | CSV | **You** |
| GET | `/metrics` | — | `Metrics` (serves Person 2's `metrics.json`) | P1/P2 |
| WS | `/ws/orders` | — | `WsEvent` | P1 (you **publish** `call.updated` through P1's broadcaster port) |

### 4.2 Your models (Pydantic, `services/calls/schemas.py`). Field names are identical to the TS contract.

```python
CallStatus = Literal["queued", "dialing", "in_progress", "completed", "no_answer", "failed"]

class NumberSource(BaseModel):
    kind: Literal["fax_header", "npi_registry", "tavily"]
    detail: str
    agreement: bool                      # do ≥2 sources agree on this number?

class TranscriptTurn(BaseModel):
    role: Literal["agent", "office"]
    text: str
    t: float                             # seconds from call start

class CallResult(BaseModel):
    outcome: Literal["confirmed", "unclear", "refused"]
    confirmed_value: str | None          # normalized, e.g. "500 mg"
    confirmed_by: str | None             # "Maria, front desk"
    notes: str | None

class Call(BaseModel):
    call_id: str
    order_id: str
    field_name: str                      # dotted, e.g. "drug.strength"
    status: CallStatus
    to_number: str                       # E.164; UI masks it
    number_source: NumberSource
    question: str                        # exactly what the agent asks
    transcript: list[TranscriptTurn]
    result: CallResult | None
    decision: Literal["accept", "reject"] | None
    started_at: datetime | None
    ended_at: datetime | None
    error: str | None
```

The WebSocket event you publish: `{"type": "call.updated", "call": <Call>}` on **every** state or transcript change.

---

## 5. Architecture: ports and adapters (so you are never blocked)

Persons 1 and 2 may not have shipped yet. Code against **ports** (Python `Protocol`s) in `services/calls/ports.py`, with in-memory stub adapters, and swap in the real ones at integration.

```python
class OrderRepo(Protocol):
    async def get(self, order_id: str) -> PrescriptionOrder: ...
    async def save(self, order: PrescriptionOrder) -> None: ...
    async def append_audit(self, order_id: str, event: AuditEvent) -> None: ...

class Triage(Protocol):                       # Person 2
    def retriage(self, order: PrescriptionOrder, field_name: str) -> PrescriptionOrder: ...

class CallbackLookup(Protocol):               # Person 2 (fax header + NPI Registry + Tavily)
    async def lookup(self, prescriber: dict) -> NumberSource_with_number: ...

class Broadcaster(Protocol):                  # Person 1's websocket hub
    async def publish(self, event: dict) -> None: ...

class CallProvider(Protocol):                 # yours: ElevenLabs or Simulated
    async def start(self, req: CallRequest) -> ProviderHandle: ...        # returns conversation_id / callSid
    async def fetch(self, handle: ProviderHandle) -> ProviderSnapshot: ... # status, transcript, analysis
    async def cancel(self, handle: ProviderHandle) -> None: ...
```

- `services/calls/adapters/stubs.py` holds in-memory `OrderRepo`, `Triage` (sets green when a pharmacist accepts), `CallbackLookup` (returns `CALL_DEMO_TO_NUMBER`), and `Broadcaster` (records events for tests).
- `services/calls/wiring.py` is one function `build_call_service(settings)` that picks real or stub adapters by import availability or settings. **That is the only file that changes at integration.**

```
services/calls/
  schemas.py   models.py (SQLModel table)   ports.py   state.py (state machine)
  questions.py (question builder)   normalize_answer.py   guards.py (safety policy)
  service.py (orchestrator)   reconciler.py (poller)   wiring.py
  providers/elevenlabs.py   providers/simulated.py
  adapters/stubs.py
```

---

## 6. Build plan (in order; each step ends with its acceptance check)

### Step 0 — Contract first (unblocks Claude Code and Person 1)

- [ ] `contracts/openapi.yaml`: hand-written OpenAPI 3.1 for **all** of §4.1, with component schemas for `Order`, `OrderSummary`, `Field`, `Read`, `Evidence`, `Check`, `Call`, `Metrics` (mirroring the TS types in the console brief verbatim).
- [ ] `contracts/ws-events.schema.json`: JSON Schema for `WsEvent`.
- [ ] `contracts/fixtures/*.json`: `order-clean`, `order-smudged`, `order-controlled`, `call-completed-confirmed`, `call-no-answer`. Each must validate against the schema. Claude Code mirrors these in MSW.
- [ ] `scripts/check_contract.py`: diff the running FastAPI `app.openapi()` against `contracts/openapi.yaml` for paths and response schemas. Exit non-zero on drift.
- **Accept:** `python scripts/check_contract.py --spec-only` validates every fixture against the spec. Commit and tell the team the contract is frozen; changes need a PR reviewed by P1 and P3A.

### Step 1 — Call domain model + state machine (`state.py`, `models.py`)

Legal transitions (anything else raises `IllegalTransition`):

```
queued ──► dialing ──► in_progress ──► completed
   │          │             │
   │          ├──► no_answer │
   └──────────┴──────────────┴──► failed
(cancel allowed from queued|dialing|in_progress → failed, error="cancelled")
decision: only when status == completed and decision is None
```

- [ ] `calls` table columns: `call_id` (uuid4 str), `order_id`, `field_name`, `status`, `provider`, `provider_conversation_id`, `provider_call_sid`, `to_number`, `number_source` (JSON), `question`, `transcript` (JSON), `result` (JSON), `decision`, `attempt` (int), `created_at`, `started_at`, `ended_at`, `error`, `idempotency_key` (unique: `order_id:field_name:attempt`).
- [ ] Every transition writes an `AuditEvent` on the order (`call.queued`, `call.dialing`, `call.completed`, `call.decision.accept`, …) and publishes `call.updated`.
- [ ] **Hypothesis test:** random sequences of events never reach an illegal state, terminal states are absorbing, and `decision` is only ever set once.
- **Accept:** `pytest tests/p3/test_state.py` green, including property tests.

### Step 2 — Safety guards (`guards.py`). This is the research and compliance core, so test it hard.

`assert_can_call(order, field, now) -> None | raises CallRefused(code, message)`. Codes:

| Code | Rule |
|---|---|
| `field_not_flagged` | Field triage must be `yellow` or `red`; never call about green fields |
| `call_active` | Only one active call per **order** |
| `max_attempts` | ≤ `CALL_MAX_ATTEMPTS_PER_FIELD` per field |
| `outside_hours` | Office local time within `CALL_ALLOWED_HOURS`. Derive the timezone from the prescriber's state (NPI address); default America/New_York |
| `no_number` | `CallbackLookup` returned nothing |
| `number_disagreement` | Sources disagree **and** the field is high-risk → still allowed, but `number_source.agreement=false` is surfaced and the UI shows a warning (not a refusal). Document this choice |
| `approved` | Order already approved or rejected |

Routes map `CallRefused` to **422** `{error: code, message}`.

**Minimum-necessary PHI (HIPAA):** the question builder may use only patient **initials** and the drug. Full name and DOB are passed as hidden variables the agent may reveal **only if the office asks to verify identity** (instructed in the agent prompt). Log nothing patient-identifying; redact `to_number` to the last 4 in logs.

**Recording disclosure:** the agent's first message must state the call may be recorded (two-party-consent states). Assert this in a test against `agents/elevenlabs/agent.json`.

- **Accept:** a table-driven test covers every code; a test checks the question never contains the patient's full name or DOB.

### Step 3 — Question builder (`questions.py`)

Produce one precise, closed question per field type, listing candidate values from the disagreeing reads (most-voted first, max 3):

| Field | Template |
|---|---|
| `drug.strength` | "Can you confirm the strength of {drug} — is it {c1} or {c2}?" |
| `drug.name` | "Can you confirm the medication name? We read {c1}, but want to make sure it isn't {c2}." |
| `drug.quantity` | "Can you confirm the quantity to dispense for the {drug}?" |
| `sig.*` | "Can you confirm the directions for the {drug}? We have: {sig_raw}." |
| `drug.refills` | "How many refills were authorized for the {drug}?" |
| `prescriber.dea` | "Can you read me the prescriber's DEA number for this prescription?" |
| default | "Can you confirm the {label} on this prescription? We read {c1}." |

Spell out ambiguous numerals in the spoken form ("five hundred milligrams") to avoid TTS misreads. Store both a `display` and a `spoken` version; the API returns `display`.

- **Accept:** snapshot tests for each template; candidate ordering is deterministic.

### Step 4 — ElevenLabs agent definition (`agents/elevenlabs/`)

- [ ] `agent.json`: a versioned config (name, first message, system prompt, language, voice, data collection, evaluation criteria). Create the agent in the dashboard or via the agents API from this file. **Verify the current agent-config field names in ElevenLabs docs before scripting creation**; keep the file as the source of truth either way.
- [ ] `system_prompt.md` uses dynamic variables (`{{pharmacy_name}}`, `{{prescriber_name}}`, `{{patient_initials}}`, `{{drug}}`, `{{question}}`, `{{candidates}}`, `{{patient_full_name}}`, `{{patient_dob}}`, `{{callback_number}}`).

**Agent rules:**

- Identify as an automated assistant calling for `{{pharmacy_name}}`. State that the call may be recorded.
- Ask **only** `{{question}}`. Accept an answer only for that field.
- If the office volunteers other changes, do not record them. Say the pharmacist will call back.
- Reveal full name and DOB **only** if asked to verify identity.
- Never give clinical advice, never discuss other patients, never confirm anything the office didn't say.
- If unsure, ask once to repeat. Read the value back ("So that's five hundred milligrams, correct?") and require a yes.
- If voicemail or IVR is reached, leave no PHI. Say the pharmacy will call back at `{{callback_number}}` and end the call (`outcome=unclear`).
- Get the speaker's name and role for `confirmed_by`.
- Keep the call under 90 seconds.

**Data collection (structured extraction from the transcript):**

- `outcome` ∈ {confirmed, unclear, refused}
- `confirmed_value` (string, as spoken)
- `confirmed_by` (string)
- `read_back_confirmed` (boolean)

**Evaluation criteria:** asked only the scoped question; got a read-back confirmation; disclosed recording.

- **Accept:** a JSON-schema check of `agent.json`; a test asserts the prompt contains the scope, recording and identity rules.

### Step 5 — Providers

**`providers/elevenlabs.py`** (wraps `integrations/elevenlabs.py`, a thin httpx client):

- `start()` → `POST {BASE}/v1/convai/twilio/outbound-call` with `{agent_id, agent_phone_number_id, to_number, conversation_initiation_client_data: {dynamic_variables: {...}}}`. The response contains `success`, `message`, `conversation_id`, `callSid`. Treat `success=false` as `failed` with `message`.
- `fetch()` → `GET {BASE}/v1/convai/conversations/{conversation_id}`. Map the provider status to `CallStatus`, map transcript turns (`agent` → agent, `user` → office) with timestamps, and read `analysis.data_collection_results` into `CallResult`. **Verify exact response field names against current docs and pin them in a typed adapter with a recorded fixture**, so any doc drift fails one test, not production.
- `cancel()` → best effort; if the API lacks a cancel, mark `failed/cancelled` locally and document it.
- Set `telephony_call_config.ringing_timeout_secs` to about 45. Map "not answered" to `no_answer`.
- If `CALL_DEMO_TO_NUMBER` is set, **override `to_number`** and record the real candidate number only in `number_source.detail`.

**`providers/simulated.py`** (stage safety + CI):

- A deterministic scripted conversation driven by `asyncio.sleep`: dialing 1 s → in_progress, transcript turns every ~1.5 s → completed with `confirmed_value` = the first candidate.
- Scenario selection by `field_name` or a header `X-Sim-Scenario: confirmed|no_answer|refused|unclear|failed`.
- Same `ProviderSnapshot` shape as ElevenLabs, so the service can't tell the difference.

### Step 6 — Orchestrator + reconciler (`service.py`, `reconciler.py`)

`CallService.start(order_id, field_name)`:

1. Load the order.
2. Run `guards.assert_can_call`.
3. Run `CallbackLookup.lookup`.
4. Build the question.
5. Persist `queued` (idempotency key).
6. Publish.
7. `provider.start`, then `dialing`.
8. Schedule the reconciler.
9. Return `Call`.

Reconciler:

- Poll `provider.fetch` every 2 s while active. Write transcript deltas, transition states, publish on change.
- **Hard timeout** at 180 s → `failed` (`timeout`).
- It must survive restarts: on app startup, resume reconciling all non-terminal calls.

On `completed`:

1. **Normalize the answer** (`normalize_answer.py`): words to number ("five hundred" → 500), unit canonicalization (milligrams/mg → `mg`, micrograms → `mcg`, mL), trimming.
2. Validate it against the field type (strength must be a positive number + unit).
3. **Compare against candidates:**
   - If it matches a candidate → `notes=null`.
   - If it matches **none** → `notes="Office stated a value not on the fax"`. The field stays **red** even after acceptance until the pharmacist edits explicitly. Surface this in `result.notes`.
4. If `read_back_confirmed` is false → downgrade `outcome` to `unclear`.
5. Append a `Read(source="prescriber_call", value=confirmed_value, call_id=...)` to the field. **Do not** change `field.value` yet.

`CallService.decide(call_id, decision)`:

- **accept** → set `field.value = result.confirmed_value`, `field.resolution = {by:"prescriber_call", action:"accept", at, user}`, call `Triage.retriage(order, field_name)`, save, audit, publish `order.updated` (via P1's broadcaster) and `call.updated`. Return `Order`.
- **reject** → the field keeps its triage; audit it.
- Idempotent: a second decision returns **409** `{error:"already_decided"}`.

**Webhook `POST /webhooks/elevenlabs`:**

- Verify the HMAC signature header. ElevenLabs signs post-call webhooks; check the current docs for the header name and scheme (timestamped `t=...,v0=...` HMAC-SHA256 of `"{t}.{raw_body}"`), use a constant-time compare, and reject timestamps older than 30 minutes.
- Look up the call by `conversation_id`, then run the **same** completion path as the reconciler. Whichever arrives first wins; the second is a no-op (idempotent).
- Return 204 fast. Do heavy work in a background task.
- Invalid signature → 401, with no body detail.

- **Accept:**
  - `respx` tests for start success/failure, fetch mapping from a recorded fixture, and timeout.
  - Webhook tests: valid, invalid and stale signatures; duplicate delivery.
  - Restart-resume test.
  - End-to-end with `CALL_PROVIDER=simulated`: start → `call.updated` events in order → completed → accept → field green via the stub triage.

### Step 7 — FHIR R4 output (`pipeline/output/fhir.py`, `csv_export.py`)

Build a `Bundle` (`type="collection"`, `timestamp`, `identifier` = order_id) with fullUrl `urn:uuid:` references between entries.

| FHIR element | Source field | Notes |
|---|---|---|
| **Patient**.name (HumanName family/given) | `patient.name` | Split "Last, First" or "First Last" robustly; keep `text` |
| Patient.birthDate | `patient.dob` | ISO date |
| Patient.address / telecom | `patient.address`, `patient.phone` | telecom system=phone |
| **Practitioner**.identifier NPI | `prescriber.npi` | `system="http://hl7.org/fhir/sid/us-npi"` |
| Practitioner.identifier DEA | `prescriber.dea` | `type.coding` system `http://terminology.hl7.org/CodeSystem/v2-0203`, code `DEA` |
| Practitioner.name / telecom / address | `prescriber.*` | |
| **MedicationRequest**.status / intent | — | `active` / `order` |
| .medicationCodeableConcept | `drug.*` normalized | coding `system="http://www.nlm.nih.gov/research/umls/rxnorm"`, `code`=RxCUI, `display`; `text` = name + strength + form as written |
| .subject / .requester | refs | `urn:uuid:` of Patient / Practitioner |
| .authoredOn | `written_date` | |
| .dosageInstruction[0].text | `sig.raw` | Always include the original text |
| .dosageInstruction[0].timing.repeat | `sig.frequency_per_day`, `sig.duration_days` | `frequency=n, period=1, periodUnit="d"`, `boundsDuration={value: days, unit:"d", system UCUM, code:"d"}` |
| .dosageInstruction[0].route | `sig.route` | SNOMED CT, e.g. oral `26643006` "Oral route". Keep a small lookup table (oral, sublingual, topical, inhaled, subcutaneous, intramuscular, ophthalmic, otic, nasal, rectal) |
| .dosageInstruction[0].asNeededBoolean | `sig.prn` | |
| .dosageInstruction[0].doseAndRate[0].doseQuantity | `sig.dose`, `sig.unit` | UCUM (`http://unitsofmeasure.org`) for mg/mL; for tablets/capsules use `unit="tablet"` with code `{tbl}` or omit code; document the choice |
| .dispenseRequest.quantity | `drug.quantity` | value + unit |
| .dispenseRequest.numberOfRepeatsAllowed | `drug.refills` | |
| .dispenseRequest.expectedSupplyDuration | computed days supply | |
| .substitution.allowedBoolean | `drug.daw` | `not daw` |
| **DocumentReference** | fax | `content.attachment.url` = page URL, `contentType="image/png"`; the original source document |
| **Provenance** | audit | `target` = MedicationRequest, `recorded` = approval time, `agent[0]` = approving pharmacist (type `verifier`), `agent[1]` = ClearScript device (type `assembler`), `entity[0]` = DocumentReference (role `source`). Add an extension or `reason.text` summarizing per-field verification (which fields were pharmacist-edited or prescriber-confirmed) |

- [ ] Validate with `fhir.resources.R4B` models: construction must not raise, and `bundle.json()` must round-trip.
- [ ] **Refuse to build** (raise `FhirBuildError`) if any field is red, the RxCUI is missing, or the prescriber NPI is missing. `/approve` then returns 409 with `fields`.
- [ ] `csv_export.py`: one flat row (patient, DOB, drug, RxCUI, strength, qty, refills, DAW, sig, prescriber, NPI, DEA, written date, approved by, approved at).
- [ ] `/orders/{id}/approve` (only if Person 1 hasn't built it; check first, coordinate in the PR description):
  - verify there are no red fields, else 409
  - build FHIR
  - set status `approved`
  - write the audit event
  - persist the bundle
  - publish
  - return `{order, fhir}`
- **Accept:**
  - golden-file tests: `contracts/fixtures/order-clean.json` → `tests/p3/golden/order-clean.bundle.json`
  - a schema round-trip test
  - a red-field refusal test
  - a property test that every `Reference` resolves to an entry in the bundle

### Step 8 — Demo backend

- [ ] `scripts/seed_demo.py --reset`:
  - wipes demo rows
  - loads the 3–4 demo faxes from Person 2's `benchmark/demo/` (fall back to `contracts/fixtures`)
  - inserts precomputed orders, so the demo never waits on models
  - prints the order IDs
- [ ] `DEMO_MODE=1`:
  - forces `CALL_PROVIDER=simulated` unless `DEMO_LIVE_CALL=1`
  - forces `CALL_DEMO_TO_NUMBER` for live calls
  - adds a `Synthetic data` marker to `/metrics`
- [ ] **`DEMO.md` runbook:**
  - pre-flight checklist: env vars, Twilio number imported in ElevenLabs, stage phone charged and on loud, Wi-Fi + hotspot backup, `seed_demo.py --reset`
  - the 5-step script with who clicks what
  - failure playbook: call fails → retry with simulated provider via the header → recorded clip; backend down → web mock mode
  - a reset command between rehearsals

### Step 9 — Integration with Persons 1 and 2

- [ ] Replace the stubs in `wiring.py` with Person 1's repo + broadcaster and Person 2's `retriage` + `lookup_callback`. Nothing else should change.
- [ ] Run `schemathesis run contracts/openapi.yaml --base-url http://localhost:8000 --checks all` against the live app. File any non-conformance for P1 as issues; fix your own routes.
- [ ] Do one live ElevenLabs call to the stage phone, end to end through the UI, and record it as the backup clip.

---

## 7. Observability and audit

- Wrap every service method and provider call in OpenTelemetry spans via Person 1's tracer (`observability.tracer`), so calls appear inside the order's Block Convey trace.
- Span attributes: `call.id`, `call.status`, `call.provider`, `field.name`, `latency_ms`. **Never** names, DOB, or full phone numbers.
- Every state change and decision is an append-only `AuditEvent`. The order's `audit[]` must tell the full story without the trace.

## 8. Security checklist

- [ ] Webhook HMAC verification with constant-time compare and timestamp tolerance.
- [ ] Secrets only from env. Don't commit `.env` (and add `.gitignore` entries if missing).
- [ ] No PHI in logs or span attributes. Phone numbers masked to the last 4.
- [ ] `CALL_DEMO_TO_NUMBER` honored whenever `DEMO_MODE=1`. A test asserts that no other number can be dialed in demo mode.
- [ ] Rate limit `POST /…/call` to 5/min per order (simple in-memory token bucket).
- [ ] A pharmacist starts every call. There is no code path that dials without an explicit API request.

## 9. Researcher notes to defend in Q&A (put a short version in `DEMO.md`)

- **Why scope the voice agent to one question?** It shrinks the attack and error surface. Volunteered changes stay with humans, and that is how pharmacies already handle verbal clarifications: the pharmacist documents who confirmed what.
- **Why the read-back requirement?** Read-back is standard practice for verbal orders. It's the voice equivalent of our "never guess" rule.
- **Why does a value not on the fax stay red?** It may be a new order, not a clarification. A human must decide.
- **Why FHIR R4 + Provenance?** It's interoperable today, and Provenance makes the verification chain (fax → reads → pharmacist or office confirmation → approval) machine-readable for audits.

## 10. Commands that must pass on every PR

```
ruff check services pipeline/output api/routes integrations/elevenlabs.py scripts tests/p3 tests/contract
ruff format --check …same paths…
mypy --strict services pipeline/output integrations/elevenlabs.py
pytest tests/p3 tests/contract -q
python scripts/check_contract.py --spec-only
```

## 11. Definition of done

- [ ] The contract is frozen and committed, and fixtures validate. Claude Code is building against it.
- [ ] The simulated call loop works end to end via the API, with ordered `call.updated` events.
- [ ] One real ElevenLabs call to the stage phone completes and writes back correctly.
- [ ] `/approve` emits a valid FHIR R4B Bundle (golden test) and refuses on red fields.
- [ ] `seed_demo.py --reset` and `DEMO.md` let anyone on the team run the demo cold.
- [ ] All §10 commands are green.

## 12. Stretch (only after DoD)

- Inbound callback handling: the office calls back the pharmacy number and the agent resolves the pending question by call reference.
- An NCPDP SCRIPT `NewRx` export alongside FHIR, for pharmacy systems that ingest SCRIPT.
- Per-prescriber office profiles (best number, hours, preferred contact), learned from call outcomes.
