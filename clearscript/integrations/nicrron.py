import base64
import os

from openai import OpenAI


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def get_nicrron_client() -> OpenAI:
    return OpenAI(
        api_key=require_env("NICRRON_API_KEY"),
        base_url=os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1"),
    )


def read_text_with_nicrron(
    prompt: str,
    *,
    model: str = "nicrron/auto",
    client: OpenAI | None = None,
) -> str:
    client_obj = client or get_nicrron_client()
    resp = client_obj.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content or ""


def read_image_with_nicrron(
    image_path: str,
    prompt: str,
    *,
    model: str = "nicrron/auto",
    client: OpenAI | None = None,
) -> str:
    client_obj = client or get_nicrron_client()

    with open(image_path, "rb") as f:
        image_bytes = f.read()

    data_url = f"data:image/png;base64,{base64.b64encode(image_bytes).decode('utf-8')}"

    resp = client_obj.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url},
                    },
                ],
            }
        ],
    )
    return resp.choices[0].message.content or ""
