from __future__ import annotations

from typing import Any

from clearscript.core.schema import Check, Field, PrescriptionOrder


def verify(order: PrescriptionOrder) -> PrescriptionOrder:
    for section in (order.patient, order.drug, order.sig, order.prescriber):
        for name, field in section.items():
            if field.checks:
                continue
            field.checks.append(
                Check(
                    name="stub_rule",
                    status="warn",
                    severity="yellow",
                    details="Verification stub: rule result pending implementation.",
                )
            )
            field.reasons.append("stub")
            field.triage = "yellow"
            if field.value is None:
                field.triage = "red"
    order.status = "needs_review"
    return order
