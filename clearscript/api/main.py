from __future__ import annotations

import copy
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from clearscript.api.workflow_adapter import frontend_order_from_image


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "contracts" / "fixtures"
UPLOADS = ROOT / "artifacts" / "uploads"

app = FastAPI(title="ClearScript API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResolveRequest(BaseModel):
    action: Literal["accept", "edit"]
    value: str | None = None


class CallDecisionRequest(BaseModel):
    decision: Literal["accept", "reject"]


class RejectRequest(BaseModel):
    reason: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_orders() -> dict[str, dict[str, Any]]:
    orders = {}
    for name in ("order-clean.json", "order-smudged.json", "order-controlled.json"):
        order = _read_json(FIXTURES / name)
        orders[order["order_id"]] = order
    return orders


ORDERS: dict[str, dict[str, Any]] = _load_orders()
CALLS: dict[str, dict[str, Any]] = {}
CALL_CREATED_AT: dict[str, float] = {}
UPLOAD_SEQ = 0


def _all_fields(order: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    fields: list[tuple[str, dict[str, Any]]] = []
    for group in ("patient", "drug", "sig", "prescriber", "meta"):
        for name, field in order["fields"].get(group, {}).items():
            fields.append((name, field))
    return fields


def _recount(order: dict[str, Any]) -> dict[str, Any]:
    counts = {"red": 0, "yellow": 0, "green": 0}
    for _, field in _all_fields(order):
        triage = field.get("triage", "green")
        if triage in counts:
            counts[triage] += 1
    order["counts"] = counts
    if order["status"] not in {"approved", "rejected", "processing"}:
        if counts["red"]:
            order["status"] = "blocked"
        elif counts["yellow"]:
            order["status"] = "needs_review"
        else:
            order["status"] = "ready"
    return order


def _summary(order: dict[str, Any]) -> dict[str, Any]:
    fields = order["fields"]
    patient_name = fields.get("patient", {}).get("patient.name", {}).get("value")
    initials = None
    if isinstance(patient_name, str) and patient_name.strip():
        initials = "".join(part[0] for part in patient_name.replace(",", " ").split()[:2]).upper()
    drug = fields.get("drug", {}).get("drug.name", {}).get("value")
    strength = fields.get("drug", {}).get("drug.strength", {}).get("value")
    prescriber = fields.get("prescriber", {}).get("prescriber.name", {}).get("value")
    return {
        "order_id": order["order_id"],
        "fax_id": order["fax_id"],
        "received_at": order["received_at"],
        "status": order["status"],
        "patient_initials": initials,
        "drug_display": " ".join(x for x in (drug, strength) if x) or None,
        "prescriber_display": prescriber,
        "counts": order["counts"],
        "has_high_risk_flag": any(
            field.get("risk") == "high" and field.get("triage") != "green" for _, field in _all_fields(order)
        ),
    }


def _find_field(order: dict[str, Any], field_name: str) -> tuple[str, dict[str, Any]]:
    for group in ("patient", "drug", "sig", "prescriber", "meta"):
        field = order["fields"].get(group, {}).get(field_name)
        if field is not None:
            return group, field
    raise HTTPException(status_code=404, detail="Field not found")


def _audit(order: dict[str, Any], action: str, *, field: str | None = None, detail: str | None = None) -> None:
    event = {"at": _now(), "actor": "pharmacist (local)", "action": action}
    if field:
        event["field"] = field
    if detail:
        event["detail"] = detail
    order.setdefault("audit", []).append(event)


def _apply_resolution(
    order: dict[str, Any],
    field_name: str,
    *,
    action: Literal["accept", "edit"],
    value: str | None,
    by: Literal["pharmacist", "prescriber_call"] = "pharmacist",
    user: str | None = "local demo",
) -> dict[str, Any]:
    _, field = _find_field(order, field_name)
    if action == "edit":
        if not value or not value.strip():
            raise HTTPException(status_code=422, detail="value is required for edit")
        field["value"] = value.strip()
    field["triage"] = "green"
    field["confidence"] = max(float(field.get("confidence") or 0), 0.96)
    field["reasons"] = [f"Resolved by {by.replace('_', ' ')}."]
    field["resolution"] = {"by": by, "action": action, "at": _now(), "user": user}
    _audit(order, f"field.{action}", field=field_name, detail=value)
    return _recount(order)


def _make_fhir(order: dict[str, Any]) -> dict[str, Any]:
    fields = order["fields"]

    def value(group: str, name: str) -> str | None:
        raw = fields.get(group, {}).get(name, {}).get("value")
        return raw if isinstance(raw, str) else None

    approved_at = _now()
    drug_text = " ".join(item for item in (value("drug", "drug.name"), value("drug", "drug.strength")) if item)
    rxcui = fields.get("drug", {}).get("drug.name", {}).get("normalized", {}).get("rxcui")
    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": approved_at,
        "identifier": {"system": "https://clearscript.local/orders", "value": order["order_id"]},
        "entry": [
            {
                "fullUrl": "urn:uuid:patient-1",
                "resource": {
                    "resourceType": "Patient",
                    "name": [{"text": value("patient", "patient.name")}],
                    "birthDate": value("patient", "patient.dob"),
                    "address": [{"text": value("patient", "patient.address")}],
                },
            },
            {
                "fullUrl": "urn:uuid:practitioner-1",
                "resource": {
                    "resourceType": "Practitioner",
                    "identifier": [
                        {"system": "http://hl7.org/fhir/sid/us-npi", "value": value("prescriber", "prescriber.npi")},
                        {"type": {"coding": [{"code": "DEA"}]}, "value": value("prescriber", "prescriber.dea")},
                    ],
                    "name": [{"text": value("prescriber", "prescriber.name")}],
                    "telecom": [{"system": "phone", "value": value("prescriber", "prescriber.phone")}],
                },
            },
            {
                "fullUrl": "urn:uuid:medreq-1",
                "resource": {
                    "resourceType": "MedicationRequest",
                    "status": "active",
                    "intent": "order",
                    "subject": {"reference": "urn:uuid:patient-1"},
                    "requester": {"reference": "urn:uuid:practitioner-1"},
                    "authoredOn": value("meta", "meta.date_written") or value("meta", "written_date"),
                    "medicationCodeableConcept": {
                        "coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": str(rxcui)}]
                        if rxcui
                        else [],
                        "text": drug_text,
                    },
                    "dosageInstruction": [{"text": value("sig", "sig.text") or value("sig", "sig.raw")}],
                    "dispenseRequest": {
                        "quantity": {"value": value("drug", "drug.quantity")},
                        "numberOfRepeatsAllowed": value("drug", "drug.refills"),
                    },
                },
            },
            {
                "fullUrl": "urn:uuid:provenance-1",
                "resource": {
                    "resourceType": "Provenance",
                    "recorded": approved_at,
                    "target": [{"reference": "urn:uuid:medreq-1"}],
                    "agent": [{"who": {"display": "ClearScript local demo"}, "type": {"text": "assembler"}}],
                    "reason": [{"text": "Verified from extraction, rules, pharmacist actions, and prescriber calls."}],
                },
            },
        ],
    }


def _fax_svg(order: dict[str, Any]) -> str:
    lines = [f"{field.get('label', field['name'])}: {field['value']}" for _, field in _all_fields(order) if field.get("value")]
    body = []
    for idx, line in enumerate(lines[:18]):
        y = 80 + idx * 38
        body.append(f'<text x="64" y="{y}" font-family="Arial" font-size="22">{line}</text>')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1160" viewBox="0 0 900 1160">'
        '<rect width="900" height="1160" fill="#fffdf7"/>'
        f'<text x="64" y="42" font-family="Arial" font-size="26" font-weight="700">ClearScript Fax {order["fax_id"]}</text>'
        + "".join(body)
        + "</svg>"
    )


def _question(order: dict[str, Any], field_name: str) -> str:
    _, field = _find_field(order, field_name)
    drug = order["fields"].get("drug", {}).get("drug.name", {}).get("value") or "the medication"
    candidates = []
    for read in field.get("reads", []):
        value = read.get("value")
        if value and value not in candidates:
            candidates.append(value)
    if field_name == "drug.strength" and len(candidates) >= 2:
        return f"Can you confirm the strength of {drug} - is it {candidates[0]} or {candidates[1]}?"
    return f"Can you confirm the {field.get('label', field_name)} for {drug}?"


def _refresh_call(call_id: str) -> dict[str, Any]:
    call = CALLS[call_id]
    age = time.monotonic() - CALL_CREATED_AT[call_id]
    answer = call["_answer"]
    script = [
        ("agent", "Hello, this is an automated assistant calling for Main Street Pharmacy. This call may be recorded."),
        ("office", "This is Maria at the front desk. Go ahead."),
        ("agent", call["question"]),
        ("office", f"It should be {answer}."),
        ("agent", f"So that is {answer}, correct?"),
        ("office", "Correct."),
    ]
    public = {k: v for k, v in call.items() if not k.startswith("_")}
    if age < 1:
        public["status"] = "queued"
    elif age < 2:
        public["status"] = "dialing"
        public["started_at"] = public["started_at"] or _now()
    elif age < 8:
        public["status"] = "in_progress"
        public["started_at"] = public["started_at"] or _now()
        public["transcript"] = [
            {"role": role, "text": text, "t": round(i * 1.4, 1)}
            for i, (role, text) in enumerate(script[: max(1, int((age - 2) // 1.2) + 1)])
        ]
    else:
        public["status"] = "completed"
        public["started_at"] = public["started_at"] or _now()
        public["ended_at"] = public["ended_at"] or _now()
        public["transcript"] = [{"role": role, "text": text, "t": round(i * 1.4, 1)} for i, (role, text) in enumerate(script)]
        public["result"] = {
            "outcome": "confirmed",
            "confirmed_value": answer,
            "confirmed_by": "Maria, front desk",
            "notes": None,
        }
        order = ORDERS[public["order_id"]]
        group, field = _find_field(order, public["field_name"])
        if not any(read.get("call_id") == call_id for read in field.get("reads", [])):
            field.setdefault("reads", []).append(
                {
                    "source": "prescriber_call",
                    "model": None,
                    "value": answer,
                    "evidence": None,
                    "ocr_confidence": None,
                    "crop_url": None,
                    "call_id": call_id,
                }
            )
            order["fields"][group][public["field_name"]] = field
            ORDERS[order["order_id"]] = _recount(order)
    call.update(public)
    return public


@app.get("/orders")
def list_orders(status: str | None = None) -> list[dict[str, Any]]:
    summaries = [_summary(_recount(copy.deepcopy(order))) for order in ORDERS.values()]
    return [summary for summary in summaries if status is None or summary["status"] == status]


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _recount(copy.deepcopy(order))


@app.get("/faxes/{fax_id}/pages/{n}.png")
def get_fax_page(fax_id: str, n: int) -> Response:
    for order in ORDERS.values():
        if order["fax_id"] == fax_id:
            return Response(_fax_svg(order), media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Fax page not found")


@app.post("/faxes")
async def upload_fax(file: UploadFile = File(...)) -> dict[str, Any]:
    global UPLOAD_SEQ
    UPLOAD_SEQ += 1
    suffix = Path(file.filename or "upload.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg"}:
        raise HTTPException(status_code=415, detail="Upload must be a PNG or JPEG image for the cleanup workflow.")
    UPLOADS.mkdir(parents=True, exist_ok=True)
    image_path = UPLOADS / f"fax_upload_{UPLOAD_SEQ}{suffix}"
    image_path.write_bytes(await file.read())
    order = frontend_order_from_image(
        image_path,
        order_id=f"ord_upload_{UPLOAD_SEQ}",
        fax_id=f"fax_upload_{UPLOAD_SEQ}",
        filename=file.filename or image_path.name,
        model=os.environ.get("NICRRON_MODEL", "nicrron/auto"),
    )
    order["audit"].append({"at": _now(), "actor": "system", "action": "fax.received", "detail": file.filename})
    ORDERS[order["order_id"]] = _recount(order)
    return {"fax_id": order["fax_id"], "order_ids": [order["order_id"]]}


@app.post("/orders/{order_id}/fields/{field_name}/resolve")
def resolve_field(order_id: str, field_name: str, body: ResolveRequest) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    ORDERS[order_id] = _apply_resolution(order, field_name, action=body.action, value=body.value)
    return copy.deepcopy(ORDERS[order_id])


@app.post("/orders/{order_id}/fields/{field_name}/call")
def start_call(order_id: str, field_name: str) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    _, field = _find_field(order, field_name)
    call_id = f"call_{len(CALLS) + 1}"
    answer = "500 mg" if field_name == "drug.strength" else field.get("value") or "confirmed"
    call = {
        "call_id": call_id,
        "order_id": order_id,
        "field_name": field_name,
        "status": "queued",
        "to_number": "+15551234567",
        "number_source": {"kind": "npi_registry", "detail": "NPPES practice phone matches fax header.", "agreement": True},
        "question": _question(order, field_name),
        "transcript": [],
        "result": None,
        "decision": None,
        "started_at": None,
        "ended_at": None,
        "error": None,
        "_answer": answer,
    }
    CALLS[call_id] = call
    CALL_CREATED_AT[call_id] = time.monotonic()
    order["active_call_id"] = call_id
    ORDERS[order_id] = order
    return _refresh_call(call_id)


@app.get("/calls/{call_id}")
def get_call(call_id: str) -> dict[str, Any]:
    if call_id not in CALLS:
        raise HTTPException(status_code=404, detail="Call not found")
    return _refresh_call(call_id)


@app.post("/webhooks/elevenlabs", status_code=204)
async def elevenlabs_webhook(payload: dict[str, Any]) -> Response:
    return Response(status_code=204)


@app.websocket("/ws/orders")
async def orders_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    for order in ORDERS.values():
        await websocket.send_json({"type": "order.updated", "order": _summary(_recount(copy.deepcopy(order)))})
    await websocket.close()


@app.post("/calls/{call_id}/decision")
def call_decision(call_id: str, body: CallDecisionRequest) -> dict[str, Any]:
    if call_id not in CALLS:
        raise HTTPException(status_code=404, detail="Call not found")
    call = _refresh_call(call_id)
    if call["status"] != "completed":
        raise HTTPException(status_code=409, detail="Call is not completed")
    if call["decision"] is not None:
        raise HTTPException(status_code=409, detail="Call already decided")
    call["decision"] = body.decision
    CALLS[call_id].update(call)
    order = ORDERS[call["order_id"]]
    order["active_call_id"] = None
    if body.decision == "accept" and call["result"] and call["result"]["confirmed_value"]:
        order = _apply_resolution(
            order,
            call["field_name"],
            action="edit",
            value=call["result"]["confirmed_value"],
            by="prescriber_call",
            user=call["result"]["confirmed_by"],
        )
        _audit(order, "call.decision.accept", field=call["field_name"], detail=call["result"]["confirmed_value"])
    else:
        _audit(order, "call.decision.reject", field=call["field_name"])
    ORDERS[order["order_id"]] = _recount(order)
    return copy.deepcopy(ORDERS[order["order_id"]])


@app.post("/calls/{call_id}/cancel")
def cancel_call(call_id: str) -> dict[str, Any]:
    if call_id not in CALLS:
        raise HTTPException(status_code=404, detail="Call not found")
    call = CALLS[call_id]
    call.update({"status": "failed", "ended_at": _now(), "error": "cancelled"})
    order = ORDERS.get(call["order_id"])
    if order:
        order["active_call_id"] = None
    return {k: v for k, v in call.items() if not k.startswith("_")}


@app.post("/orders/{order_id}/approve")
def approve_order(order_id: str) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    red = [name for name, field in _all_fields(order) if field.get("triage") == "red"]
    if red:
        return JSONResponse({"error": "red_fields", "fields": red}, status_code=409)
    order["status"] = "approved"
    order["active_call_id"] = None
    _audit(order, "order.approved")
    ORDERS[order_id] = order
    return {"order": copy.deepcopy(order), "fhir": _make_fhir(order)}


@app.post("/orders/{order_id}/reject")
def reject_order(order_id: str, body: RejectRequest) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order["status"] = "rejected"
    order["active_call_id"] = None
    _audit(order, "order.rejected", detail=body.reason)
    return copy.deepcopy(order)


@app.get("/orders/{order_id}/fhir")
def get_fhir(order_id: str) -> dict[str, Any]:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order["status"] != "approved":
        raise HTTPException(status_code=409, detail="Order is not approved")
    return _make_fhir(order)


@app.get("/orders/{order_id}/export.csv")
def export_csv(order_id: str) -> Response:
    order = ORDERS.get(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    fields = {name: field.get("value") for name, field in _all_fields(order)}
    header = ["order_id", "patient", "drug", "strength", "quantity", "prescriber"]
    row = [
        order_id,
        fields.get("patient.name", ""),
        fields.get("drug.name", ""),
        fields.get("drug.strength", ""),
        fields.get("drug.quantity", ""),
        fields.get("prescriber.name", ""),
    ]
    return Response(",".join(header) + "\n" + ",".join(str(x) for x in row) + "\n", media_type="text/csv")


@app.get("/metrics")
def metrics() -> dict[str, Any]:
    metrics_path = ROOT / "benchmark" / "metrics.json"
    if metrics_path.exists():
        raw = _read_json(metrics_path)
        if "systems" in raw:
            return raw
    return _read_json(FIXTURES / "metrics.json")
