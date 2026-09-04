# 수동 대회 입력 안내

`manual_events.csv`는 Excel에서 열어 한 줄씩 대회를 추가하는 파일입니다. UTF-8 BOM으로 저장되어 한글이 깨지지 않습니다.

- 날짜는 `2026-10-12`, 시각은 `2026-09-04T17:00:00+09:00`처럼 씁니다.
- 여러 값은 `|`로 나눕니다. 예: `개인전|단체전`.
- 모르는 값은 빈 칸으로 두되 `id`, `name`, `region`, `venue`, `event_start`, `event_end`, `announcement_url`, `trust_status`, `source_id`, `source_name`은 반드시 입력합니다.
- `association_membership_required`는 `필요`, `불필요`, 또는 빈 칸입니다.
- 공식 공고가 확인되지 않은 참고 정보는 `trust_status`를 `세부 내용 확인 필요`로 입력합니다.
- 블로그·카페 주소는 발견 경로로만 참고하고, `announcement_url`에는 확인한 공식 공고 주소만 넣습니다.

현재 첫 행은 2026년 8월 11일 대한파크골프연맹 공식 이미지 공고를 사람이 직접 확인해 입력한 실제 예시입니다.
