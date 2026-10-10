from __future__ import annotations

import json
import os
from urllib.request import Request, urlopen

from dotenv import load_dotenv
try:
    from prismtrace import PRISMtrace
except ImportError:
    PRISMtrace = None

load_dotenv()

PRISM_CLIENT = None
try:
    if PRISMtrace is not None:
        PRISM_CLIENT = PRISMtrace(
            api_key=os.environ["PRISMTRACE_API_KEY"],
            host=os.environ.get("PRISMTRACE_HOST", "https://prism-api-prod.up.railway.app"),
            project_id=os.environ["PRISMTRACE_PROJECT_ID"],
        )
except KeyError:
    PRISM_CLIENT = None


def _trace_tavily_call(query: str, result: dict, *, kind: str) -> None:
    if PRISM_CLIENT is None:
        return
    PRISM_CLIENT.trace_llm(
        model=f"tavily/{kind}",
        input_messages=[{"role": "user", "content": query}],
        output=json.dumps(result, default=str)[:4000],
        latency_ms=0,
        agent_id="public-check-agent",
        agent_name="public-verification-agent",
        session_id="public-check-session",
        metadata={"source": "tavily", "kind": kind},
    )


def require_tavily_key() -> str:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("Missing TAVILY_API_KEY in environment.")
    return api_key


def _safe_query_text(*parts: str) -> str:
    safe = []
    for part in parts:
        if not part:
            continue
        cleaned = part.strip()
        if not cleaned:
            continue
        if any(token in cleaned.lower() for token in ["dob", "mrn", "patient", "ssn", "address", "phone"]):
            continue
        safe.append(cleaned)
    return " ".join(safe)


def search_web(query: str) -> dict:
    api_key = require_tavily_key()
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": api_key,
        "query": query,
        "max_results": 3,
        "include_answer": True,
        "include_raw_content": False,
    }
    req = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=20) as response:
        data = response.read().decode("utf-8")
    result = json.loads(data)
    _trace_tavily_call(query, result, kind="search")
    return result


def lookup_callback(prescriber_name: str, *, practice_name: str | None = None) -> dict:
    q = _safe_query_text(
        prescriber_name,
        practice_name or "",
        "phone number office clinic",
        "public practice contact",
    )
    try:
        result = search_web(q)
    except Exception as exc:
        return {
            "number": None,
            "source": "local-fallback",
            "agreement": False,
            "query": q,
            "error": str(exc),
        }
    answers = result.get("answer") or result.get("results") or []
    top = answers[0] if isinstance(answers, list) and answers else {}
    payload = {
        "number": top.get("phone") or top.get("contact") or None,
        "source": top.get("source") or "tavily",
        "agreement": bool(top.get("phone") or top.get("contact")),
        "query": q,
    }
    _trace_tavily_call(q, payload, kind="callback_lookup")
    return payload


def drug_safety_badge(drug_name: str) -> dict:
    q = _safe_query_text(drug_name, "FDA safety notice shortage public update")
    try:
        result = search_web(q)
    except Exception as exc:
        return {
            "drug": drug_name,
            "query": q,
            "result": {"error": str(exc)},
            "source": "local-fallback",
        }
    payload = {
        "drug": drug_name,
        "query": q,
        "result": result,
    }
    _trace_tavily_call(q, payload, kind="drug_safety")
    return payload
