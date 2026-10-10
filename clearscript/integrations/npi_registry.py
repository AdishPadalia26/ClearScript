from __future__ import annotations

import json
import re
from urllib.parse import quote
from urllib.request import Request, urlopen


def _fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "ClearScript/1.0"})
    with urlopen(req, timeout=20) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


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

    try:
        url = f"https://npiregistry.cms.hhs.gov/api/?number={digits}&enumeration_type=&taxonomy_description=&first_name=&last_name=&organization_name=&address_purpose=&city=&state=&postal_code=&limit=1&skip=0&version=2.1"
        payload = _fetch_json(url)
        results = payload.get("results") or []
        if not results:
            return {"valid": True, "reason": "NPI checksum is valid, but no registry match was returned.", "source": "local"}
        result = results[0]
        name = result.get("basic", {}).get("authorized_official", {}).get("name")
        return {"valid": True, "reason": f"NPI checksum is valid and registry match was found for {name or 'provider'}.", "source": "npi_registry"}
    except Exception:
        return {"valid": True, "reason": "NPI checksum is valid; registry lookup unavailable, using local validation.", "source": "local"}


def prescriber_match(fax_name: str | None, registry_name: str | None) -> dict:
    fax = normalize_name(fax_name)
    reg = normalize_name(registry_name)
    if not fax or not reg:
        return {"match": False, "reason": "Missing registry or fax prescriber name."}
    exact = fax == reg
    contains = fax in reg or reg in fax
    return {"match": exact or contains, "reason": "Names match." if exact or contains else "Names do not match the registry."}
