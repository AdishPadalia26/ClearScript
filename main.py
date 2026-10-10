from __future__ import annotations

import json
from pathlib import Path

from clearscript.core.schema import Field, PrescriptionOrder
from clearscript.pipeline.triage.scorer import triage
from clearscript.pipeline.verify.rules import verify
from process_images import extract_prescription


def _pick_value(data: dict, *keys: str, default: str = "Unknown") -> str:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return str(data[key])
    return default


def _order_from_sample(sample: dict, sample_name: str) -> PrescriptionOrder:
    patient = sample.get("patient", {})
    doctor = sample.get("doctor", {})
    additional = sample.get("additional_information", {})
    meds = sample.get("medications") or []
    med = meds[0] if meds else {}

    return PrescriptionOrder(
        order_id=f"sample-order-{sample_name}",
        fax_id=f"sample-{sample_name}",
        patient={
            "name": Field(name="name", value=_pick_value(patient.get("name", {}), "value", default="Unknown")),
            "dob": Field(name="dob", value="1990-03-12"),
        },
        drug={
            "name": Field(name="name", value=_pick_value(med.get("name", {}), "value", default="amoxicillin")),
            "strength": Field(name="strength", value=_pick_value(med.get("strength", {}), "value", default="500mg")),
            "quantity": Field(name="quantity", value=_pick_value(med.get("dose", {}), "value", default="21")),
        },
        sig={
            "dose": Field(name="dose", value=_pick_value(med.get("dose", {}), "value", default="1 capsule")),
            "frequency": Field(name="frequency", value=_pick_value(med.get("frequency", {}), "value", default="three times daily")),
            "duration_days": Field(name="duration_days", value="7 days"),
        },
        prescriber={
            "name": Field(name="name", value=_pick_value(doctor.get("name", {}), "value", default="Dr. Unknown")),
            "npi": Field(name="npi", value="8084012345"),
            "dea": Field(name="dea", value="AB1234567"),
        },
        written_date=Field(name="written_date", value=str(additional.get("prescription_date") or "2024-01-01")),
    )


def _parse_sample_files(sample_dir: Path) -> list[tuple[str, dict]]:
    parsed: list[tuple[str, dict]] = []
    for file in sorted(sample_dir.iterdir()):
        if file.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            continue
        extracted = extract_prescription(str(file))
        output_path = sample_dir.parent / "sample_output" / f"{file.stem}.json"
        output_path.parent.mkdir(exist_ok=True, parents=True)
        output_path.write_text(extracted.model_dump_json(indent=2) + "\n")
        parsed.append((file.stem, json.loads(output_path.read_text())))
    return parsed


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    sample_dir = repo_root / "sample_data"
    output_dir = repo_root / "sample_output"
    output_dir.mkdir(exist_ok=True)

    processed: list[dict] = []
    for sample_name, sample in _parse_sample_files(sample_dir):
        order = _order_from_sample(sample, sample_name)
        verified = verify(order)
        triaged = triage(verified)
        result_path = output_dir / f"{sample_name}_validated.json"
        result_path.write_text(triaged.model_dump_json(indent=2) + "\n")
        processed.append({
            "sample": sample_name,
            "status": triaged.status,
            "triage": {k: v.triage for sec in (triaged.patient, triaged.drug, triaged.sig, triaged.prescriber) for k, v in sec.items()},
            "result_path": str(result_path),
        })

    summary = {"processed": processed, "count": len(processed)}
    summary_path = output_dir / "workflow_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
