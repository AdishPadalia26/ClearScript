from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


CallStatus = Literal["queued", "dialing", "in_progress", "completed", "no_answer", "failed"]
Decision = Literal["accept", "reject"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NumberSource(StrictModel):
    kind: Literal["fax_header", "npi_registry", "tavily"]
    detail: str
    agreement: bool


class TranscriptTurn(StrictModel):
    role: Literal["agent", "office"]
    text: str
    t: float = Field(ge=0)


class CallResult(StrictModel):
    outcome: Literal["confirmed", "unclear", "refused"]
    confirmed_value: str | None
    confirmed_by: str | None
    notes: str | None


class Call(StrictModel):
    call_id: str
    order_id: str
    field_name: str
    status: CallStatus
    to_number: str
    number_source: NumberSource
    question: str
    transcript: list[TranscriptTurn]
    result: CallResult | None
    decision: Decision | None
    started_at: datetime | None
    ended_at: datetime | None
    error: str | None
