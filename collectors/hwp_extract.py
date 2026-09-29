from __future__ import annotations

import io
import re
import struct
import zipfile
import zlib
from xml.etree import ElementTree

import olefile
import requests


PARAGRAPH_TEXT_TAG = 67


def _clean_text(value: str) -> str:
    # HWP 문단에는 글자 외에도 표·필드 제어코드의 이진 인수가 섞여 있다.
    # 날짜와 접수 문구 해석에 필요한 한글·숫자·일반 문장부호만 남긴다.
    value = re.sub(r"[^가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s.,:;()~/%@+\-·※☎&]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def extract_section_text(section: bytes) -> str:
    values: list[str] = []
    position = 0
    while position + 4 <= len(section):
        header = struct.unpack_from("<I", section, position)[0]
        position += 4
        tag = header & 0x3FF
        size = (header >> 20) & 0xFFF
        if size == 0xFFF:
            if position + 4 > len(section):
                break
            size = struct.unpack_from("<I", section, position)[0]
            position += 4
        if position + size > len(section):
            break
        payload = section[position:position + size]
        position += size
        if tag == PARAGRAPH_TEXT_TAG:
            values.append(payload.decode("utf-16le", errors="ignore"))
    return _clean_text(" ".join(values))


def extract_hwp_bytes(data: bytes) -> str:
    if zipfile.is_zipfile(io.BytesIO(data)):
        values: list[str] = []
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for name in sorted(item for item in archive.namelist() if re.search(r"Contents/section\d+\.xml$", item, re.IGNORECASE)):
                root = ElementTree.fromstring(archive.read(name))
                values.extend(text for text in root.itertext() if text)
        return _clean_text(" ".join(values))

    if not olefile.isOleFile(io.BytesIO(data)):
        raise ValueError("HWP/HWPX 형식이 아닙니다.")
    values = []
    with olefile.OleFileIO(io.BytesIO(data)) as document:
        header = document.openstream("FileHeader").read()
        compressed = len(header) >= 40 and bool(struct.unpack("<I", header[36:40])[0] & 1)
        sections = sorted(
            path for path in document.listdir()
            if len(path) >= 2 and path[0] == "BodyText" and path[-1].startswith("Section")
        )
        for path in sections:
            section = document.openstream(path).read()
            if compressed:
                section = zlib.decompress(section, -15)
            values.append(extract_section_text(section))
    return _clean_text(" ".join(values))


def extract_hwp_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=(10, 45), headers={"Accept": "application/octet-stream,*/*"})
    response.raise_for_status()
    return extract_hwp_bytes(response.content)
