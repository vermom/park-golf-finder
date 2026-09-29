from copy import deepcopy

from scripts.collect import deduplicate


def _event(event_id: str, region: str, source_id: str = "kpga_national"):
    return {
        "id": event_id,
        "name": "제3회 고령 대가야배 전국 파크골프대회",
        "region": region,
        "event_start": "2026-10-05",
        "source_id": source_id,
        "source_name": source_id,
        "source_type": "자동수집",
        "announcement_url": f"https://example.org/{event_id}",
        "eligibility": [],
        "competition_type": [],
        "preliminary_dates": [],
        "final_dates": [],
        "attachments": [],
        "related_announcements": [],
    }


def test_merges_same_event_when_one_source_has_no_region():
    national = _event("national", "")
    regional = _event("regional", "경북", "regional_association")

    result = deduplicate([national, regional])

    assert len(result) == 1
    assert result[0]["region"] == "경북"
    assert result[0]["related_announcements"] == [{
        "title": regional["name"],
        "url": regional["announcement_url"],
        "source_name": regional["source_name"],
    }]


def test_keeps_same_name_and_date_when_regions_conflict():
    gyeongbuk = _event("gyeongbuk", "경북")
    gyeongnam = deepcopy(gyeongbuk)
    gyeongnam.update({
        "id": "gyeongnam",
        "region": "경남",
        "announcement_url": "https://example.org/gyeongnam",
    })

    assert len(deduplicate([gyeongbuk, gyeongnam])) == 2
