from __future__ import annotations

import re
from datetime import date
from typing import Literal

from clearscript.core.schema import Check, Field, PrescriptionOrder
from clearscript.integrations.npi_registry import validate_npi
from clearscript.integrations.rxnorm import match_rxnorm, validate_sig_structure


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def _add_check(
    field: Field,
    *,
    name: str,
    status: Literal["pass", "warn", "fail"],
    severity: Literal["info", "yellow", "red"],
    details: str,
) -> None:
    field.checks.append(Check(name=name, status=status, severity=severity, details=details))
    field.reasons.append(details)


def _is_valid_dea(value: str | None) -> bool:
    raw = (value or "").strip().upper()
    if len(raw) != 9 or not re.fullmatch(r"[A-Z]\d{7}", raw):
        return False
    digits = [int(ch) for ch in raw[1:]]
    expected = (sum(digits[0::2]) + 2 * sum(digits[1::2])) % 10
    return expected == digits[-1]


def _is_valid_strength(value: str | None) -> bool:
    v = _norm(value)
    return bool(re.search(r"\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu)", v))


def _is_valid_dob(value: str | None) -> bool:
    text = (value or "").strip()
    if not text:
        return False
    try:
        d = date.fromisoformat(text)
    except ValueError:
        return False
    today = date.today()
    age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    return 0 < age < 120


def _is_valid_date(value: str | None) -> bool:
    if value is None:
        return False
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def verify(order: PrescriptionOrder) -> PrescriptionOrder:
    for section in (order.patient, order.drug, order.sig, order.prescriber):
        for name, field in section.items():
            field.checks = []
            field.reasons = []
            value = field.value

            if value is None or not str(value).strip():
                _add_check(field, name="missing_value", status="fail", severity="red", details="Required field is missing.")
                field.triage = "red"
                continue

            if name == "strength":
                if not _is_valid_strength(value):
                    _add_check(field, name="strength_format", status="fail", severity="red", details="Strength is not in a recognized dose format.")
                else:
                    _add_check(field, name="strength_format", status="pass", severity="info", details="Strength is present in a recognizable format.")

            if name == "npi":
                npi_result = validate_npi(value)
                if not npi_result["valid"]:
                    _add_check(field, name="npi_format", status="fail", severity="red", details=npi_result["reason"])
                else:
                    _add_check(field, name="npi_format", status="pass", severity="info", details=npi_result["reason"])

            if name == "dea":
                if not _is_valid_dea(value):
                    _add_check(field, name="dea_check", status="fail", severity="red", details="DEA checksum is invalid.")
                else:
                    _add_check(field, name="dea_check", status="pass", severity="info", details="DEA checksum is valid.")

            if name == "dob":
                if not _is_valid_dob(value):
                    _add_check(field, name="dob_validity", status="warn", severity="yellow", details="DOB is missing, ambiguous, or implausible.")
                else:
                    _add_check(field, name="dob_validity", status="pass", severity="info", details="DOB is plausible.")

            if name in {"name", "patient_name", "prescriber_name"}:
                if len(str(value).strip()) < 2:
                    _add_check(field, name="name_format", status="warn", severity="yellow", details="Name is too short to be trustworthy.")
                else:
                    _add_check(field, name="name_format", status="pass", severity="info", details="Name is present.")

            if name in {"dose", "quantity", "duration_days"}:
                if not re.search(r"\d", str(value).lower()):
                    _add_check(field, name="numeric_value", status="warn", severity="yellow", details="Numeric dose value is missing or ambiguous.")
                else:
                    _add_check(field, name="numeric_value", status="pass", severity="info", details="Numeric content is present.")

            if name == "drug_name" and "name" in section:
                pass

            if not field.checks:
                _add_check(field, name="default_rule", status="pass", severity="info", details="Field is populated and accepted by the default policy.")

            if any(check.severity == "red" for check in field.checks):
                field.triage = "red"
            elif any(check.severity == "yellow" for check in field.checks):
                field.triage = "yellow"
            else:
                field.triage = "green"

    drug_name = order.drug.get("name")
    if drug_name and drug_name.value:
        strength = order.drug.get("strength")
        rx = match_rxnorm(drug_name.value, strength.value if strength else None, form=None)
        if not rx["matched"]:
            _add_check(drug_name, name="rxnorm_match", status="warn", severity="yellow", details=rx["reason"])
            drug_name.triage = "yellow"
        else:
            _add_check(drug_name, name="rxnorm_match", status="pass", severity="info", details=rx["reason"])

    sig = order.sig.get("frequency") or order.sig.get("dose")
    if sig and sig.value:
        sig_result = validate_sig_structure(sig.value)
        if not sig_result["valid"]:
            _add_check(sig, name="sig_structure", status="warn", severity="yellow", details=sig_result["reason"])
            sig.triage = "yellow"
        else:
            _add_check(sig, name="sig_structure", status="pass", severity="info", details=sig_result["reason"])

    if order.written_date is not None:
        written = order.written_date
        if not _is_valid_date(written.value):
            written.checks = [Check(name="written_date", status="warn", severity="yellow", details="Written date is missing or not ISO-formatted.")]
            written.reasons = ["Written date is missing or not ISO-formatted."]
            written.triage = "yellow"
        else:
            written.checks = [Check(name="written_date", status="pass", severity="info", details="Written date is present and ISO-formatted.")]
            written.reasons = ["Written date is present and ISO-formatted."]
            written.triage = "green"

    order.status = "needs_review"
    return order
