from __future__ import annotations

import re

from clearscript.core.schema import PrescriptionOrder


def _is_placeholder_identifier(field_name: str, value: str | None) -> bool:
    if value is None:
        return False
    raw = str(value).strip()
    if field_name == "npi":
        digits = re.sub(r"\D", "", raw)
        if len(digits) != 10:
            return False
        placeholder_digits = {"0000000000", "1111111111", "1234567890", "8084012345"}
        return digits in placeholder_digits or digits.startswith(("000", "111", "123", "808"))
    if field_name == "dea":
        upper = raw.upper()
        placeholder_dea = {"AB1234567", "AA1234567", "MD1234567", "BC1234567", "XX1234567"}
        return upper in placeholder_dea or bool(re.fullmatch(r"[A-Z]{2}\d{7}", upper) and upper.startswith(("AB", "AA", "MD", "BC", "XX")))
    return False


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

        placeholder_identity = _is_placeholder_identifier(field.name, field.value)
        if placeholder_identity and field.name in {"npi", "dea"}:
            field.triage = "yellow"
            field.confidence = 0.55
            if "placeholder demo identifier" not in field.reasons:
                field.reasons.append("placeholder demo identifier")
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
