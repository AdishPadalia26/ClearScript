# ClearScript / PillSpark

A fax-to-verified-order pipeline for prescription intake and pharmacist review. The project ingests faxed prescriptions, extracts key fields, normalizes the values, verifies them against rules and registries, scores confidence, and surfaces unsafe or ambiguous orders for human review.

This repository is a working baseline for the broader PillSpark workflow, with live instrumentation, a benchmark harness, and a verification/evaluation layer that now validates against real external data sources when available.

## Project goal

Turn a faxed prescription into a trusted order decision with:
- OCR / extraction from the fax image
- normalized field values
- rule-based verification checks
- external registry validation (RxNorm and NPI)
- confidence scoring and triage
- pharmacist review or approval flow
- auditability via PRISM tracing
- benchmark-driven evaluation and quality tracking

## Core architecture

The project is designed around the following pipeline:
1. Ingest and preprocess fax pages
2. Extract field reads from the document
3. Normalize values (drug, sig, prescriber, DEA, dates)
4. Validate against external registries (RxNav + NPI registry)
5. Verify rules and safety checks
6. Score confidence and triage each field
7. Present a review queue and approval workflow
8. Benchmark held-out performance and report metrics

## Repository structure

```text
.
├── AGENTS.md
├── .env.example
├── .venv/
├── clearscript/
│   ├── api/
│   ├── benchmark/
│   ├── core/
│   ├── integrations/
│   ├── pipeline/
│   └── ...
├── scripts/
├── benchmark/
├── requirements.txt
├── README.md
├── member2_verification_eval.md
├── project.txt
└── prismtrace_instrumentation.py
```

## Environment setup

### Python

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

### Local environment variables

Create a local `.env` file with the required credentials, without committing secrets:

```bash
PRISMTRACE_API_KEY=your_key
PRISMTRACE_PROJECT_ID=your_project_id
PRISMTRACE_HOST=https://prism-api-prod.up.railway.app
NICRRON_API_KEY=your_key
NICRRON_BASE_URL=https://api.nicrron.ai/v1
```

## PRISM instrumentation

This project is explicitly instrumented for tracing and observability. Every model-calling entry point should emit live trace events to PRISM so that calls, decisions, and review outcomes are visible to the team.

Key files:
- `prismtrace_instrumentation.py`
- `clearscript/pipeline/extract/vision.py`
- `scripts/healthcheck.py`

The repo includes a readiness check that validates both PRISM connectivity and the Nicrron model API.

## Member 2: Verification, Confidence & Evaluation Lead

This repository includes the Member 2 scope for verification, confidence scoring, and evaluation.

### Responsibilities

The Verification, Confidence & Evaluation Lead owns:
- `pipeline/normalize/`
- `pipeline/verify/`
- `pipeline/triage/`
- `integrations/rxnorm.py`
- `integrations/npi_registry.py`
- `integrations/tavily.py`
- `benchmark/` generation and runner

Their mission is to decide what to trust by:
- normalizing raw model reads into canonical field values,
- checking them against external registries and safety rules,
- assigning confidence and triage status,
- and proving quality with a benchmark.

### Current state in this repo

The project includes a working baseline for the Member 2 layer:
- `clearscript/core/schema.py` defines the shared order and field contract
- `clearscript/pipeline/verify/rules.py` contains rule-based field verification logic
- `clearscript/pipeline/triage/scorer.py` contains triage logic for green / yellow / red decisions
- `clearscript/integrations/rxnorm.py` validates against live RxNav endpoints when available, with a local fallback
- `clearscript/integrations/npi_registry.py` validates NPIs against the CMS NPPES registry when available, with a local checksum fallback
- `clearscript/benchmark/generate.py` creates synthetic prescription records and truth data
- `clearscript/benchmark/run.py` compares generated orders to truth files and emits a metrics summary

This gives the project a teammate-ready verification and benchmark baseline that can be extended with richer extraction and more adversarial trap cases.

### Verification rules implemented

The current verification layer checks:
- required field presence
- strength format / dose format validation
- NPI checksum validation
- DEA checksum validation
- DOB plausibility
- written date ISO validity
- basic signature structure validity
- RxNorm-style match against a drug entry

These rules return pharmacist-facing conditions and produce red / yellow / green field states.

### Confidence and triage

The scoring layer is meant to:
- aggregate check severity into field-level risk
- produce risk states from actual validation results
- set order status based on the worst field state
- support retriage during pharmacist review or call-backs

### Benchmark and evaluation

The benchmark is now a truth-based runner rather than a hardcoded placeholder:
- synthetic orders are created and saved
- matching truth files are generated
- each order is compared against its truth file
- field accuracy and silent-error metrics are computed from the comparison

This gives the team a real baseline to expand into a larger benchmark with traps, calibration, and held-out metrics.

## Recommended workflow

```bash
# from repo root
. .venv/bin/activate
python scripts/healthcheck.py
python -m clearscript.benchmark.generate
python -m clearscript.benchmark.run
```

## Demo and product story

The project is aimed at a clear demo story:
- a fax arrives
- key fields are extracted
- the verification layer flags risky values
- a pharmacist reviews the mismatches and resolves the final decision
- traced observability shows how the system reached the answer

That makes the project useful both as an operational pipeline and as a judged demo for risk, trust, and measurable accuracy.

## Important constraints

- Keep local secrets in `.env` and never commit them.
- Use PRISM for tracing of every model and workflow entry point.
- Build against the schema first before deeper changes.
- Keep benchmark and evaluation logic explicit and auditable.
- Treat synthetic data as a development and evaluation scaffold until real fax examples are available.
- Prefer live external registry lookups where available, but keep a local fallback for resilience.

## Related docs

- `member2_verification_eval.md` — detailed Member 2 specification and deliverables
- `project.txt` — full end-to-end project brief and team split
- `AGENTS.md` — project-specific agent guidance, including PRISM tracing requirements

## End-to-end workflow

The project is designed to run as a single pipeline from sample image input to a verified prescription decision.

### 1. Input stage

The process begins with a file in `sample_data/`.

- Each image represents a fax or prescription document.
- The repo expects one or more scanned prescription images as the input source.
- The extraction script in `main.py` scans the directory and passes each file into the image-processing pipeline.

### 2. Extraction stage

`process_images/process_image.py` reads each image and sends it to the Nicrron model using the OpenAI-compatible API.

- The image is encoded as a data URL.
- The model is prompted to return a structured JSON prescription payload.
- The extractor attempts to recover fields like:
  - patient name
  - age / sex
  - prescriber / doctor name
  - medication name
  - strength
  - dose
  - frequency
  - date
  - signature state

The output is stored as JSON under `sample_output/`.

### 3. Order creation stage

`main.py` converts each extracted payload into a `PrescriptionOrder` using the schema in `clearscript/core/schema.py`.

This step does several important things:
- maps extracted fields into the shared `PrescriptionOrder` contract,
- normalizes them into `patient`, `drug`, `sig`, and `prescriber` sections,
- attaches default risk metadata such as `npi` and `dea` placeholders for validation,
- creates a real order object that downstream checks can act on.

### 4. Verification stage

The verification layer lives in `clearscript/pipeline/verify/rules.py`.

It runs checks over each field and produces structured `Check` records:
- `pass`, `warn`, or `fail`
- severity: `info`, `yellow`, or `red`
- human-readable reason text

Examples of checks now included:
- required field presence
- strength and numeric formatting sanity
- NPI checksum validation
- DEA checksum validation
- written date validity
- DOB plausibility
- signature structure sanity
- RxNorm-style drug match validation

This is where the pipeline decides what is trustworthy and what is risky.

### 5. Triage stage

The triage layer lives in `clearscript/pipeline/triage/scorer.py`.

It reads the verification results and converts them into a final field-level status:
- green: acceptable
- yellow: review recommended
- red: blocked / unsafe

Then it reduces the whole order to a final order status:
- `ready`
- `needs_review`
- `blocked`

This is the stage where a pharmacist or operator sees whether the prescription is safe to proceed or should be reviewed.

### 6. Output / demo artifacts

After the verification and triage pass, the script writes:
- extracted JSON files in `sample_output/`
- validated order JSON files like `*_validated.json`
- a workflow summary file at `sample_output/workflow_summary.json`

This gives a visible audit trail from image input to final review state.

### 7. How to run it

```bash
cd /home/jona/hackathon/Columbia-Hack
. .venv/bin/activate
python main.py
```

The command processes all images in `sample_data/`, generates extraction JSON, and then validates each extracted prescription through the rule engine and triage logic.

## Artifact policy

Generated JSON files are useful as demo artifacts, but they should be treated carefully:

- Keep a small curated set of committed fixtures if they are intentionally used as sample inputs or reference outputs.
- Do not commit generated outputs that are purely runtime artifacts and can be recreated.
- Prefer `.gitignore` for directories like `sample_output/` or `benchmark/` if the contents are ephemeral and meant to be regenerated.
- Keep only the files that help explain the workflow or serve as handoff examples.

For this repo, the best practice is:
- keep the source images and a small set of sample outputs as examples,
- ignore large or repeated generated files unless they are explicitly intended to be part of the demo fixture set.

This keeps the repo clean while preserving a reproducible demo path.

## Related docs
