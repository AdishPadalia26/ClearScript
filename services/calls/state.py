from __future__ import annotations

from datetime import datetime, timezone

from services.calls.schemas import Call, CallResult, CallStatus, Decision, TranscriptTurn


TERMINAL_STATUSES: frozenset[CallStatus] = frozenset({"completed", "no_answer", "failed"})

_ALLOWED_TRANSITIONS: dict[CallStatus, frozenset[CallStatus]] = {
    "queued": frozenset({"dialing", "failed"}),
    "dialing": frozenset({"in_progress", "no_answer", "failed"}),
    "in_progress": frozenset({"completed", "failed"}),
    "completed": frozenset(),
    "no_answer": frozenset(),
    "failed": frozenset(),
}


class IllegalTransition(ValueError):
    def __init__(self, current: CallStatus, target: CallStatus) -> None:
        super().__init__(f"illegal call transition: {current} -> {target}")
        self.current = current
        self.target = target


class DecisionError(ValueError):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def transition(
    call: Call,
    target: CallStatus,
    *,
    at: datetime | None = None,
    error: str | None = None,
    result: CallResult | None = None,
) -> Call:
    """Return a new call with a validated state transition applied."""

    if target not in _ALLOWED_TRANSITIONS[call.status]:
        raise IllegalTransition(call.status, target)

    changed_at = at or utcnow()
    update: dict[str, object] = {"status": target}

    if target in {"dialing", "in_progress"} and call.started_at is None:
        update["started_at"] = changed_at
    if target in TERMINAL_STATUSES:
        update["ended_at"] = changed_at
    if target == "failed":
        update["error"] = error or "failed"
    elif error is not None:
        update["error"] = error
    if result is not None:
        update["result"] = result

    return call.model_copy(update=update)


def cancel(call: Call, *, at: datetime | None = None) -> Call:
    if call.status in TERMINAL_STATUSES:
        raise IllegalTransition(call.status, "failed")
    return transition(call, "failed", at=at, error="cancelled")


def append_transcript(call: Call, turn: TranscriptTurn) -> Call:
    if call.status in TERMINAL_STATUSES:
        raise IllegalTransition(call.status, call.status)
    return call.model_copy(update={"transcript": [*call.transcript, turn]})


def decide(call: Call, decision: Decision) -> Call:
    if call.status != "completed":
        raise DecisionError("call decision requires completed status")
    if call.decision is not None:
        raise DecisionError("call has already been decided")
    return call.model_copy(update={"decision": decision})
