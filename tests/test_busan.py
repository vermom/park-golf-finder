from collectors.busan import normalize_busan_record


def test_normalizes_busan_official_record_without_inventing_registration_url():
    event = normalize_busan_record({
        "cpttSn": 350,
        "typ": "c",
        "cpttNm": "제5회 부산광역시체육회장배 파크골프대회",
        "cpttDt": "2026.06.01~2026.06.01",
        "plcNm": "삼락생태공원 파크골프장",
        "plcAddr": "부산광역시 사상구 삼락동",
        "atndTarget": "부산 시민",
        "atndDt": "2026.05.01~2026.05.10",
        "acsUrlAddr": "",
    }, {"id": "busan", "name": "부산시"}, "2026-09-05T06:00:00+09:00")
    assert event["event_start"] == "2026-06-01"
    assert event["event_end"] == "2026-06-01"
    assert event["registration_end"] == "2026-05-10T23:59:59+09:00"
    assert event["registration_url"] is None
    assert "해당 지역 주민" in event["eligibility"]
