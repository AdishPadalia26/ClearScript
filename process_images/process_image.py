import base64
import mimetypes
import os
import time

from dotenv import load_dotenv
from openai import OpenAI

try:
    from prismtrace import PRISMtrace
except ImportError:
    PRISMtrace = None

from .datamodels import Prescription

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


def load_image(path):
    mime_type = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as image_file:
        image_data = base64.b64encode(image_file.read()).decode("utf-8")
    return f"data:{mime_type};base64,{image_data}"


def _trace_extraction(model: str, image_path: str, output: str, latency_ms: int) -> None:
    if PRISM_CLIENT is None:
        return
    PRISM_CLIENT.trace_llm(
        model=model,
        input_messages=[{"role": "user", "content": f"Read prescription image={image_path} into Prescription schema."}],
        output=output[:4000],
        latency_ms=latency_ms,
        agent_id="fax-image-extraction-agent",
        agent_name="cleanup-prescription-extraction-agent",
        session_id=f"fax-upload-{os.path.basename(image_path)}",
        metadata={"source": "nicrron", "kind": "image_prescription_extraction"},
    )


def extract_prescription(path):
    api_key = os.environ.get("NICRRON_API_KEY")
    base_url = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1")
    model = os.environ.get("NICRRON_MODEL", "openai/gpt-5.6-terra")

    if not api_key:
        raise ValueError("NICRRON_API_KEY is missing. Add it to your .env file.")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        timeout=45,
    )

    start = time.perf_counter()
    response = client.chat.completions.parse(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "Extract the prescription into the supplied Prescription schema. "
                    "Transcribe only information visible in the image; do not guess or infer missing details. "
                    "Use null for missing or illegible scalar values and confidence/reasoning when unknown. "
                    "Keep medication strength, dose per administration, frequency, and treatment duration distinct. "
                    "Do not put total quantity dispensed in dose or combine duration with frequency. "
                    "Set signature_present only when a handwritten prescriber signature is visibly present. "
                    "Return every schema field and no additional fields."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Read this prescription image and fill the Prescription schema.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": load_image(path)},
                    },
                ],
            },
        ],
        response_format=Prescription,
        temperature=0.2,
        max_tokens=1800,
    )
    latency_ms = int((time.perf_counter() - start) * 1000)

    result = response.choices[0].message.parsed
    if result is None:
        raise ValueError("NICRRON returned no parsed Prescription object.")
    _trace_extraction(model, path, result.model_dump_json(), latency_ms)
    return result
