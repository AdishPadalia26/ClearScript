import sys
from pathlib import Path

from process_images import extract_prescription


def main():
    sample_dir = Path(__file__).parent / "sample_data"
    output_dir = Path(__file__).parent / "sample_output"
    output_dir.mkdir(exist_ok=True)

    image_files = sorted(sample_dir.iterdir())
    for image_path in image_files:
        if not image_path.is_file():
            continue

        result = extract_prescription(str(image_path))
        output_path = output_dir / f"{image_path.stem}.json"
        output_path.write_text(result.model_dump_json(indent=2) + "\n")
        print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
