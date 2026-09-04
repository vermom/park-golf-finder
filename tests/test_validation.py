from __future__ import annotations

from copy import deepcopy

from scripts.validation import domain_errors


def valid_payload():
    return {
        "meta": {"event_count": 1},
        "events": [{
            "id": "event-1",
            "event_start": "2026-10-01",
            "event_end": "2026-10-02",
            "preliminary_dates": ["2026-10-01"],
            "final_dates": ["2026-10-02"],
        }],
    }


def test_valid_dates_and_count():
    assert domain_errors(valid_payload()) == []


def test_rejects_reversed_dates():
    payload = valid_payload()
    payload["events"][0]["event_end"] = "2026-09-30"
    assert any("종료일" in error for error in domain_errors(payload))


def test_rejects_invalid_date_and_duplicate_id():
    payload = valid_payload()
    duplicate = deepcopy(payload["events"][0])
    duplicate["preliminary_dates"] = ["2026-99-99"]
    payload["events"].append(duplicate)
    assert any("중복 ID" in error for error in domain_errors(payload))
    assert any("잘못된 날짜" in error for error in domain_errors(payload))
    assert any("event_count" in error for error in domain_errors(payload))

