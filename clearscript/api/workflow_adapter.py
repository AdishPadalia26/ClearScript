from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from clearscript.core.schema import AuditEvent, Check, Field, PrescriptionOrder
from clearscript.integrations.tavily import drug_safety_badge
from clearscript.pipeline.triage.scorer import triage
from clearscript.pipeline.verify.rules import verify
from process_images import extract_prescription


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def pick_value(data: dict[str, Any], *keys: str, default: str = "Unknown") -> str:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return str(value)
    return default


def order_from_image(image_path: Path, *, order_id: str, fax_id: str, filename: str) -> PrescriptionOrder:
    extracted = extract_prescription(str(image_path))
    payload = extracted.model_dump()
    patient = payload.get("patient", {})
    doctor = payload.get("doctor", {})
    additional = payload.get("additional_information", {})
    medications = payload.get("medications") or []
    medication = medications[0] if medications else {}

    order = PrescriptionOrder(
        order_id=order_id,
        fax_id=fax_id,
        patient={
            "name": Field(name="name", value=pick_value(patient.get("name", {}), "value")),
            "age": Field(name="age", value=pick_value(patient.get("age", {}), "value", default="Unknown")),
            "sex": Field(name="sex", value=pick_value(patient.get("sex", {}), "value", default="Unknown")),
        },
        drug={
            "name": Field(name="name", value=pick_value(medication.get("name", {}), "value", default="Unknown")),
            "strength": Field(
                name="strength",
                value=pick_value(medication.get("strength", {}), "value", default="Unknown"),
            ),
            "quantity": Field(name="quantity", value=pick_value(medication.get("dose", {}), "value", default="Unknown")),
        },
        sig={
            "dose": Field(name="dose", value=pick_value(medication.get("dose", {}), "value", default="Unknown")),
            "frequency": Field(
                name="frequency",
                value=pick_value(medication.get("frequency", {}), "value", default="Unknown"),
            ),
            "duration_days": Field(
                name="duration_days",
                value=pick_value(medication.get("duration", {}), "value", default="Unknown"),
            ),
        },
        prescriber={
            "name": Field(name="name", value=pick_value(doctor.get("name", {}), "value", default="Unknown")),
            "npi": Field(name="npi", value=pick_value(doctor.get("registration_number", {}), "value", default="Unknown")),
            "dea": Field(name="dea", value="Unknown"),
        },
        written_date=Field(name="written_date", value=str(additional.get("prescription_date") or "Unknown")),
    )
    order.audit.append(
        AuditEvent(
            timestamp=now_iso(),
            actor="cleanup-workflow",
            action="image.extracted",
            details={"filename": filename, "source": str(image_path)},
        )
    )
    return triage(verify(order))


LABELS = {
    "patient.name": "Patient name",
    "patient.age": "Patient age",
    "patient.sex": "Patient sex",
    "drug.name": "Medication",
    "drug.strength": "Strength",
    "drug.quantity": "Quantity",
    "sig.dose": "Dose",
    "sig.frequency": "Directions",
    "sig.duration_days": "Duration",
    "prescriber.name": "Prescriber",
    "prescriber.npi": "Prescriber NPI / registration",
    "prescriber.dea": "Prescriber DEA",
    "written_date": "Written date",
}


def _frontend_check(field_name: str, check: Check) -> dict[str, Any]:
    return {
        "rule": check.name,
        "result": check.status,
        "severity": check.severity,
        "fields": [field_name],
        "reason": check.details,
    }


def _frontend_field(group: str, key: str, field: Field, *, model: str) -> dict[str, Any]:
    field_name = key if "." in key else f"{group}.{key}" if group != "meta" else key
    value = str(field.value) if field.value is not None else None
    confidence = float(field.confidence or 0)
    return {
        "name": field_name,
        "label": LABELS.get(field_name, field_name.replace(".", " ").title()),
        "value": value,
        "normalized": {"text": value} if value else None,
        "reads": [
            {
                "source": "ocr",
                "model": model,
                "value": value,
                "evidence": {"page": 1, "bbox": [0.08, 0.08, 0.82, 0.18], "text_seen": value or ""},
                "ocr_confidence": round(confidence * 100, 1) if confidence else None,
                "crop_url": None,
                "call_id": None,
            }
        ],
        "checks": [_frontend_check(field_name, check) for check in field.checks],
        "confidence": confidence,
        "triage": field.triage,
        "reasons": field.reasons or ["Field produced by cleanup image workflow."],
        "risk": "high" if field_name in {"drug.name", "drug.strength", "prescriber.dea"} else "normal",
        "resolution": None,
    }


def _counts(order: dict[str, Any]) -> dict[str, int]:
    counts = {"red": 0, "yellow": 0, "green": 0}
    for section in order["fields"].values():
        for field in section.values():
            triage_value = field.get("triage", "green")
            if triage_value in counts:
                counts[triage_value] += 1
    return counts


def _status(counts: dict[str, int]) -> str:
    if counts["red"]:
        return "blocked"
    if counts["yellow"]:
        return "needs_review"
    return "ready"


def _safety_notices(drug_name: str | None) -> list[dict[str, Any]]:
    if not drug_name or drug_name == "Unknown":
        return []
    badge = drug_safety_badge(drug_name)
    result = badge.get("result") or {}
    rows = result.get("results") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        return []
    notices = []
    for row in rows[:2]:
        if not isinstance(row, dict):
            continue
        title = row.get("title") or row.get("content") or f"{drug_name} safety reference"
        url = row.get("url") or row.get("source") or "https://www.fda.gov/drugs"
        notices.append({"title": str(title)[:140], "url": url, "source": "Tavily"})
    return notices


def frontend_order_from_image(image_path: Path, *, order_id: str, fax_id: str, filename: str, model: str) -> dict[str, Any]:
    validated = order_from_image(image_path, order_id=order_id, fax_id=fax_id, filename=filename)
    fields = {
        "patient": {f"patient.{key}": _frontend_field("patient", key, field, model=model) for key, field in validated.patient.items()},
        "drug": {f"drug.{key}": _frontend_field("drug", key, field, model=model) for key, field in validated.drug.items()},
        "sig": {f"sig.{key}": _frontend_field("sig", key, field, model=model) for key, field in validated.sig.items()},
        "prescriber": {
            f"prescriber.{key}": _frontend_field("prescriber", key, field, model=model)
            for key, field in validated.prescriber.items()
        },
        "meta": {},
    }
    if validated.written_date is not None:
        fields["meta"]["written_date"] = _frontend_field("meta", "written_date", validated.written_date, model=model)

    order = {
        "order_id": validated.order_id,
        "fax_id": validated.fax_id,
        "page": 1,
        "page_count": 1,
        "received_at": now_iso(),
        "status": validated.status,
        "fields": fields,
        "counts": {"red": 0, "yellow": 0, "green": 0},
        "trace_url": None,
        "safety_notices": _safety_notices(validated.drug.get("name").value if validated.drug.get("name") else None),
        "active_call_id": None,
        "audit": [
            {"at": event.timestamp, "actor": event.actor, "action": event.action, "detail": str(event.details)}
            for event in validated.audit
        ],
    }
    order["counts"] = _counts(order)
    order["status"] = _status(order["counts"])
    return order
