from collectors.notice_detail import date_spans, event_from_notice


NOTICE = {
    "id": "notice-test",
    "title": "삼척시장배 강원특별자치도파크골프대회 안내",
    "region": "강원",
    "source_id": "gangwon",
    "source_name": "강원협회",
    "announcement_url": "https://official.example/notice/1",
    "last_checked_at": "2026-09-05T06:00:00+09:00",
}


def test_date_spans_support_korean_and_abbreviated_range_variants():
    assert date_spans("2026년 10월 20~21일") == [
        (__import__("datetime").date(2026, 10, 20), __import__("datetime").date(2026, 10, 21))
    ]
    assert date_spans("2026. 10. 23(금) ~ 10.24(토)")[0][1].isoformat() == "2026-10-24"


def test_promotes_html_notice_to_event_card():
    detail = {
        "text": """
        대 회 명 : 2026 삼척시장배 강원특별자치도 파크골프대회
        기 간 : 2026 년 9 월 19 일(토) ~ 20 일(일) / 2일간
        장 소 : 삼척시 미로파크골프장(미로면 무사리 산 62-10)
        참가자격 : 강원특별자치도 파크골프협회에 가입된 회원
        참가인원 : 약 600명
        참 가 비 : 선수 1인당 30,000원
        주 최 : G1방송
        주 관 : 삼척시파크골프협회
        """,
        "attachments": [{"name": "대회요강.hwp", "url": "https://official.example/rules.hwp", "type": "hwp"}],
        "announcement_date": "2026-08-20",
    }
    event = event_from_notice(NOTICE, detail, "gnuboard_html")
    assert event is not None
    assert event["event_start"] == "2026-09-19"
    assert event["event_end"] == "2026-09-20"
    assert event["venue"].startswith("삼척시 미로파크골프장")
    assert event["region"] == "강원"
    assert event["attachments"][0]["type"] == "hwp"


def test_malformed_notice_without_event_date_stays_for_review():
    assert event_from_notice(NOTICE, {"text": "대회 날짜는 추후 공지", "attachments": []}, "gnuboard_html") is None
