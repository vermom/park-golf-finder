from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests
from jsonschema import Draft202012Validator, FormatChecker

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.validation import domain_errors  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def validate_links(payload: dict) -> list[str]:
    errors: list[str] = []
    urls = set()
    for event in payload["events"]:
        urls.add(event["announcement_url"])
        if event.get("registration_url"):
            urls.add(event["registration_url"])
        urls.update(item["url"] for item in event.get("attachments", []))
    session = requests.Session()
    session.headers["User-Agent"] = "park-golf-finder/1.0 link-check"
    for url in sorted(urls):
        if urlparse(url).scheme not in {"http", "https"}:
            errors.append(f"허용되지 않은 링크 형식: {url}")
            continue
        try:
            response = session.get(url, timeout=(10, 30), allow_redirects=True, stream=True)
            if response.status_code >= 400:
                errors.append(f"HTTP {response.status_code}: {url}")
            response.close()
        except requests.RequestException as error:
            errors.append(f"{type(error).__name__}: {url}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-links", action="store_true")
    args = parser.parse_args()
    payload = json.loads((ROOT / "public" / "data" / "events.json").read_text(encoding="utf-8"))
    schema = json.loads((ROOT / "schema" / "events.schema.json").read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload), key=lambda error: list(error.path))
    for error in errors:
        print(f"ERROR {'/'.join(map(str, error.path))}: {error.message}", file=sys.stderr)
    logical_errors = domain_errors(payload)
    for error in logical_errors:
        print(f"ERROR {error}", file=sys.stderr)
    link_errors = validate_links(payload) if args.check_links else []
    for error in link_errors:
        print(f"LINK ERROR {error}", file=sys.stderr)
    if errors or logical_errors or link_errors:
        return 1
    print(f"검증 성공: {payload['meta']['event_count']}개 대회")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
