from __future__ import annotations

from clearscript.core.schema import PrescriptionOrder


def triage(order: PrescriptionOrder) -> PrescriptionOrder:
    all_fields = []
    for section in (order.patient, order.drug, order.sig, order.prescriber):
        all_fields.extend(section.values())
    if order.written_date is not None:
        all_fields.append(order.written_date)

    for field in all_fields:
        if field.value is None or not str(field.value).strip():
            field.confidence = 0.0
            field.triage = "red"
            if not field.reasons:
                field.reasons = ["missing value"]
            continue

        if field.checks:
            if any(check.severity == "red" for check in field.checks):
                field.triage = "red"
                field.confidence = 0.15
            elif any(check.severity == "yellow" for check in field.checks):
                field.triage = "yellow"
                field.confidence = 0.55
            else:
                field.triage = "green"
                field.confidence = 0.9
        else:
            field.triage = "green"
            field.confidence = 0.8

    if any(field.triage == "red" for field in all_fields):
        order.status = "blocked"
    elif any(field.triage == "yellow" for field in all_fields):
        order.status = "needs_review"
    else:
        order.status = "ready"

    return order
