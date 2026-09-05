from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from .pdf_extract import extract_pdf_text


DATE_TOKEN = re.compile(r"(20\d{2})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})")
REGIONS = {
    "서울": ["서울"], "부산": ["부산"], "대구": ["대구"], "인천": ["인천"],
    "광주": ["광주"], "대전": ["대전"], "울산": ["울산"], "세종": ["세종"],
    "경기": ["경기", "구리", "파주", "수원", "양평"],
    "강원": ["강원", "삼척", "양양", "정선", "춘천", "태백", "횡성", "화천"],
    "충북": ["충북", "충주", "제천"], "충남": ["충남", "공주", "논산"],
    "전북": ["전북", "정읍"], "전남": ["전남", "화순"],
    "경북": ["경북", "고령", "경주", "문경", "영천", "울진"],
    "경남": ["경남", "진주", "창원", "밀양", "양산", "합천"],
    "제주": ["제주", "서귀포"],
}


class DetailHTMLParser(HTMLParser):
    def __init__(self, base_url: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.parts: list[str] = []
        self.links: list[tuple[str, str]] = []
        self.images: list[tuple[str, str]] = []
        self._skip_depth = 0
        self._href: str | None = None
        self._link_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag in {"script", "style", "nav", "footer"}:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in {"br", "p", "div", "li", "tr", "h1", "h2", "h3"}:
            self.parts.append("\n")
        if tag == "a":
            self._href = attributes.get("href")
            self._link_parts = []
        if tag == "img" and attributes.get("src"):
            self.images.append((urljoin(self.base_url, attributes["src"]), attributes.get("alt") or "공고 이미지"))

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "nav", "footer"} and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag == "a" and self._href is not None:
            self.links.append((urljoin(self.base_url, self._href), " ".join(self._link_parts).strip()))
            self._href = None
            self._link_parts = []
        if tag in {"p", "div", "li", "tr"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        self.parts.append(data)
        if self._href is not None:
            self._link_parts.append(data)

    @property
    def text(self) -> str:
        value = re.sub(r"[\t\r ]+", " ", "".join(self.parts))
        return re.sub(r"\n+", "\n", value).strip()


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def date_spans(text: str) -> list[tuple[date, date]]:
    compact = re.sub(r"\s+", "", text)
    spans: list[tuple[date, date]] = []
    for match in DATE_TOKEN.finditer(compact):
        start = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if not start:
            continue
        end = start
        tail = compact[match.end():match.end() + 28]
        range_match = re.match(
            r"[.일()월화수목금토요일]*[~∼-]"
            r"(?:(20\d{2})(?:년|[./-]))?"
            r"(?:(\d{1,2})(?:월|[./-]))?"
            r"(\d{1,2})",
            tail,
        )
        if range_match:
            year = int(range_match.group(1) or start.year)
            month = int(range_match.group(2) or start.month)
            parsed_end = _safe_date(year, month, int(range_match.group(3)))
            if parsed_end and start <= parsed_end <= start + timedelta(days=120):
                end = parsed_end
        pair = (start, end)
        if pair not in spans:
            spans.append(pair)
    return spans


def _segment(text: str, starts: list[str], stops: list[str], limit: int = 1600) -> str:
    found = [match for pattern in starts if (match := re.search(pattern, text, re.IGNORECASE))]
    if not found:
        return ""
    start = min(found, key=lambda match: match.start()).end()
    tail = text[start:start + limit]
    endings = [match.start() for pattern in stops if (match := re.search(pattern, tail, re.IGNORECASE))]
    return tail[: min(endings)] if endings else tail


def _value(text: str, starts: list[str], stops: list[str], limit: int = 500) -> str | None:
    value = _segment(text, starts, stops, limit)
    cleaned = re.sub(r"\s+", " ", value).strip(" :-·☐○\n")
    cleaned = re.sub(r"\s+(?:[0-9]|[가-하]|[a-zA-Z])\s*[.)]\s*$", "", cleaned)
    cleaned = re.sub(r"\s*[oO]\s*$", "", cleaned)
    return cleaned or None


def _expand(spans: list[tuple[date, date]]) -> list[str]:
    values: list[str] = []
    for start, end in spans:
        cursor = start
        while cursor <= end:
            value = cursor.isoformat()
            if value not in values:
                values.append(value)
            cursor += timedelta(days=1)
    return values


def _region(title: str, venue: str, fallback: str) -> str:
    text = title if venue == "경기장 확인 필요" else f"{title} {venue}"
    for region, hints in REGIONS.items():
        if any(hint in text for hint in hints):
            return region
    return fallback


def _city(venue: str) -> str | None:
    matches = re.findall(r"([가-힣]{2,8}(?:시|군|구))", venue)
    return next((value for value in matches if "광역시" not in value and "특별자치" not in value), None)


def _attachment_type(name: str, url: str) -> str:
    match = re.search(r"\.([a-z0-9]{2,5})(?:\s|\?|$)", name, re.IGNORECASE)
    if not match:
        match = re.search(r"\.([a-z0-9]{2,5})(?:\?|$)", urlparse(url).path, re.IGNORECASE)
    return match.group(1).lower() if match else "link"


def fetch_notice_detail(session: requests.Session, notice: dict[str, Any], mode: str) -> dict[str, Any]:
    response = session.get(notice["announcement_url"], timeout=(10, 35))
    response.raise_for_status()
    response.encoding = response.apparent_encoding or response.encoding
    parser = DetailHTMLParser(response.url)
    parser.feed(response.text)
    attachments: list[dict[str, str]] = []
    for url, name in parser.links:
        if "download.php" not in url.lower() and not re.search(r"\.(?:pdf|hwp|hwpx|docx?|xlsx?)(?:\?|$)", url, re.IGNORECASE):
            continue
        attachments.append({"name": re.sub(r"\s+", " ", name).strip() or "첨부 요강", "url": url, "type": _attachment_type(name, url)})
    for url, name in parser.images:
        if "/wysiwyg/" not in url and "/upload/" not in url:
            continue
        attachments.append({"name": name or "공고 이미지", "url": url, "type": _attachment_type(name, url)})
    attachments = list({item["url"]: item for item in attachments}.values())

    text = parser.text
    if mode == "gnuboard_pdf":
        pdf = next((item for item in attachments if item["type"] == "pdf"), None)
        if pdf:
            text = f"{text}\n{extract_pdf_text(session, pdf['url'])}"

    announcement_date = None
    posted = re.search(r"등록일\s*(\d{2,4})[.-](\d{1,2})[.-](\d{1,2})", text)
    if not posted:
        posted = re.search(r"\|\s*(20\d{2})[.-](\d{1,2})[.-](\d{1,2})\s*\|", text)
    if posted:
        year = int(posted.group(1))
        year = year + 2000 if year < 100 else year
        parsed = _safe_date(year, int(posted.group(2)), int(posted.group(3)))
        announcement_date = parsed.isoformat() if parsed else None
    return {"text": text, "attachments": attachments, "announcement_date": announcement_date}


def event_from_notice(notice: dict[str, Any], detail: dict[str, Any], mode: str) -> dict[str, Any] | None:
    title = notice["title"]
    if "계획표" in title:
        return None
    text = detail["text"]
    if mode == "title":
        period = ""
        spans = date_spans(title) if re.match(r"^\s*20\d{2}[.-]\d{1,2}[.-]\d{1,2}", title) else []
    else:
        period = _segment(
            text,
            [r"대회\s*기간\s*[:：]?", r"기\s*간\s*[:：]", r"일\s*시\s*[:：]"],
            [r"장\s*소\s*[:：]", r"대회\s*장소\s*[:：]?", r"참가\s*(?:자격|대상|인원|규모)"],
            1300,
        )
        spans = date_spans(period)
    if not spans:
        return None

    parsed_name = None if mode == "title" else _value(
        text,
        [r"대\s*회\s*명\s*[:：]"],
        [r"개회식\s*[:：]", r"대회\s*기간\s*[:：]?", r"기\s*간\s*[:：]", r"일\s*시\s*[:：]", r"장\s*소\s*[:：]"],
        260,
    )
    name = parsed_name or re.sub(r"\s*(?:일정\s*)?(?:알림|안내|공지)\s*$", "", title).strip(" ★")
    if mode == "title":
        name = re.sub(r"^20\d{2}[.-]\d{1,2}[.-]\d{1,2}[.]?\s*", "", name)
        name = re.sub(r"\s*대회\s*요강\s*$", " 대회", name).strip()
    venue = (None if mode == "title" else _value(
        text,
        [r"대회\s*장소\s*(?:[○☐])?\s*[:：]?", r"장\s*소\s*(?:[○☐])?\s*[:：]"],
        [r"\n", r"PREV", r"목록", r"NEXT", r"참가\s*(?:자격|대상|인원|규모|계획)", r"주\s*최\s*[:：]", r"경기\s*종목"],
        360,
    )) or "경기장 확인 필요"
    starts = [span[0] for span in spans]
    ends = [span[1] for span in spans]

    preliminary = _segment(text, [r"예선(?:전)?\s*[:：]?"], [r"결선(?:전)?\s*[:：]?"], 900)
    final = _segment(text, [r"결선(?:전)?\s*[:：]?"], [r"장\s*소\s*[:：]", r"참가\s*(?:자격|대상|인원)"], 500)
    preliminary_dates = _expand(date_spans(preliminary))
    final_dates = _expand(date_spans(final))

    eligibility_notes = None if mode == "title" else _value(
        text,
        [r"참가\s*자격\s*[:：]", r"참가\s*대상\s*[:：]"],
        [r"참가\s*(?:인원|규모|계획)", r"참\s*가\s*비", r"주\s*최", r"경기\s*(?:종목|방법)"],
        500,
    )
    eligibility = ["참가 자격 확인 필요"]
    membership_required = None
    if eligibility_notes and "대한파크골프협회" in eligibility_notes and re.search(r"회원|등록", eligibility_notes):
        eligibility.insert(0, "대한파크골프협회 회원")
        membership_required = True
    if eligibility_notes and re.search(r"시군협회|도파크골프협회|지역.*협회", eligibility_notes):
        eligibility.insert(0, "해당 지역 협회 회원")

    capacity = None if mode == "title" else _value(
        text,
        [r"참가\s*(?:계획\s*)?인원\s*[:：]", r"참가\s*규모\s*[:：]"],
        [r"참가\s*(?:자격|대상|신청)", r"참\s*가\s*비", r"주\s*최"],
        350,
    )
    fee = None if mode == "title" else _value(text, [r"참\s*가\s*비\s*[:：]"], [r"주\s*최", r"주\s*관", r"후\s*원"], 260)
    host = None if mode == "title" else _value(text, [r"주\s*최\s*[:：]"], [r"주\s*관\s*[:：]", r"후\s*원\s*[:：]"], 260)
    organizer = None if mode == "title" else _value(text, [r"주\s*관\s*[:：]"], [r"후\s*원\s*[:：]", r"참가\s*신청"], 300)
    if not organizer and re.search(r"주\s*최\s*[·,/]\s*주\s*관\s*[:：]", text):
        organizer = host

    competition_type: list[str] = []
    if re.search(r"개인전", text):
        competition_type.append("개인전")
    if re.search(r"단체전", text):
        competition_type.append("단체전")

    registration_end = None
    registration_zone = "" if mode == "title" else _segment(text, [r"참가\s*신청"], [r"기타\s*사항", r"경기\s*일정"], 1000)
    for match in DATE_TOKEN.finditer(re.sub(r"\s+", "", registration_zone)):
        if "까지" not in re.sub(r"\s+", "", registration_zone)[match.end():match.end() + 12]:
            continue
        deadline = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if deadline:
            registration_end = f"{deadline.isoformat()}T23:59:59+09:00"
        break

    registration_type = "접수 단위 확인 필요"
    if re.search(r"시군협회|시협회\s*공문|소속\s*협회", registration_zone):
        registration_type = "소속 시·군 협회 단체접수"
        eligibility.append("클럽 단체접수")
    elif re.search(r"본인이\s*입력|온라인\s*접수|인터넷\s*접수", registration_zone):
        registration_type = "개인접수"

    region = _region(name, venue, notice["region"])
    return {
        "id": f"official-{notice['id'].removeprefix('notice-')}",
        "name": re.sub(r"\s+", " ", name),
        "region": region,
        "city": _city(venue),
        "venue": re.sub(r"\s+", " ", venue),
        "event_start": min(starts).isoformat(),
        "event_end": max(ends).isoformat(),
        "preliminary_dates": preliminary_dates,
        "final_dates": final_dates,
        "registration_start": None,
        "registration_end": registration_end,
        "status": "접수 예정",
        "capacity": capacity,
        "eligibility": list(dict.fromkeys(eligibility)),
        "eligibility_notes": eligibility_notes,
        "association_membership_required": membership_required,
        "registration_type": registration_type,
        "competition_type": competition_type,
        "fee": fee,
        "organizer": organizer,
        "host": host,
        "contact": None,
        "registration_method": registration_type,
        "registration_url": None,
        "announcement_url": notice["announcement_url"],
        "announcement_date": detail.get("announcement_date"),
        "last_checked_at": notice["last_checked_at"],
        "trust_status": "공식 공고에서 자동수집",
        "source_id": notice["source_id"],
        "source_name": notice["source_name"],
        "source_type": "자동수집",
        "attachments": detail.get("attachments", []),
        "related_announcements": [],
    }
