from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from collectors.kpga import KpgaCollector  # noqa: E402
from collectors.manual import load_manual_events  # noqa: E402
from scripts.validation import domain_errors  # noqa: E402

KST = ZoneInfo("Asia/Seoul")
OUTPUT = ROOT / "public" / "data" / "events.json"
SCHEMA = ROOT / "schema" / "events.schema.json"


def normalize_name(name: str) -> str:
    return re.sub(r"[^0-9a-z가-힣]", "", name.lower())


def deduplicate(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for event in events:
        key = (normalize_name(event["name"]), event["region"], event["event_start"])
        current = grouped.get(key)
        if current is None:
            grouped[key] = event
            continue
        preferred, secondary = (event, current) if event["source_type"] == "자동수집" and current["source_type"] != "자동수집" else (current, event)
        for field, value in secondary.items():
            if field in {"attachments", "eligibility", "competition_type", "preliminary_dates", "final_dates"}:
                preferred[field] = list(dict.fromkeys([*(preferred.get(field) or []), *(value or [])]))
            elif preferred.get(field) in {None, "", "확인 필요"} and value not in {None, ""}:
                preferred[field] = value
        grouped[key] = preferred
    return sorted(grouped.values(), key=lambda event: (event["event_start"], event["name"]))


def validate(payload: dict[str, Any]) -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload), key=lambda error: list(error.path))
    messages = [f"{'/'.join(map(str, error.path)) or '<root>'}: {error.message}" for error in errors]
    messages.extend(domain_errors(payload))
    if messages:
        raise ValueError("데이터 스키마 검증 실패\n" + "\n".join(messages))


def main() -> int:
    now = datetime.now(KST).isoformat(timespec="seconds")
    config = yaml.safe_load((ROOT / "sources.yml").read_text(encoding="utf-8"))
    existing = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"events": []}
    collected: list[dict[str, Any]] = []
    statuses: list[dict[str, str]] = []

    for source in config["sources"]:
        if source["mode"] == "manual_required":
            statuses.append({
                "id": source["id"], "name": source["name"], "status": "manual_required",
                "last_checked_at": now, "message": source["notes"], "url": source["url"],
            })
            continue
        try:
            if source["collector"] != "kpga":
                raise ValueError(f"알 수 없는 수집기: {source['collector']}")
            result = KpgaCollector(source, now).collect()
            collected.extend(result.events)
            statuses.append({
                "id": source["id"], "name": source["name"], "status": result.status,
                "last_checked_at": now, "message": result.message, "url": source["url"],
            })
        except Exception as error:  # 출처 하나의 실패가 전체 정상 데이터를 지우지 않게 합니다.
            preserved = [event for event in existing.get("events", []) if event.get("source_id") == source["id"]]
            collected.extend(preserved)
            statuses.append({
                "id": source["id"], "name": source["name"], "status": "failed",
                "last_checked_at": now, "message": f"수집 실패, 이전 데이터 {len(preserved)}건 보존: {type(error).__name__}: {error}", "url": source["url"],
            })
            print(f"[WARN] {source['id']}: {type(error).__name__}: {error}", file=sys.stderr)

    collected.extend(load_manual_events(ROOT / "data" / "manual_events.csv", now))
    events = deduplicate(collected)
    payload = {
        "meta": {
            "generated_at": now,
            "timezone": "Asia/Seoul",
            "event_count": len(events),
            "source_statuses": statuses,
        },
        "events": events,
    }
    validate(payload)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if OUTPUT.exists() and OUTPUT.read_text(encoding="utf-8") == serialized:
        print("변경 없음: 기존 events.json을 유지합니다.")
        return 0
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(serialized, encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"수집 완료: {len(events)}건, 출처 {len(statuses)}곳")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
