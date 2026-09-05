from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests

from .base import SourceResult


DETAIL_BASE = "https://www.busan.go.kr/sports/main/19"
KST = ZoneInfo("Asia/Seoul")


def _clean(value: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(value or "")).strip(" -")
    return text or None


def _date_range(value: str) -> tuple[str, str]:
    dates = re.findall(r"\d{4}\.\d{2}\.\d{2}", value or "")
    if not dates:
        raise ValueError(f"개최일 형식을 읽을 수 없습니다: {value!r}")
    normalized = [date.replace(".", "-") for date in dates]
    return normalized[0], normalized[-1]


def _registration_range(value: str | None) -> tuple[str | None, str | None]:
    dates = re.findall(r"\d{4}[.-]\d{1,2}[.-]\d{1,2}", value or "")
    if not dates:
        return None, None
    parsed = [datetime.strptime(date.replace(".", "-"), "%Y-%m-%d").date().isoformat() for date in dates]
    return f"{parsed[0]}T00:00:00+09:00", f"{parsed[-1]}T23:59:59+09:00"


def _city(*values: str | None) -> str | None:
    text = " ".join(value or "" for value in values)
    local = re.search(r"([가-힣]+(?:구|군))", text)
    if local:
        return local.group(1)
    cities = re.findall(r"([가-힣]+시)", text)
    return next((city for city in cities if "광역시" not in city), None)


def normalize_busan_record(item: dict[str, Any], source: dict[str, Any], checked_at: str) -> dict[str, Any]:
    start, end = _date_range(str(item.get("cpttDt") or ""))
    registration_start, registration_end = _registration_range(_clean(item.get("atndDt")) or _clean(item.get("rctDt")))
    name = _clean(item.get("cpttNm")) or "대회명 확인 필요"
    venue_name = _clean(item.get("plcNm"))
    venue_address = _clean(item.get("plcAddr"))
    venue = " · ".join(part for part in [venue_name, venue_address] if part) or "경기장 확인 필요"
    target = _clean(item.get("atndTarget"))
    method = _clean(item.get("atndMthd"))
    detail_url = f"{DETAIL_BASE}?action=view&no={item['cpttSn']}&typ={item.get('typ') or 'c'}"
    registration_url = _clean(item.get("acsUrlAddr"))
    if registration_url and urlparse(registration_url).scheme != "https":
        registration_url = None
    eligibility = ["참가 자격 확인 필요"]
    if target and re.search(r"부산|구민|시민|군민", target):
        eligibility.insert(0, "해당 지역 주민")
    if target and re.search(r"협회\s*(?:등록|소속|회원)", target):
        eligibility.insert(0, "해당 지역 협회 회원")
    return {
        "id": f"busan-{item['cpttSn']}",
        "name": name,
        "region": "부산",
        "city": _city(name, venue_address, venue_name),
        "venue": venue,
        "event_start": start,
        "event_end": end,
        "preliminary_dates": [],
        "final_dates": [],
        "registration_start": registration_start,
        "registration_end": registration_end,
        "status": "접수 예정",
        "capacity": _clean(item.get("atndList")),
        "eligibility": list(dict.fromkeys(eligibility)),
        "eligibility_notes": target,
        "association_membership_required": None,
        "registration_type": method or "접수 단위 확인 필요",
        "competition_type": [],
        "fee": _clean(item.get("atndCost")),
        "organizer": _clean(item.get("organizerNm")),
        "host": _clean(item.get("hostNm")),
        "contact": _clean(item.get("rbprsnTelno")),
        "registration_method": method,
        "registration_url": registration_url,
        "announcement_url": detail_url,
        "announcement_date": None,
        "last_checked_at": checked_at,
        "trust_status": "공식 공고에서 자동수집",
        "source_id": source["id"],
        "source_name": source["name"],
        "source_type": "자동수집",
        "attachments": [],
    }


class BusanSportsCollector:
    def __init__(self, source: dict[str, Any], checked_at: str):
        self.source = source
        self.checked_at = checked_at
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "park-golf-finder/1.0 (official public data collector)",
            "Accept": "application/json",
            "Referer": source["url"],
        })

    def collect(self) -> SourceResult:
        params = {
            "ymd": datetime.now(KST).date().isoformat(),
            "pageIndex": 1,
            "pgFlag": "list",
            "searchKeyword": "파크골프",
            "searchCondition": "all",
        }
        response = self.session.get(self.source["api_url"], params=params, timeout=(10, 30))
        response.raise_for_status()
        first = response.json()
        pagination = first.get("paginationInfo") or {}
        pages = max(1, int(pagination.get("totalPageCount") or math.ceil(int(first.get("totalCnt", 0)) / 6) or 1))
        rows = list(first.get("list") or [])
        for page in range(2, pages + 1):
            params["pageIndex"] = page
            page_response = self.session.get(self.source["api_url"], params=params, timeout=(10, 30))
            page_response.raise_for_status()
            rows.extend(page_response.json().get("list") or [])

        # 복합 종목 체육대회는 파크골프의 경기장·접수 정보가 분리되지 않아 완전 카드에서 제외합니다.
        park_golf_rows = [row for row in rows if "파크골프" in str(row.get("cpttNm") or "").replace(" ", "")]
        events = [normalize_busan_record(row, self.source, self.checked_at) for row in park_golf_rows]
        return SourceResult(
            source_id=self.source["id"],
            events=events,
            status="success",
            message=f"부산시 공식 대회 {len(events)}건 수집 (복합종목 {len(rows) - len(events)}건은 세부 종목 미분리로 제외)",
        )
