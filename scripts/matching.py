from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any


BOILERPLATE = re.compile(
    r"(요강을\s*공지\s*해\s*주시면\s*고맙겠습니다|참가자\s*모집중|대회\s*요강|요강|일정|공지|알림|안내|정정|수정|최종|"
    r"전국|파크골프\s*대회|파크골프|"
    r"강원특별자치도|제주특별자치도|제\s*\d+\s*회|20\d{2}년?)"
)


def canonical_name(value: str) -> str:
    text = re.sub(r"\([^)]*\)|\[[^]]*\]|★", " ", value)
    text = BOILERPLATE.sub("", text)
    return re.sub(r"[^0-9가-힣]", "", text)


def _score(notice_title: str, event_name: str) -> float:
    notice = canonical_name(notice_title)
    event = canonical_name(event_name)
    if min(len(notice), len(event)) < 4:
        return 0.0
    if notice in event or event in notice:
        return 1.0 - abs(len(notice) - len(event)) / (max(len(notice), len(event)) * 10)
    return SequenceMatcher(None, notice, event).ratio()


def match_notices(events: list[dict[str, Any]], notices: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    unmatched: list[dict[str, Any]] = []
    matched_count = 0
    for notice in notices:
        ranked = sorted(((_score(notice["title"], event["name"]), event) for event in events), key=lambda item: item[0], reverse=True)
        best_score, best_event = ranked[0] if ranked else (0.0, None)
        second_score = ranked[1][0] if len(ranked) > 1 else 0.0
        if best_event is None or best_score < 0.78 or best_score - second_score < 0.08:
            unmatched.append(notice)
            continue
        related = best_event.setdefault("related_announcements", [])
        if notice["announcement_url"] != best_event["announcement_url"] and not any(
            item["url"] == notice["announcement_url"] for item in related
        ):
            related.append({
                "title": notice["title"],
                "url": notice["announcement_url"],
                "source_name": notice["source_name"],
            })
        matched_count += 1
    return unmatched, matched_count
