#!/usr/bin/env python3
import json
import os
import sys
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def check_prism() -> tuple[bool, str]:
    try:
        project_id = require_env("PRISMTRACE_PROJECT_ID")
        api_key = require_env("PRISMTRACE_API_KEY")
        host = os.environ.get("PRISMTRACE_HOST", "https://prism-api-prod.up.railway.app")

        url = f"{host}/api/setup-doctor?project_id={project_id}"
        req = urllib.request.Request(url, headers={"X-PRISMtrace-Key": api_key})
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read().decode("utf-8")
        payload = json.loads(body)

        ok = bool(payload.get("credential_ok")) and bool(payload.get("live_connected"))
        status = payload.get("overall", "unknown")
        if ok:
            return True, f"PRISM OK: overall={status}, live_connected={payload.get('live_connected')}, last trace count={payload.get('live_trace_count')}"
        return False, f"PRISM not fully connected: overall={status}, response={payload}"
    except Exception as exc:  # pragma: no cover
        return False, f"PRISM check failed: {exc}"


def check_nicrron() -> tuple[bool, str]:
    try:
        from openai import OpenAI

        api_key = require_env("NICRRON_API_KEY")
        base_url = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1")

        client = OpenAI(api_key=api_key, base_url=base_url)
        resp = client.chat.completions.create(
            model="nicrron/auto",
            messages=[{"role": "user", "content": "Say hello from Nicrron."}],
            max_tokens=16,
        )
        text = resp.choices[0].message.content or ""
        return True, f"Nicrron OK: {text.strip()[:80]}"
    except Exception as exc:  # pragma: no cover
        return False, f"Nicrron check failed: {exc}"


def main() -> int:
    print("Running repo readiness checks...\n")

    checks = [
        ("PRISM", check_prism),
        ("Nicrron", check_nicrron),
    ]

    all_ok = True
    for name, fn in checks:
        try:
            ok, detail = fn()
        except Exception as exc:  # pragma: no cover
            ok = False
            detail = str(exc)
        print(f"[{name}] {'PASS' if ok else 'FAIL'}: {detail}")
        print()
        all_ok = all_ok and ok

    if not all_ok:
        print("One or more checks failed. Fill in the missing env values and retry.")
        return 1

    print("Repo is ready for the required tools.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
