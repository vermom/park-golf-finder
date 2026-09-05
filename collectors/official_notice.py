from __future__ import annotations

import hashlib
import re
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from .base import SourceResult
from .notice_detail import event_from_notice, fetch_notice_detail


EVENT_WORDS = re.compile(r"(대회|선수권|페스티벌|오픈|리그|회장배|시장배|군수배|도지사배|총재배|체육대회)")
EXCLUDED_WORDS = re.compile(r"(결과|순위|조편성|대진표|성료|사진|갤러리|교육|자격증|연수|총회|이사회|휴장|시설안내|회원모집|스프레드시트|창업|광고|홍보)")


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors: list[tuple[str, str]] = []
        self._href: str | None = None
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a" or self._href is not None:
            return
        attributes = dict(attrs)
        self._href = attributes.get("href")
        if not self._href:
            onclick = attributes.get("onclick") or attributes.get("onClick") or ""
            match = re.search(r"location\.href\s*=\s*['\"]([^'\"]+)", onclick, flags=re.IGNORECASE)
            self._href = match.group(1) if match else None
        self._parts = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() != "a" or self._href is None:
            return
        text = re.sub(r"\s+", " ", " ".join(self._parts)).strip()
        self.anchors.append((self._href, text))
        self._href = None
        self._parts = []


def extract_notice_links(html: str, base_url: str, source: dict[str, Any]) -> list[tuple[str, str]]:
    parser = AnchorParser()
    parser.feed(html)
    allowed_hosts = set(source.get("allowed_hosts") or [urlparse(base_url).netloc])
    board_is_park_golf = bool(source.get("board_is_park_golf"))
    detail_link_regex = re.compile(source["detail_link_regex"]) if source.get("detail_link_regex") else None
    seen: set[str] = set()
    found: list[tuple[str, str]] = []
    for href, title in parser.anchors:
        absolute = urljoin(base_url, href).split("#", 1)[0]
        parsed = urlparse(absolute)
        if parsed.scheme != "https" or parsed.netloc not in allowed_hosts:
            continue
        if detail_link_regex and not detail_link_regex.search(absolute):
            continue
        clean_title = re.sub(r"^(공지|NEW|새글)\s*", "", title, flags=re.IGNORECASE).strip()
        if len(clean_title) < 5 or not EVENT_WORDS.search(clean_title) or EXCLUDED_WORDS.search(clean_title):
            continue
        if not board_is_park_golf and "파크골프" not in clean_title.replace(" ", ""):
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        found.append((absolute, clean_title))
    return found[: int(source.get("max_notices", 60))]


class OfficialNoticeCollector:
    def __init__(self, source: dict[str, Any], checked_at: str):
        self.source = source
        self.checked_at = checked_at
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "park-golf-finder/1.0 (official notice index; no login)",
            "Accept": "text/html,application/xhtml+xml",
        })

    def collect(self) -> SourceResult:
        notices: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []
        errors: list[str] = []
        for list_url in self.source.get("list_urls") or [self.source["url"]]:
            try:
                response = self.session.get(list_url, timeout=(10, 30))
                response.raise_for_status()
                response.encoding = response.apparent_encoding or response.encoding
                for url, title in extract_notice_links(response.text, list_url, self.source):
                    digest = hashlib.sha256(f"{self.source['id']}\0{url}".encode()).hexdigest()[:16]
                    notice = {
                        "id": f"notice-{digest}",
                        "title": title,
                        "region": self.source.get("region", "전국"),
                        "source_id": self.source["id"],
                        "source_name": self.source["name"],
                        "announcement_url": url,
                        "announcement_date": None,
                        "last_checked_at": self.checked_at,
                        "trust_status": "세부 내용 확인 필요",
                        "reason": "공식 게시판에서 발견했습니다. 참가 자격과 접수 기간은 원문·첨부 요강을 확인해 주세요.",
                        "attachments": [],
                    }
                    detail_mode = self.source.get("detail_mode", "none")
                    if detail_mode != "none":
                        try:
                            detail = fetch_notice_detail(self.session, notice, detail_mode)
                            notice["announcement_date"] = detail.get("announcement_date")
                            notice["attachments"] = detail.get("attachments", [])
                            event = event_from_notice(notice, detail, detail_mode)
                            if event:
                                events.append(event)
                                continue
                        except Exception as error:  # 상세 한 건이 실패해도 목록 발견 결과는 남깁니다.
                            notice["reason"] = f"공식 공고를 발견했지만 세부 자동해석에 실패했습니다: {type(error).__name__}"
                    notices.append(notice)
            except requests.RequestException as error:
                errors.append(f"{type(error).__name__}: {list_url}")

        unique = list({notice["announcement_url"]: notice for notice in notices}.values())
        if errors and not unique and not events:
            raise RuntimeError("; ".join(errors))
        suffix = f" (일부 목록 오류 {len(errors)}곳)" if errors else ""
        return SourceResult(
            source_id=self.source["id"],
            events=events,
            notices=unique,
            status="success",
            message=f"공식 공고 {len(events) + len(unique)}건 중 대회 카드 {len(events)}건 자동변환, 세부 확인 {len(unique)}건{suffix}",
            matched_notices=len(events),
        )
