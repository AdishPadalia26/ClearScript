import base64
import mimetypes
import os

from dotenv import load_dotenv
from openai import OpenAI

from .datamodels import Prescription

load_dotenv()


def load_image(path):
    mime_type = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as image_file:
        image_data = base64.b64encode(image_file.read()).decode("utf-8")
    return f"data:{mime_type};base64,{image_data}"


def extract_prescription(path):
    api_key = os.environ.get("NICRRON_API_KEY")
    base_url = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.com/v1")
    model = os.environ.get("NICRRON_MODEL", "gpt-5.4-mini")

    if not api_key:
        raise ValueError("NICRRON_API_KEY is missing. Add it to your .env file.")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

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
        temperature=0.1,
        max_tokens=1800,
    )

    result = response.choices[0].message.parsed
    if result is None:
        raise ValueError("NICRRON returned no parsed Prescription object.")
    return result
