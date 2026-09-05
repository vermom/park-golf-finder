from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import requests

from .base import SourceResult
from .pdf_extract import enrich_from_pdf, extract_pdf_text, should_extract

KST = ZoneInfo("Asia/Seoul")
BASE_URL = "https://www.kpga7330.com"


def _date_only(value: str | None) -> str | None:
    if not value or value.strip() in {"-", "null", "None"}:
        return None
    return value[:10]


def _kst_datetime(value: str | None) -> str | None:
    if not value or value.strip() in {"-", "null", "None"}:
        return None
    cleaned = value.replace(" ", "T")
    parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed.astimezone(KST).isoformat(timespec="seconds")


def _region(value: str | None, venue: str) -> str:
    aliases = {
        "서울특별시": "서울", "서울시": "서울", "부산광역시": "부산", "부산시": "부산",
        "대구광역시": "대구", "대구시": "대구", "인천광역시": "인천", "인천시": "인천",
        "광주광역시": "광주", "광주시": "광주", "대전광역시": "대전", "대전시": "대전",
        "울산광역시": "울산", "울산시": "울산", "세종특별자치시": "세종", "세종시": "세종",
        "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원",
        "충청북도": "충북", "충청남도": "충남", "전북특별자치도": "전북", "전라북도": "전북",
        "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
    }
    text = (value or "").strip()
    if text in aliases:
        return aliases[text]
    for long_name, short_name in aliases.items():
        if long_name in text or long_name in venue:
            return short_name
    if text.endswith("시") and len(text) <= 4:
        text = text[:-1]
    return text


def _city(venue: str) -> str | None:
    match = re.search(r"(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원(?:특별자치도)?|충북|충남|전북(?:특별자치도)?|전남|경북|경남|제주(?:특별자치도)?)\s*([^\s()]+(?:시|군|구))", venue)
    return match.group(1) if match else None


def _eligibility(detail: dict[str, Any]) -> list[str]:
    values: list[str] = []
    if detail.get("membershipFeeStatus") == "PAID_ONLY":
        values.append("대한파크골프협회 회원")
    values.append("참가 자격 확인 필요")
    return values


class KpgaCollector:
    def __init__(self, source: dict[str, Any], checked_at: str):
        self.source = source
        self.checked_at = checked_at
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "park-golf-finder/1.0 (personal non-commercial index)",
            "Accept": "application/json",
            "x-user-tz": "Asia/Seoul",
        })

    def _json(self, url: str) -> dict[str, Any]:
        response = self.session.get(url, timeout=(10, 30))
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != "success":
            raise RuntimeError(payload.get("message") or "공식 API가 success를 반환하지 않았습니다.")
        return payload

    def collect(self) -> SourceResult:
        api_url = self.source["api_url"]
        payload = self._json(f"{api_url}?page=1&limit=100&order=desc")
        raw_events = payload.get("data")
        if not isinstance(raw_events, list):
            raise RuntimeError("공식 API data가 목록이 아닙니다.")

        events: list[dict[str, Any]] = []
        for item in raw_events:
            event_id = str(item["id"])
            detail = self._json(f"{api_url}/{event_id}").get("data", {})
            files = detail.get("files") or []
            event_start = _date_only(detail.get("start_at") or item.get("start_at"))
            event_end = _date_only(detail.get("end_at") or item.get("end_at"))
            if not event_start or not event_end:
                raise RuntimeError(f"{detail.get('name') or item.get('name')}: 개최일 누락")
            venue = (detail.get("venue") or item.get("venue") or "장소 확인 필요").strip()
            raw_status = detail.get("status") or item.get("status")
            event_url = f"{BASE_URL}/competitions/{event_id}/register"
            membership_required = True if detail.get("membershipFeeStatus") == "PAID_ONLY" else None
            events.append({
                "id": f"kpga-{event_id}",
                "name": (detail.get("name") or item.get("name") or "").strip(),
                "region": _region(detail.get("area") or item.get("area"), venue),
                "city": _city(venue),
                "venue": venue,
                "event_start": event_start,
                "event_end": event_end,
                "preliminary_dates": [],
                "final_dates": [],
                "registration_start": _kst_datetime(detail.get("registration_open_at") or item.get("registration_open_at")),
                "registration_end": _kst_datetime(detail.get("registration_close_at") or item.get("registration_close_at")),
                "status": "접수 예정",
                "capacity": None,
                "eligibility": _eligibility(detail),
                "eligibility_notes": (
                    f"협회 회비 납부 회원 기준일: {detail.get('eligibilityStartDate')}~{detail.get('eligibilityEndDate')}"
                    if membership_required and detail.get("eligibilityEndDate") else None
                ),
                "association_membership_required": membership_required,
                "registration_type": "개인접수 또는 소속 협회·클럽 접수 여부는 요강 확인",
                "competition_type": [],
                "fee": None if not detail.get("fee") else f"{int(detail['fee']):,}원",
                "organizer": detail.get("organizerName") or None,
                "host": detail.get("host") or None,
                "contact": None,
                "registration_method": "대한파크골프협회 홈페이지에서 대회 요강 확인 후 신청",
                "registration_url": event_url if raw_status in {"SCHEDULED", "OPEN"} else None,
                "announcement_url": event_url,
                "announcement_date": _date_only(detail.get("created_at") or item.get("created_at")),
                "last_checked_at": self.checked_at,
                "trust_status": "공식 공고에서 자동수집",
                "source_id": self.source["id"],
                "source_name": self.source["name"],
                "source_type": "자동수집",
                "attachments": [
                    {"name": file.get("fileName") or "첨부 요강", "url": file["url"], "type": (file.get("fileName") or "").rsplit(".", 1)[-1].lower()}
                    for file in files if file.get("url")
                ],
            })
            if events[-1]["attachments"] and events[-1]["attachments"][0]["type"] == "pdf" and should_extract(event_end, datetime.now(KST).date()):
                try:
                    pdf_text = extract_pdf_text(self.session, events[-1]["attachments"][0]["url"])
                    enrich_from_pdf(events[-1], pdf_text)
                except Exception as error:
                    events[-1]["trust_status"] = "세부 내용 확인 필요"
                    events[-1]["eligibility_notes"] = events[-1]["eligibility_notes"] or f"첨부 요강 자동 추출 실패: {type(error).__name__}"
            time.sleep(0.03)
        return SourceResult(
            source_id=self.source["id"],
            events=events,
            status="success",
            message=f"공식 대회 {len(events)}건 수집",
        )
