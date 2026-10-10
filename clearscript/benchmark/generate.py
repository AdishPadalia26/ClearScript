from __future__ import annotations

import json
from pathlib import Path

try:
    from faker import Faker
except ModuleNotFoundError:  # pragma: no cover - exercised when optional dev deps are absent
    Faker = None  # type: ignore[assignment]

from clearscript.core.schema import Field, PrescriptionOrder
from clearscript.pipeline.triage.scorer import triage
from clearscript.pipeline.verify.rules import verify

class _FallbackFaker:
    def __init__(self) -> None:
        self._idx = 0

    def name(self) -> str:
        names = ["Jordan Lee", "Avery Chen", "Morgan Patel", "Riley Brooks", "Taylor Nguyen"]
        value = names[self._idx % len(names)]
        self._idx += 1
        return value

    def date_of_birth(self, *, minimum_age: int, maximum_age: int):
        from datetime import date

        return date(1984, 5, 2)

    def date_between(self, *, start_date: str, end_date: str):
        from datetime import date

        return date(2026, 10, 9)


fake = Faker() if Faker is not None else _FallbackFaker()


def _field(value: str | None, name: str) -> Field:
    return Field(name=name, value=value)


def _truth_from_order(order: PrescriptionOrder) -> dict:
    truth = {
        "fax_id": order.fax_id,
        "patient": {},
        "drug": {},
        "sig": {},
        "prescriber": {},
    }
    for section_name, section in {
        "patient": order.patient,
        "drug": order.drug,
        "sig": order.sig,
        "prescriber": order.prescriber,
    }.items():
        for key, field in section.items():
            truth[section_name][key] = field.value
    if order.written_date is not None:
        truth["written_date"] = order.written_date.value
    return truth


def generate_synthetic_order(fax_id: str, *, risky: bool = False) -> PrescriptionOrder:
    name = fake.name()
    patient_name = name
    patient_dob = fake.date_of_birth(minimum_age=18, maximum_age=85).isoformat()
    drug_name = "amoxicillin" if not risky else "hydralazine"
    strength = "500mg" if not risky else "50mg"
    frequency = "twice daily" if not risky else "every 8 hours"
    quantity = "30" if not risky else "5"
    prescriber_name = fake.name()
    npi = "1000000001"
    dea = "AB1234563"

    return PrescriptionOrder(
        order_id=f"order-{fax_id}",
        fax_id=fax_id,
        patient={
            "name": _field(patient_name, "name"),
            "dob": _field(patient_dob, "dob"),
        },
        drug={
            "name": _field(drug_name, "name"),
            "strength": _field(strength, "strength"),
            "quantity": _field(quantity, "quantity"),
        },
        sig={
            "dose": _field("1 tablet", "dose"),
            "frequency": _field(frequency, "frequency"),
            "duration_days": _field("10 days", "duration_days"),
        },
        prescriber={
            "name": _field(prescriber_name, "name"),
            "npi": _field(npi, "npi"),
            "dea": _field(dea, "dea"),
        },
        written_date=_field(fake.date_between(start_date="-30d", end_date="today").isoformat(), "written_date"),
    )


def write_synthetic_cases(count: int = 5, out_dir: str | Path = "benchmark/data") -> list[PrescriptionOrder]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    orders: list[PrescriptionOrder] = []
    for idx in range(1, count + 1):
        fax_id = f"synthetic-fax-{idx:03d}"
        order = generate_synthetic_order(fax_id, risky=(idx % 3 == 0))
        orders.append(order)
        payload = order.model_dump(mode="json")
        (out / f"{fax_id}.json").write_text(json.dumps(payload, indent=2))
        truth = _truth_from_order(order)
        (out / f"{fax_id}.truth.json").write_text(json.dumps(truth, indent=2))
    return orders


def verify_synthetic_workflow(orders: list[PrescriptionOrder] | None = None) -> list[PrescriptionOrder]:
    if orders is None:
        orders = write_synthetic_cases()

    verified: list[PrescriptionOrder] = []
    for order in orders:
        step1 = verify(order)
        step2 = triage(step1)
        verified.append(step2)
    return verified


def generate_demo_truth() -> dict:
    return {
        "fax_id": "demo-fax-001",
        "patient": {"name": "J. Doe", "dob": "1986-05-02"},
        "drug": {"name": "metformin", "strength": "500mg"},
        "sig": {"raw": "1 tablet by mouth twice daily"},
        "prescriber": {"name": "Dr. Lee", "npi": "8084012345"},
    }


def write_demo_fixture() -> Path:
    out_dir = Path("data/fixtures")
    out_dir.mkdir(parents=True, exist_ok=True)
    truth = generate_demo_truth()
    output = out_dir / "demo_truth.json"
    output.write_text(json.dumps(truth, indent=2))
    return output


if __name__ == "__main__":
    cases = write_synthetic_cases(count=5)
    run = verify_synthetic_workflow(cases)
    print(json.dumps(
        [{
            "fax_id": order.fax_id,
            "status": order.status,
            "fields": {
                name: {
                    "triage": field.triage,
                    "confidence": field.confidence,
                    "reasons": field.reasons,
                    "checks": [c.model_dump(mode='json') for c in field.checks],
                }
                for section in (order.patient, order.drug, order.sig, order.prescriber)
                for name, field in section.items()
            },
        } for order in run], indent=2))
