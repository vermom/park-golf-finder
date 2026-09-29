import struct

from collectors.hwp_extract import PARAGRAPH_TEXT_TAG, extract_section_text


def test_extracts_clean_paragraph_text_from_hwp_record():
    text = "등록(접수) 기한: 2026년 9월 16일(수) 18:00까지"
    payload = text.encode("utf-16le")
    header = PARAGRAPH_TEXT_TAG | (len(payload) << 20)

    assert extract_section_text(struct.pack("<I", header) + payload) == text
