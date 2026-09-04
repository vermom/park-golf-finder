import { describe, expect, it } from 'vitest';

import { computeStatus, conflictsFor, filterEvents, sortEvents, type EventFilters, type EventItem } from './events';

const event = (overrides: Partial<EventItem> = {}): EventItem => ({
  id: 'one',
  name: '경주 테스트 대회',
  region: '경북',
  city: '경주시',
  venue: '경주파크골프장',
  venue_location: { latitude: 35.856, longitude: 129.224, matched_address: '경주시', accuracy: 'locality' },
  event_start: '2026-10-10',
  event_end: '2026-10-11',
  preliminary_dates: [],
  final_dates: [],
  registration_start: '2026-09-01T09:00:00+09:00',
  registration_end: '2026-09-10T18:00:00+09:00',
  status: '접수 중',
  capacity: null,
  eligibility: ['대한파크골프협회 회원'],
  eligibility_notes: null,
  association_membership_required: true,
  registration_type: '개인접수',
  competition_type: ['개인전'],
  fee: null,
  organizer: null,
  host: null,
  contact: null,
  registration_method: null,
  registration_url: null,
  announcement_url: 'https://example.com/notice',
  announcement_date: '2026-09-01',
  last_checked_at: '2026-09-04T09:00:00+09:00',
  trust_status: '공식 확인',
  source_id: 'test',
  source_name: '테스트',
  source_type: '수동등록',
  attachments: [],
  ...overrides,
});

const filters: EventFilters = {
  query: '', region: '', dateStart: '', dateEnd: '', status: '', eligibility: '', competitionType: '', nearbyOnly: false,
};

describe('대회 상태', () => {
  it('접수 마감 3일 이내를 마감 임박으로 계산한다', () => {
    expect(computeStatus(event(), new Date('2026-09-08T09:00:00+09:00'))).toBe('마감 임박');
  });

  it('대회 종료일이 지난 경우 대회 종료로 계산한다', () => {
    expect(computeStatus(event(), new Date('2026-10-12T09:00:00+09:00'))).toBe('대회 종료');
  });
});

describe('검색·필터·정렬', () => {
  const events = [event(), event({ id: 'two', name: '제주 대회', region: '제주', city: '제주시', venue: '제주구장', event_start: '2026-09-20', event_end: '2026-09-20' })];

  it('대회명과 지역으로 검색한다', () => {
    expect(filterEvents(events, { ...filters, query: '제주' }, new Date('2026-09-04T09:00:00+09:00')).map((item) => item.id)).toEqual(['two']);
  });

  it('경주 우선 지역을 먼저 정렬한다', () => {
    expect(sortEvents(events, 'event')[0].id).toBe('one');
  });
});

describe('신청 일정 충돌', () => {
  it('전체 대회 기간과 예선·결선 날짜의 겹침을 찾는다', () => {
    const events = [event(), event({ id: 'two', name: '겹치는 대회', event_start: '2026-10-20', event_end: '2026-10-20', preliminary_dates: ['2026-10-11'] })];
    const conflicts = conflictsFor(events, new Set(['one', 'two']));
    expect(conflicts.get('one')).toEqual(['겹치는 대회']);
    expect(conflicts.get('two')).toEqual(['경주 테스트 대회']);
  });
});
