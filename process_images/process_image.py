import base64
import json
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


def _field_value(value):
    return {
        "value": value,
        "confidence": None,
        "reasoning": None,
    }


def extract_prescription(path):
    api_key = os.environ.get("NICRRON_API_KEY")
    base_url = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1")
    model = os.environ.get("NICRRON_MODEL", "nicrron/auto")

    if not api_key:
        raise ValueError("NICRRON_API_KEY is missing. Add it to your .env file.")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract medication prescriptions from images and return only valid JSON. "
                    "If any field is missing, use null."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Extract the prescription details from this image and return valid JSON only.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": load_image(path)},
                    },
                ],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=1800,
    )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("Empty response from NICRRON API.")

    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
        cleaned = cleaned.strip()

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        payload = json.loads(cleaned.removeprefix("json").strip())

    medications = payload.get("medications", [])
    normalized = {
        "patient": {
            "name": _field_value(payload.get("patient_name")),
            "age": _field_value(payload.get("age")),
            "sex": _field_value(payload.get("sex")),
        },
        "doctor": {
            "name": _field_value(payload.get("physician_signature")),
            "specialty": _field_value(None),
            "registration_number": _field_value(None),
        },
        "medications": [
            {
                "name": _field_value(med.get("name")),
                "strength": _field_value(med.get("strength")),
                "dose": _field_value(med.get("quantity")),
                "frequency": _field_value(med.get("directions")),
                "duration": _field_value(None),
            }
            for med in medications
        ],
        "additional_information": {
            "prescription_date": payload.get("date"),
            "diagnosis": None,
            "notes": [med.get("brand") for med in medications if med.get("brand")],
            "signature_present": bool(payload.get("physician_signature")),
        },
    }

    return Prescription.model_validate(normalized)
