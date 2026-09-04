from __future__ import annotations

import csv
from pathlib import Path
from typing import Any


LIST_FIELDS = {"preliminary_dates", "final_dates", "eligibility", "competition_type"}


def _split(value: str) -> list[str]:
    return [part.strip() for part in value.split("|") if part.strip()]


def load_manual_events(path: Path, checked_at: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row_number, row in enumerate(csv.DictReader(handle), start=2):
            if not any((value or "").strip() for value in row.values()):
                continue
            event: dict[str, Any] = {key: (value or "").strip() or None for key, value in row.items()}
            for field in LIST_FIELDS:
                event[field] = _split(row.get(field, ""))
            membership = (row.get("association_membership_required") or "").strip().lower()
            event["association_membership_required"] = True if membership in {"true", "1", "yes", "필요"} else False if membership in {"false", "0", "no", "불필요"} else None
            event["attachments"] = [
                {"name": f"수동 첨부 {index + 1}", "url": url, "type": url.rsplit(".", 1)[-1].lower().split("?", 1)[0]}
                for index, url in enumerate(_split(row.get("attachment_urls", "")))
            ]
            event.pop("attachment_urls", None)
            event["last_checked_at"] = checked_at
            event["source_type"] = "수동등록"
            event["status"] = event.get("status") or "접수 예정"
            for field in ("city", "capacity", "eligibility_notes", "fee", "organizer", "host", "contact", "registration_method", "registration_url", "announcement_date"):
                event.setdefault(field, None)
            if not event.get("id"):
                raise ValueError(f"manual_events.csv {row_number}행: id가 없습니다.")
            events.append(event)
    return events
