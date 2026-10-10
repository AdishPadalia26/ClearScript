from __future__ import annotations

from datetime import datetime, timezone

import pytest

from services.calls.schemas import Call, CallResult, NumberSource, TranscriptTurn
from services.calls.state import DecisionError, IllegalTransition, append_transcript, cancel, decide, transition


def make_call(status: str = "queued") -> Call:
    return Call(
        call_id="call_1",
        order_id="ord_1",
        field_name="drug.strength",
        status=status,
        to_number="+15551234567",
        number_source=NumberSource(
            kind="npi_registry",
            detail="NPI registry practice phone.",
            agreement=True,
        ),
        question="Can you confirm the strength of Metformin - is it 850 mg or 500 mg?",
        transcript=[],
        result=None,
        decision=None,
        started_at=None,
        ended_at=None,
        error=None,
    )


def test_happy_path_reaches_completed() -> None:
    at = datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc)
    call = make_call()

    call = transition(call, "dialing", at=at)
    call = transition(call, "in_progress", at=at)
    call = append_transcript(call, TranscriptTurn(role="office", text="It is 500 mg.", t=4.2))
    call = transition(
        call,
        "completed",
        at=at,
        result=CallResult(
            outcome="confirmed",
            confirmed_value="500 mg",
            confirmed_by="Maria, front desk",
            notes=None,
        ),
    )

    assert call.status == "completed"
    assert call.started_at == at
    assert call.ended_at == at
    assert call.result is not None
    assert call.transcript[0].text == "It is 500 mg."


@pytest.mark.parametrize(
    ("current", "target"),
    [
        ("queued", "completed"),
        ("dialing", "completed"),
        ("in_progress", "no_answer"),
        ("completed", "failed"),
        ("no_answer", "failed"),
        ("failed", "dialing"),
    ],
)
def test_illegal_transitions_raise(current: str, target: str) -> None:
    with pytest.raises(IllegalTransition):
        transition(make_call(current), target)  # type: ignore[arg-type]


def test_cancel_active_call_marks_failed_cancelled() -> None:
    call = cancel(make_call("in_progress"))

    assert call.status == "failed"
    assert call.error == "cancelled"
    assert call.ended_at is not None


@pytest.mark.parametrize("status", ["completed", "no_answer", "failed"])
def test_terminal_statuses_are_absorbing(status: str) -> None:
    with pytest.raises(IllegalTransition):
        cancel(make_call(status))

    with pytest.raises(IllegalTransition):
        append_transcript(make_call(status), TranscriptTurn(role="agent", text="hello", t=1))


def test_decision_requires_completed_call() -> None:
    with pytest.raises(DecisionError):
        decide(make_call("in_progress"), "accept")


def test_decision_can_be_set_once() -> None:
    call = make_call("in_progress")
    call = transition(
        call,
        "completed",
        result=CallResult(outcome="confirmed", confirmed_value="500 mg", confirmed_by="Maria", notes=None),
    )

    accepted = decide(call, "accept")

    assert accepted.decision == "accept"
    with pytest.raises(DecisionError):
        decide(accepted, "reject")
