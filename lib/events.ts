export const REGISTRATION_STATUSES = [
  '접수 예정',
  '접수 중',
  '마감 임박',
  '접수 마감',
  '대회 종료',
] as const;

export const ELIGIBILITY_OPTIONS = [
  '대한파크골프협회 회원',
  '해당 지역 주민',
  '해당 지역 협회 회원',
  '클럽 단체접수',
  '누구나 신청 가능',
  '참가 자격 확인 필요',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];
export type TrustStatus =
  | '공식 확인'
  | '공식 공고에서 자동수집'
  | '사람이 직접 등록'
  | '세부 내용 확인 필요'
  | '링크 오류 또는 접수처 확인 필요';

export type EventItem = {
  id: string;
  name: string;
  region: string;
  city: string | null;
  venue: string;
  venue_location: {
    latitude: number;
    longitude: number;
    matched_address: string;
    accuracy: 'address' | 'locality';
  } | null;
  event_start: string;
  event_end: string;
  preliminary_dates: string[];
  final_dates: string[];
  registration_start: string | null;
  registration_end: string | null;
  status: RegistrationStatus;
  capacity: string | null;
  eligibility: string[];
  eligibility_notes: string | null;
  association_membership_required: boolean | null;
  registration_type: string;
  competition_type: string[];
  fee: string | null;
  organizer: string | null;
  host: string | null;
  contact: string | null;
  registration_method: string | null;
  registration_url: string | null;
  announcement_url: string;
  announcement_date: string | null;
  last_checked_at: string;
  trust_status: TrustStatus;
  source_id: string;
  source_name: string;
  source_type: '자동수집' | '수동등록';
  attachments: Array<{ name: string; url: string; type: string }>;
};

export type EventFilters = {
  query: string;
  region: string;
  dateStart: string;
  dateEnd: string;
  status: string;
  eligibility: string;
  competitionType: string;
  nearbyOnly: boolean;
};

export const PRIORITY_REGIONS = new Set(['경북', '경남', '대구', '울산']);
const ADJACENT_CITIES = ['경주', '포항', '영천', '경산', '청도', '울산', '대구'];

export function isNearby(event: EventItem) {
  if (PRIORITY_REGIONS.has(event.region)) return true;
  return ADJACENT_CITIES.some((city) => `${event.city ?? ''} ${event.venue}`.includes(city));
}

export function computeStatus(event: Pick<EventItem, 'event_end' | 'registration_start' | 'registration_end'>, now = new Date()): RegistrationStatus {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
  if (event.event_end < today) return '대회 종료';
  if (event.registration_start && now < new Date(event.registration_start)) return '접수 예정';
  if (!event.registration_end) return '접수 예정';
  const close = new Date(event.registration_end);
  if (now > close) return '접수 마감';
  const remaining = close.getTime() - now.getTime();
  if (remaining <= 3 * 24 * 60 * 60 * 1000) return '마감 임박';
  return '접수 중';
}

export function filterEvents(events: EventItem[], filters: EventFilters, now = new Date()) {
  const query = filters.query.trim().toLocaleLowerCase('ko');
  return events.filter((event) => {
    const status = computeStatus(event, now);
    const text = `${event.name} ${event.region} ${event.city ?? ''} ${event.venue}`.toLocaleLowerCase('ko');
    if (query && !text.includes(query)) return false;
    if (filters.region && event.region !== filters.region) return false;
    if (filters.status && status !== filters.status) return false;
    if (filters.eligibility && !event.eligibility.includes(filters.eligibility)) return false;
    if (filters.competitionType && !event.competition_type.includes(filters.competitionType)) return false;
    if (filters.nearbyOnly && !isNearby(event)) return false;
    if (filters.dateStart && event.event_end < filters.dateStart) return false;
    if (filters.dateEnd && event.event_start > filters.dateEnd) return false;
    return true;
  });
}

export function sortEvents(events: EventItem[], sort: 'event' | 'registration') {
  return [...events].sort((a, b) => {
    const priority = Number(!isNearby(a)) - Number(!isNearby(b));
    if (priority) return priority;
    if (sort === 'registration') {
      const aEnd = a.registration_end ?? '9999-12-31';
      const bEnd = b.registration_end ?? '9999-12-31';
      const registrationOrder = aEnd.localeCompare(bEnd);
      if (registrationOrder) return registrationOrder;
    }
    return a.event_start.localeCompare(b.event_start) || a.name.localeCompare(b.name, 'ko');
  });
}

export function scheduleDates(event: EventItem) {
  const dates = new Set<string>([...event.preliminary_dates, ...event.final_dates]);
  const start = new Date(`${event.event_start}T12:00:00+09:00`);
  const end = new Date(`${event.event_end}T12:00:00+09:00`);
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.add(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(cursor));
  }
  return dates;
}

export function conflictsFor(events: EventItem[], appliedIds: Set<string>) {
  const applied = events.filter((event) => appliedIds.has(event.id));
  const result = new Map<string, string[]>();
  for (let left = 0; left < applied.length; left += 1) {
    const leftDates = scheduleDates(applied[left]);
    for (let right = left + 1; right < applied.length; right += 1) {
      const overlaps = [...scheduleDates(applied[right])].some((date) => leftDates.has(date));
      if (!overlaps) continue;
      result.set(applied[left].id, [...(result.get(applied[left].id) ?? []), applied[right].name]);
      result.set(applied[right].id, [...(result.get(applied[right].id) ?? []), applied[left].name]);
    }
  }
  return result;
}
