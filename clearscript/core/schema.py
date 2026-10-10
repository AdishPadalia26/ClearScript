from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field as PydanticField


class Evidence(BaseModel):
    page: int
    bbox: tuple[float, float, float, float]
    text_seen: str


class Read(BaseModel):
    source: Literal["model_a", "model_b", "model_c", "textract", "pharmacist", "prescriber_call"]
    value: str | None = None
    evidence: Evidence | None = None
    ocr_confidence: float | None = None


class Check(BaseModel):
    name: str
    status: Literal["pass", "warn", "fail"]
    severity: Literal["info", "yellow", "red"]
    details: str


class Field(BaseModel):
    name: str
    value: str | None = None
    normalized: dict[str, Any] | None = None
    reads: list[Read] = PydanticField(default_factory=list)
    checks: list[Check] = PydanticField(default_factory=list)
    confidence: float = 0.0
    triage: Literal["green", "yellow", "red"] = "green"
    reasons: list[str] = PydanticField(default_factory=list)


class AuditEvent(BaseModel):
    timestamp: str
    actor: str
    action: str
    details: dict[str, Any] = PydanticField(default_factory=dict)


class PrescriptionOrder(BaseModel):
    order_id: str
    fax_id: str
    patient: dict[str, Field] = PydanticField(default_factory=dict)
    drug: dict[str, Field] = PydanticField(default_factory=dict)
    sig: dict[str, Field] = PydanticField(default_factory=dict)
    prescriber: dict[str, Field] = PydanticField(default_factory=dict)
    written_date: Field | None = None
    status: Literal["needs_review", "blocked", "ready", "approved", "rejected"] = "needs_review"
    audit: list[AuditEvent] = PydanticField(default_factory=list)
