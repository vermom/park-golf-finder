from scripts.geocoding import _address_from_venue


def test_extracts_address_from_venue_parentheses():
    assert _address_from_venue("황산파크골프장(경남 양산시 물금읍 물금리 819-12)") == "경남 양산시 물금읍 물금리 819-12"


def test_skips_unknown_venue():
    assert _address_from_venue("모집요강 참조") is None
