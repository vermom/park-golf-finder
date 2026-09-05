from collectors.official_notice import extract_notice_links


def test_extracts_official_event_links_and_skips_results_and_ads():
    html = """
      <a href="/bbs/board.php?bo_table=event&wr_id=10">제4회 제주 파크골프대회 요강</a>
      <a href="/bbs/board.php?bo_table=event&wr_id=11">제4회 제주 파크골프대회 조편성 결과</a>
      <a href="https://spam.example/ad">전국 파크골프대회 광고</a>
      <a href="/bbs/board.php?bo_table=event">대회참가신청</a>
    """
    source = {
        "board_is_park_golf": True,
        "detail_link_regex": r"(?:[?&])wr_id=",
    }
    assert extract_notice_links(html, "https://official.example/bbs/list", source) == [
        ("https://official.example/bbs/board.php?bo_table=event&wr_id=10", "제4회 제주 파크골프대회 요강")
    ]


def test_extracts_javascript_location_links_used_by_federation():
    html = """<a onClick="location.href='detail.html?id=notices&amp;no=24'">
      <span>공지</span> 제1회 우리육우 전국파크골프대회 대회요강
    </a>"""
    source = {
        "board_is_park_golf": True,
        "detail_link_regex": r"detail\.html.*(?:[?&])no=",
    }
    links = extract_notice_links(html, "https://kpgf.kr/m/board/index.html?id=notices", source)
    assert links[0][0] == "https://kpgf.kr/m/board/detail.html?id=notices&no=24"
