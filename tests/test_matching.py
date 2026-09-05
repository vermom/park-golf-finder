from scripts.matching import canonical_name, match_notices


def _event(event_id: str, name: str):
    return {"id": event_id, "name": name, "announcement_url": f"https://kpga.example/{event_id}"}


def _notice(title: str, url: str = "https://regional.example/1"):
    return {"title": title, "announcement_url": url, "source_name": "지역 협회"}


def test_matches_same_event_with_boilerplate_removed_and_is_idempotent():
    events = [_event("one", "제2회 화순적벽배 황산 전국파크골프대회")]
    notices = [_notice("제2회 화순 적벽배 전국파크골프 대회 요강을 공지 해 주시면 고맙겠습니다.")]
    remaining, count = match_notices(events, notices)
    assert remaining == []
    assert count == 1
    assert len(events[0]["related_announcements"]) == 1
    match_notices(events, notices)
    assert len(events[0]["related_announcements"]) == 1


def test_does_not_force_ambiguous_or_unrelated_match():
    events = [_event("one", "제5회 정읍시장배 전국파크골프대회"), _event("two", "제5회 충주시장배 전국파크골프대회")]
    notice = _notice("시장배 파크골프대회")
    assert match_notices(events, [notice])[0] == [notice]
    assert canonical_name("파크골프 대회 안내") == ""
