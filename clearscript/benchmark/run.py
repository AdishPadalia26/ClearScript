from __future__ import annotations

import json
from pathlib import Path


def _flatten_truth(data: dict) -> dict[str, str | None]:
    flat: dict[str, str | None] = {}
    for section_name in ("patient", "drug", "sig", "prescriber"):
        if isinstance(data.get(section_name), dict):
            for key, value in data[section_name].items():
                flat[f"{section_name}.{key}"] = value
    if "written_date" in data:
        flat["written_date"] = data["written_date"]
    return flat


def _flatten_order(order: dict) -> dict[str, str | None]:
    flat: dict[str, str | None] = {}
    for section_name in ("patient", "drug", "sig", "prescriber"):
        if isinstance(order.get(section_name), dict):
            for key, value in order[section_name].items():
                if isinstance(value, dict):
                    flat[f"{section_name}.{key}"] = value.get("value")
                else:
                    flat[f"{section_name}.{key}"] = value
    if isinstance(order.get("written_date"), dict):
        flat["written_date"] = order["written_date"].get("value")
    elif order.get("written_date") is not None:
        flat["written_date"] = order["written_date"]
    return flat


def run_benchmark(data_dir: str | Path = "benchmark/data") -> dict:
    data_path = Path(data_dir)
    truth_files = sorted(data_path.glob("*.truth.json"))
    if not truth_files:
        raise FileNotFoundError(f"No truth files found in {data_path}. Run python -m clearscript.benchmark.generate first.")

    total_fields = 0
    correct_fields = 0
    mismatches: list[dict[str, str]] = []

    for truth_file in truth_files:
        order_file = data_path / truth_file.name.replace(".truth", "")
        if not order_file.exists():
            continue

        with truth_file.open() as fh:
            truth = json.load(fh)
        with order_file.open() as fh:
            order = json.load(fh)

        truth_flat = _flatten_truth(truth)
        order_flat = _flatten_order(order)
        for key in sorted(set(truth_flat) | set(order_flat)):
            total_fields += 1
            expected = truth_flat.get(key)
            actual = order_flat.get(key)
            if expected == actual:
                correct_fields += 1
            else:
                mismatches.append({"field": key, "expected": str(expected), "actual": str(actual)})

    field_accuracy = correct_fields / total_fields if total_fields else 0.0
    metrics = {
        "silent_error_rate": 1.0 - field_accuracy,
        "field_accuracy": field_accuracy,
        "flag_rate": 0.0,
        "flag_precision": 1.0,
        "trap_catch_rate": 0.0,
        "ece": 0.0,
        "cost_per_fax": 0.0,
        "latency_ms": 0,
        "total_fields": total_fields,
        "correct_fields": correct_fields,
        "mismatches": mismatches[:10],
    }

    out = Path("benchmark")
    out.mkdir(exist_ok=True, parents=True)
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    return metrics


if __name__ == "__main__":
    print(run_benchmark())
