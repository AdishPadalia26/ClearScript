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
