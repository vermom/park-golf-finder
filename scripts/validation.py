from __future__ import annotations

from datetime import date
from typing import Any


def domain_errors(payload: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    events = payload.get("events", [])
    if payload.get("meta", {}).get("event_count") != len(events):
        errors.append("meta.event_count가 실제 events 개수와 다릅니다.")
    notices = payload.get("notices", [])
    if payload.get("meta", {}).get("notice_count") != len(notices):
        errors.append("meta.notice_count가 실제 notices 개수와 다릅니다.")
    if not isinstance(payload.get("meta", {}).get("matched_notice_count"), int):
        errors.append("meta.matched_notice_count가 정수가 아닙니다.")
    seen: set[str] = set()
    for index, event in enumerate(events):
        event_id = event.get("id", "")
        if event_id in seen:
            errors.append(f"events/{index}/id: 중복 ID {event_id}")
        seen.add(event_id)
        try:
            start = date.fromisoformat(event["event_start"])
            end = date.fromisoformat(event["event_end"])
            if start > end:
                errors.append(f"events/{index}: 개최 종료일이 시작일보다 빠릅니다.")
        except (KeyError, TypeError, ValueError):
            errors.append(f"events/{index}: 개최일이 올바른 YYYY-MM-DD가 아닙니다.")
        for field in ("preliminary_dates", "final_dates"):
            for value in event.get(field, []):
                try:
                    date.fromisoformat(value)
                except (TypeError, ValueError):
                    errors.append(f"events/{index}/{field}: 잘못된 날짜 {value}")
    notice_ids: set[str] = set()
    notice_urls: set[str] = set()
    for index, notice in enumerate(notices):
        if notice.get("id") in notice_ids:
            errors.append(f"notices/{index}/id: 중복 ID {notice.get('id')}")
        if notice.get("announcement_url") in notice_urls:
            errors.append(f"notices/{index}/announcement_url: 중복 링크 {notice.get('announcement_url')}")
        notice_ids.add(notice.get("id", ""))
        notice_urls.add(notice.get("announcement_url", ""))
    return errors
