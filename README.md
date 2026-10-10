# ClearScript — Fax-to-Fill Starter

This repo is a minimal starting point for the fax-to-verified-order project described in `project.txt`.

## Goal

Build a pipeline that:
- ingests faxed prescriptions,
- extracts and normalizes fields,
- applies verification rules,
- triages high-risk fields,
- and surfaces pharmacist review with audit traceability.

## Minimum project setup

### 1. Python environment

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -U pip
pip install fastapi uvicorn pydantic python-dotenv httpx pillow opencv-python pdf2image python-dateutil
```

### 2. Environment variables

Create a local `.env` file, but do not commit it.

```bash
PRISMTRACE_API_KEY=your_key
PRISMTRACE_PROJECT_ID=your_project_id
PRISMTRACE_HOST=https://prism-api-prod.up.railway.app
```

### 3. Repo structure

```text
clearscript/
  api/
  core/
  pipeline/
  integrations/
  observability/
  benchmark/
  web/
  tests/
  data/
  docker-compose.yml
```

### 4. Bootstrap the application shell

Create a minimal FastAPI app that exposes:
- `POST /faxes` for uploads
- `GET /orders` for listing work items
- `GET /orders/{id}` for a single order view
- `POST /orders/{id}/approve` for pharmacist approval

### 5. Data contract first

Implement the core schema from the brief in `core/schema.py`.

Key models:
- `Evidence`
- `Read`
- `Field`
- `PrescriptionOrder`

This should be locked before other modules build against it.

### 6. Build the pipeline in order

1. `ingest/` — upload and page splitting
2. `preprocess/` — deskew, denoise, page classification
3. `extract/` — OCR + multi-model reads
4. `normalize/` — RxNorm / NPI / DEA / sig parsing
5. `verify/` — rules and flags
6. `triage/` — confidence + green/yellow/red decision
7. `output/` — audit record + FHIR or CSV export

### 7. PRISM instrumentation

Use the existing PRISM callback setup and add it to all model-calling paths.

### 8. Benchmark loop

Create a synthetic benchmark harness with:
- generated prescription orders,
- rendered fax templates,
- degraded/augmented images,
- expected truth JSON,
- metric output for silent error rate, flag rate, and calibration.

### 9. Demo path

Build the MVP around one hero path:
- one fax upload,
- one order extraction,
- one red-field example,
- one pharmacist review flow,
- one approval.

That is enough to demonstrate the value and close the loop cleanly.

## Recommended next commands

```bash
mkdir -p clearscript/api clearscript/core clearscript/pipeline/ingest clearscript/pipeline/preprocess clearscript/pipeline/extract clearscript/pipeline/normalize clearscript/pipeline/verify clearscript/pipeline/triage clearscript/pipeline/output clearscript/integrations clearscript/observability clearscript/benchmark clearscript/web clearscript/tests clearscript/data/fixtures
```

Then start with:
- `clearscript/core/schema.py`
- `clearscript/api/main.py`
- `clearscript/pipeline/ingest/` uploader and split logic
- `clearscript/observability/prism.py` or the existing instrumentation wrapper

## Important constraints

- Keep synthetic data only for now.
- Never commit `.env` or secrets.
- Use PRISM for live tracing of every model and workflow entry point.
- Keep the schema stable before deeper integration work.
