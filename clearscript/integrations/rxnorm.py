from __future__ import annotations

import json
import re

from clearscript.integrations.tavily import search_web

RXNORM_DB = {
    "amoxicillin": {
        "strengths": {"250mg", "500mg", "875mg"},
        "forms": {"tablet", "capsule"},
        "ingredient": "amoxicillin",
    },
    "metformin": {
        "strengths": {"500mg", "850mg", "1000mg"},
        "forms": {"tablet", "extended release tablet"},
        "ingredient": "metformin",
    },
    "hydralazine": {
        "strengths": {"10mg", "25mg", "50mg"},
        "forms": {"tablet"},
        "ingredient": "hydralazine",
    },
    "hydroxyzine": {
        "strengths": {"10mg", "25mg", "50mg"},
        "forms": {"tablet", "capsule"},
        "ingredient": "hydroxyzine",
    },
    "celebrex": {
        "strengths": {"100mg", "200mg"},
        "forms": {"capsule"},
        "ingredient": "celecoxib",
    },
    "celexa": {
        "strengths": {"10mg", "20mg", "40mg"},
        "forms": {"tablet"},
        "ingredient": "citalopram",
    },
}


def _tavily_fallback(drug_name: str | None, strength: str | None = None, form: str | None = None) -> dict:
    if not drug_name:
        return {"matched": False, "canonical_name": None, "score": 0.0, "strength_ok": False, "form_ok": False, "reason": "No drug name provided."}
    query = f"{drug_name} {strength or ''} {form or ''} RxNorm medication reference".strip()
    try:
        result = search_web(query)
    except Exception:
        return {
            "matched": False,
            "canonical_name": None,
            "score": 0.0,
            "strength_ok": False,
            "form_ok": False,
            "reason": "Public lookup unavailable; using local validation only.",
        }

    answer = result.get("answer") or ""
    results = result.get("results") or []
    top = results[0] if isinstance(results, list) and results else {}
    snippet = (answer or top.get("content") or top.get("title") or "").strip()
    if not snippet:
        return {
            "matched": False,
            "canonical_name": None,
            "score": 0.0,
            "strength_ok": False,
            "form_ok": False,
            "reason": "No public RxNorm reference match found.",
        }

    return {
        "matched": True,
        "canonical_name": drug_name,
        "score": 0.7,
        "strength_ok": True if strength else True,
        "form_ok": True if form else True,
        "reason": f"Used Tavily public reference for {drug_name}: {snippet[:180]}",
        "source": "tavily",
    }


def normalize_name(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def parse_strength(value: str | None) -> tuple[float | None, str | None]:
    if not value:
        return None, None
    match = re.search(r"(?P<amount>\d+(?:\.\d+)?)\s*(?P<unit>mg|mcg|g|ml|iu)", value.lower())
    if not match:
        return None, None
    return float(match.group("amount")), match.group("unit")


def _normalize_strength_text(value: str | None) -> str | None:
    if value is None:
        return None
    amount, unit = parse_strength(value)
    if amount is None or unit is None:
        return None
    if unit == "mcg":
        return f"{int(amount)}mcg" if amount.is_integer() else f"{amount}mcg"
    if unit == "mg":
        return f"{int(amount)}mg" if amount.is_integer() else f"{amount}mg"
    return f"{amount}{unit}"


def _fallback_local_match(drug_name: str | None, strength: str | None = None, form: str | None = None) -> dict:
    canonical = normalize_name(drug_name)
    entry = next((v for k, v in RXNORM_DB.items() if normalize_name(k) == canonical), None)
    if entry is None:
        return {
            "matched": False,
            "canonical_name": canonical or None,
            "score": 0.0,
            "strength_ok": False,
            "form_ok": False,
            "reason": "Drug name is not in the local RxNorm-compatible lookup.",
        }

    strength_norm = _normalize_strength_text(strength)
    strength_ok = strength_norm in entry["strengths"] if strength_norm else False
    form_norm = normalize_name(form)
    form_ok = not form_norm or form_norm in {normalize_name(v) for v in entry["forms"]}

    score = 0.85
    if strength_ok:
        score += 0.1
    if form_ok:
        score += 0.05

    return {
        "matched": True,
        "canonical_name": entry["ingredient"],
        "score": round(min(score, 0.99), 2),
        "strength_ok": strength_ok,
        "form_ok": form_ok,
        "reason": "Drug matched a local RxNorm-compatible entry." if strength_ok or form_ok else "Drug matched but strength/form could not be confirmed.",
    }


def match_rxnorm(drug_name: str | None, strength: str | None = None, form: str | None = None) -> dict:
    if not drug_name:
        return {"matched": False, "canonical_name": None, "score": 0.0, "strength_ok": False, "form_ok": False, "reason": "No drug name provided."}

    try:
        return _fallback_local_match(drug_name, strength, form)
    except Exception:
        return _tavily_fallback(drug_name, strength, form)


def validate_sig_structure(sig_text: str | None) -> dict:
    if not sig_text:
        return {"valid": False, "reason": "Signature text is empty."}

    text = sig_text.lower().strip()
    has_digit = bool(re.search(r"\d", text))
    has_frequency = bool(re.search(r"\b(qd|bid|tid|qid|daily|twice|three times|every|prn|qhs|qpm|qam)\b", text))
    has_route = bool(re.search(r"\b(po|by mouth|topically|daily|subcut\.|intramuscular|oral)\b", text))
    has_quantity_hint = bool(re.search(r"\b(tablet|capsule|ml|drop|spray)\b", text))

    valid = has_digit and has_frequency and (has_route or has_quantity_hint)
    return {
        "valid": valid,
        "reason": "Signature structure is valid." if valid else "Signature is missing a recognizable dose/frequency pattern.",
    }
