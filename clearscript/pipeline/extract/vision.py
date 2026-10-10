import asyncio
import os
import time
from typing import Literal

from prismtrace import PRISMtrace

from clearscript.core.schema import Evidence, Read
from clearscript.integrations.nicrron import read_image_with_nicrron


PRISM_CLIENT = None
try:
    PRISM_CLIENT = PRISMtrace(
        api_key=os.environ["PRISMTRACE_API_KEY"],
        host=os.environ.get("PRISMTRACE_HOST", "https://prism-api-prod.up.railway.app"),
        project_id=os.environ["PRISMTRACE_PROJECT_ID"],
    )
except KeyError:
    PRISM_CLIENT = None


def _trace_nicrron_call(model_name: str, prompt: str, image_path: str, value: str) -> None:
    if PRISM_CLIENT is None:
        return

    PRISM_CLIENT.trace_llm(
        model=model_name,
        input_messages=[{"role": "user", "content": f"{prompt}\nimage={image_path}"}],
        output=value,
        latency_ms=0,
        agent_id="fax-extraction-agent",
        agent_name="document-processing-agent",
        session_id="fax-extraction-session",
        metadata={"source": "nicrron", "kind": "vision_read"},
    )


async def read_field_with_nicrron(
    image_path: str,
    field_name: str,
    *,
    model: str = "nicrron/auto",
    prompt_override: str | None = None,
) -> Read:
    start = time.perf_counter()
    prompt = prompt_override or (
        f"Extract the prescription field '{field_name}' from this image. "
        "Return only the exact value as plain text, with a brief note if uncertain."
    )
    value = read_image_with_nicrron(image_path, prompt, model=model)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    _trace_nicrron_call(model, prompt, image_path, value)

    return Read(
        source="model_a",
        value=value.strip() or None,
        evidence=Evidence(
            page=1,
            bbox=(0.0, 0.0, 0.0, 0.0),
            text_seen=value,
        ),
        ocr_confidence=None,
    )


async def extract_three_model_reads(image_path: str, field_name: str) -> list[Read]:
    models: list[tuple[Literal["model_a", "model_b", "model_c"], str]] = [
        ("model_a", "nicrron/auto"),
        ("model_b", "anthropic/claude-sonnet-5"),
        ("model_c", "openai/gpt-5.5"),
    ]

    async def _run(source: Literal["model_a", "model_b", "model_c"], model: str) -> Read:
        value = await read_field_with_nicrron(image_path, field_name, model=model)
        value.source = source
        return value

    return await asyncio.gather(*[_run(source, model) for source, model in models])


async def demo_extract() -> list[Read]:
    return await extract_three_model_reads("data/fixtures/demo_fax.png", "drug_strength")
