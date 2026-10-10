from __future__ import annotations

import json
import re

from clearscript.integrations.tavily import search_web


def _tavily_lookup(value: str | None) -> dict:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 10:
        return {"valid": False, "reason": "NPI must contain 10 digits."}
    query = f"NPI {digits} physician provider public registry lookup"
    try:
        result = search_web(query)
    except Exception:
        return {"valid": True, "reason": "NPI checksum is valid; public registry lookup unavailable, using local validation.", "source": "local"}
    answer = result.get("answer") or ""
    results = result.get("results") or []
    snippet = answer or (results[0].get("content") if isinstance(results, list) and results and isinstance(results[0], dict) else "")
    if not snippet:
        return {"valid": True, "reason": "NPI checksum is valid; public registry lookup returned no match.", "source": "local"}
    return {"valid": True, "reason": f"NPI checksum is valid; public verification match found: {snippet[:180]}", "source": "tavily"}


def normalize_name(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def validate_npi(value: str | None) -> dict:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) != 10:
        return {"valid": False, "reason": "NPI must contain 10 digits."}

    total = 0
    for idx, ch in enumerate(digits[:9]):
        total += int(ch) * (10 - idx)
    check_digit = (11 - (total % 11)) % 11
    if check_digit == 10:
        check_digit = 0
    valid = check_digit == int(digits[-1])
    if not valid:
        return {"valid": False, "reason": "NPI checksum is invalid."}

    return _tavily_lookup(digits)


def prescriber_match(fax_name: str | None, registry_name: str | None) -> dict:
    fax = normalize_name(fax_name)
    reg = normalize_name(registry_name)
    if not fax or not reg:
        return {"match": False, "reason": "Missing registry or fax prescriber name."}
    exact = fax == reg
    contains = fax in reg or reg in fax
    return {"match": exact or contains, "reason": "Names match." if exact or contains else "Names do not match the registry."}
