from __future__ import annotations

from clearscript.core.schema import Field, PrescriptionOrder


def triage(order: PrescriptionOrder) -> PrescriptionOrder:
    for section in (order.patient, order.drug, order.sig, order.prescriber):
        for field in section.values():
            if field.triage == "green":
                continue
            if field.value is None:
                field.triage = "red"
                field.confidence = 0.0
                field.reasons = field.reasons or ["missing value"]
                continue
            field.confidence = 0.9 if not field.checks else 0.7
            if any(check.severity == "red" for check in field.checks):
                field.triage = "red"
            elif any(check.severity == "yellow" for check in field.checks):
                field.triage = "yellow"
            else:
                field.triage = "green"

    if any(field.triage == "red" for section in (order.patient, order.drug, order.sig, order.prescriber) for field in section.values()):
        order.status = "blocked"
    elif any(field.triage == "yellow" for section in (order.patient, order.drug, order.sig, order.prescriber) for field in section.values()):
        order.status = "needs_review"
    else:
        order.status = "ready"
    return order
