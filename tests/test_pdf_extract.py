from datetime import date

from collectors.pdf_extract import enrich_from_pdf, should_extract


def base_event():
    return {
        "event_start": "2026-09-15",
        "event_end": "2026-09-18",
        "preliminary_dates": [],
        "final_dates": [],
        "capacity": None,
        "fee": None,
        "competition_type": [],
        "eligibility": ["대한파크골프협회 회원", "참가 자격 확인 필요"],
        "eligibility_notes": None,
        "contact": None,
        "registration_type": "확인 필요",
    }


def test_extracts_pdf_details_without_inventing_urls():
    text = """
    예 선 : 2026. 9. 8.(화) / 9. 9.(수)
    결 선 : 2026. 9. 15.(화) ~ 9. 18.(금)
    참가대상 : 대한파크골프협회 등록 회원
    참가인원 : 3,700명 (선수 3,200명)
    참가비 : 예선 30,000원, 결선 60,000원
    경쟁 종목 : 남·여 개인전
    문의 : 033-441-9024
    """
    result = enrich_from_pdf(base_event(), text)
    assert "2026-09-08" in result["preliminary_dates"]
    assert "2026-09-15" in result["final_dates"]
    assert result["capacity"].startswith("3,700명")
    assert result["competition_type"] == ["개인전"]


def test_limits_pdf_extraction_to_recent_or_upcoming_events():
    assert should_extract("2026-09-01", date(2026, 9, 4))
    assert not should_extract("2026-01-01", date(2026, 9, 4))
