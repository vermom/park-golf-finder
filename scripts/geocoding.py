from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
CACHE_PATH = ROOT / "data" / "geocode_cache.json"
GEOCODE_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"


def _address_from_venue(venue: str) -> str | None:
    if not venue or any(marker in venue for marker in ("확인 필요", "모집요강 참조")):
        return None
    parenthesized = re.findall(r"\(([^()]*(?:시|군|구|읍|면|동|리)[^()]*)\)", venue)
    address = parenthesized[-1] if parenthesized else venue
    address = re.sub(r"\s+(?:일원|축구장.*|건너편.*)$", "", address).strip()
    return address or None


def _load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_cache(cache: dict[str, Any]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def enrich_venue_locations(events: list[dict[str, Any]]) -> None:
    """공개 주소 지오코더 결과를 캐시해 새 경기장만 조회합니다."""
    cache = _load_cache()
    changed = False
    session = requests.Session()
    session.headers.update({
        "User-Agent": "park-golf-finder/1.0 (https://github.com/vermom/park-golf-finder)",
        "Accept": "application/json",
    })

    for event in events:
        address = _address_from_venue(str(event.get("venue") or ""))
        if not address:
            event["venue_location"] = None
            continue

        cached = cache.get(address)
        if cached is None:
            try:
                response = session.get(
                    GEOCODE_URL,
                    params={
                        "f": "json",
                        "singleLine": address,
                        "outFields": "Match_addr",
                        "maxLocations": 1,
                        "countryCode": "KOR",
                    },
                    timeout=(10, 20),
                )
                response.raise_for_status()
                candidates = response.json().get("candidates") or []
                candidate = candidates[0] if candidates else None
                if candidate and float(candidate.get("score", 0)) >= 75:
                    cached = {
                        "latitude": round(float(candidate["location"]["y"]), 6),
                        "longitude": round(float(candidate["location"]["x"]), 6),
                        "matched_address": candidate.get("address") or address,
                        "accuracy": "address" if float(candidate["score"]) >= 90 else "locality",
                    }
                else:
                    cached = False
            except (requests.RequestException, KeyError, TypeError, ValueError):
                # 지오코딩 장애가 대회 데이터 수집 전체를 실패시키지 않게 합니다.
                cached = False
            cache[address] = cached
            changed = True

        event["venue_location"] = cached or None

    if changed:
        _save_cache(cache)
