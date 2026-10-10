import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.environ.get("NICRRON_API_KEY")
base_url = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.com/v1")
model = os.environ.get("NICRRON_MODEL", "gpt-5.4-mini")

if not api_key:
    raise ValueError("NICRRON_API_KEY is missing. Add it to your .env file.")

client = OpenAI(
    api_key=api_key,
    base_url=base_url,
)

response = client.chat.completions.create(
    model=model,
    messages=[
        {"role": "system", "content": "You are a coding assistant that talks like a pirate."},
        {"role": "user", "content": "How do I check if a Python object is an instance of a class?"},
    ],
    temperature=0.7,
    max_tokens=200,
)

print(response.choices[0].message.content)




