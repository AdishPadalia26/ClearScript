"""Validate the ClearScript API contract and fixture set.

Usage:
    python scripts/check_contract.py --spec-only
    python scripts/check_contract.py --app api.main:app
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "contracts" / "openapi.yaml"
FIXTURES_DIR = ROOT / "contracts" / "fixtures"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

FIXTURE_SCHEMAS = {
    "order-clean.json": "Order",
    "order-smudged.json": "Order",
    "order-controlled.json": "Order",
    "call-completed-confirmed.json": "Call",
    "call-no-answer.json": "Call",
    "metrics.json": "Metrics",
}


class ContractError(RuntimeError):
    """Raised when contract validation fails."""


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    if not isinstance(loaded, dict):
        raise ContractError(f"{path} did not load as an object")
    return loaded


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def schema_for(spec: dict[str, Any], name: str) -> dict[str, Any]:
    try:
        schema = spec["components"]["schemas"][name]
    except KeyError as exc:
        raise ContractError(f"OpenAPI schema missing: {name}") from exc
    if not isinstance(schema, dict):
        raise ContractError(f"OpenAPI schema {name} is not an object")
    return schema


def validate_fixture(spec: dict[str, Any], filename: str, schema_name: str) -> None:
    path = FIXTURES_DIR / filename
    if not path.exists():
        raise ContractError(f"Missing fixture: {path}")

    validation_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": f"#/components/schemas/{schema_name}",
        "components": spec["components"],
    }
    validator = jsonschema.Draft202012Validator(
        validation_schema,
        format_checker=jsonschema.Draft202012Validator.FORMAT_CHECKER,
    )

    errors = sorted(validator.iter_errors(load_json(path)), key=lambda err: list(err.path))
    if errors:
        detail = "\n".join(
            f"  - {filename}: {'/'.join(map(str, err.path)) or '<root>'}: {err.message}"
            for err in errors
        )
        raise ContractError(f"Fixture failed {schema_name} validation:\n{detail}")


def validate_spec_only() -> None:
    spec = load_yaml(SPEC_PATH)
    jsonschema.Draft202012Validator.check_schema(spec)

    for path in FIXTURES_DIR.glob("*.json"):
        if path.name not in FIXTURE_SCHEMAS:
            raise ContractError(f"Fixture has no schema mapping: {path.name}")

    for filename, schema_name in FIXTURE_SCHEMAS.items():
        validate_fixture(spec, filename, schema_name)


def import_app(import_path: str) -> Any:
    if ":" not in import_path:
        raise ContractError("--app must look like module.path:app")
    module_name, attr_name = import_path.split(":", 1)
    module = importlib.import_module(module_name)
    try:
        return getattr(module, attr_name)
    except AttributeError as exc:
        raise ContractError(f"{import_path} did not resolve to an app object") from exc


def compare_app_paths(import_path: str) -> None:
    spec = load_yaml(SPEC_PATH)
    app = import_app(import_path)
    if not hasattr(app, "openapi"):
        raise ContractError(f"{import_path} does not expose a FastAPI-like openapi() method")

    runtime_spec = app.openapi()
    expected = set(spec.get("paths", {}))
    actual = set(runtime_spec.get("paths", {}))
    for route in getattr(app, "routes", []):
        path = getattr(route, "path", None)
        if isinstance(path, str) and path in expected:
            actual.add(path)

    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing or extra:
        messages = []
        if missing:
            messages.append("Missing runtime paths: " + ", ".join(missing))
        if extra:
            messages.append("Unexpected runtime paths: " + ", ".join(extra))
        raise ContractError("; ".join(messages))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-only", action="store_true", help="Validate OpenAPI and fixtures only.")
    parser.add_argument("--app", help="Optional FastAPI import path to compare paths, for example api.main:app.")
    args = parser.parse_args()

    try:
        validate_spec_only()
        if args.app and not args.spec_only:
            compare_app_paths(args.app)
    except ContractError as exc:
        print(f"contract check failed: {exc}", file=sys.stderr)
        return 1

    print("contract check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
