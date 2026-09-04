from __future__ import annotations

import io
import re
from datetime import date, timedelta
from typing import Any

import requests
from pypdf import PdfReader


DATE_PATTERN = re.compile(r"(?:(20\d{2})\s*[년./-]\s*)?(\d{1,2})\s*[월./-]\s*(\d{1,2})\s*일?")


def _dates(text: str, default_year: int) -> list[str]:
    values: list[str] = []
    year = default_year
    for match in DATE_PATTERN.finditer(text):
        if match.group(1):
            year = int(match.group(1))
        try:
            value = date(year, int(match.group(2)), int(match.group(3))).isoformat()
        except ValueError:
            continue
        if value not in values:
            values.append(value)
    return values


def _segment(text: str, start_patterns: list[str], stop_patterns: list[str], limit: int = 700) -> str:
    starts = [match for pattern in start_patterns if (match := re.search(pattern, text))]
    if not starts:
        return ""
    start = min(starts, key=lambda match: match.start()).end()
    tail = text[start:start + limit]
    stops = [match.start() for pattern in stop_patterns if (match := re.search(pattern, tail))]
    return tail[:min(stops)] if stops else tail


def extract_pdf_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=(10, 45), headers={"Accept": "application/pdf,*/*"})
    response.raise_for_status()
    reader = PdfReader(io.BytesIO(response.content))
    return " ".join((page.extract_text() or "") for page in reader.pages)


def enrich_from_pdf(event: dict[str, Any], text: str) -> dict[str, Any]:
    normalized = re.sub(r"[\t\r]+", " ", text)
    year = int(event["event_start"][:4])
    original_start = date.fromisoformat(event["event_start"])
    original_end = date.fromisoformat(event["event_end"])
    announcement = date.fromisoformat(event["announcement_date"]) if event.get("announcement_date") else original_start - timedelta(days=90)
    lower_bound = max(announcement, original_start - timedelta(days=90))
    excluded = {
        value[:10]
        for value in (event.get("registration_start"), event.get("registration_end"))
        if value
    }
    excluded.update(_dates(event.get("eligibility_notes") or "", year))

    preliminary_zone = _segment(
        normalized,
        [r"일정\s*및\s*장소", r"예\s*선(?:전|\s|\d|:)"],
        [r"결\s*(?:선|승전)", r"참가\s*대상"],
        1100,
    )
    final_zone = _segment(
        normalized,
        [r"결\s*(?:선|승전)(?:\s*\d+회)?\s*[:：]?"],
        [r"참가\s*대상", r"대회\s*장소", r"참가\s*인원"],
        260,
    )
    raw_preliminary_dates = [
        value for value in _dates(preliminary_zone, year)
        if lower_bound <= date.fromisoformat(value) <= original_end and value not in excluded
    ]
    final_dates = [
        value for value in _dates(final_zone, year)
        if original_end - timedelta(days=14) <= date.fromisoformat(value) <= original_end and value not in excluded
    ]
    preliminary_cutoff = min((date.fromisoformat(value) for value in final_dates), default=original_start)
    preliminary_dates = [value for value in raw_preliminary_dates if date.fromisoformat(value) < preliminary_cutoff]
    event["preliminary_dates"] = list(dict.fromkeys([*event.get("preliminary_dates", []), *preliminary_dates]))
    event["final_dates"] = list(dict.fromkeys([*event.get("final_dates", []), *final_dates]))

    known_dates = [event["event_start"], event["event_end"], *event["preliminary_dates"], *event["final_dates"]]
    event["event_start"] = min(known_dates)
    event["event_end"] = max(known_dates)

    capacity = re.search(r"참가\s*인원\s*:\s*([약\s]*[0-9,]+명(?:\s*\([^)]{1,100}\))?)", normalized)
    if capacity:
        event["capacity"] = re.sub(r"\s+", " ", capacity.group(1)).strip()

    fee_patterns = [
        r"참\s*가\s*비\s*:\s*(예선\s*참가\s*\[?1인\]?당\s*[0-9,]+원\s*/\s*결선\s*\[?1인\]?당\s*[0-9,]+원)",
        r"참\s*가\s*비\s*:\s*(예선\s*[0-9,]+원\s*,?\s*결선\s*[0-9,]+원)",
        r"참\s*가\s*비\s*:\s*(?:1인당\s*)?([0-9,]+원)",
    ]
    for pattern in fee_patterns:
        fee = re.search(pattern, normalized)
        if fee:
            event["fee"] = re.sub(r"\s+", " ", fee.group(1)).strip()
            break

    competition_types = []
    if re.search(r"개인전|개인\s*타수", normalized):
        competition_types.append("개인전")
    if re.search(r"단체전|팀별\s*타수", normalized):
        competition_types.append("단체전")
    if competition_types:
        event["competition_type"] = competition_types

    target = re.search(r"참가\s*대상\s*:\s*(.{1,220}?)(?=참가\s*인원|참\s*가\s*비|[마바사아자차카타파하]\.)", normalized)
    if target:
        event["eligibility_notes"] = re.sub(r"\s+", " ", target.group(1)).strip()

    contact = re.search(
        r"(?:문\s*의(?:사항)?|문의전화)\s*:\s*(?:☎\s*)?(\d{2,4}-\d{3,4}-\d{4}(?:\s*[,~]\s*\d{3,4})?)",
        normalized,
    )
    if contact:
        event["contact"] = re.sub(r"\s+", " ", contact.group(1)).strip(" ,")

    if re.search(r"소속\s*[^.]{0,30}(?:통해|일괄\s*신청)|일괄\s*입금", normalized):
        event["registration_type"] = "소속 협회·기관 단체접수"
        if "클럽 단체접수" not in event["eligibility"]:
            event["eligibility"].append("클럽 단체접수")
    elif re.search(r"네이버\s*폼|선수\s*본인이\s*입력|인터넷\s*접수", normalized):
        event["registration_type"] = "개인접수"

    return event


def should_extract(event_end: str, today: date) -> bool:
    return date.fromisoformat(event_end) >= today - timedelta(days=30)
