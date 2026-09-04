export const PROFILE_REGIONS = [
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
] as const;

export type MembershipStatus = '' | 'member' | 'not-member' | 'unknown';

export type LocalProfile = {
  region: string;
  city: string;
  club: string;
  membership: MembershipStatus;
};

export const EMPTY_PROFILE: LocalProfile = {
  region: '',
  city: '',
  club: '',
  membership: '',
};

function cleanText(value: unknown, maxLength = 40) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeProfile(value: unknown): LocalProfile {
  if (!value || typeof value !== 'object') return EMPTY_PROFILE;
  const source = value as Partial<Record<keyof LocalProfile, unknown>>;
  const region = cleanText(source.region, 10);
  const membership = cleanText(source.membership, 20);
  return {
    region: PROFILE_REGIONS.includes(region as (typeof PROFILE_REGIONS)[number]) ? region : '',
    city: cleanText(source.city),
    club: cleanText(source.club),
    membership: ['member', 'not-member', 'unknown'].includes(membership)
      ? membership as MembershipStatus
      : '',
  };
}

export function hasProfile(profile: LocalProfile) {
  return Boolean(profile.region || profile.city || profile.club || profile.membership);
}

export function membershipLabel(status: MembershipStatus) {
  if (status === 'member') return '대한파크골프협회 회원';
  if (status === 'not-member') return '협회 비회원';
  if (status === 'unknown') return '협회 회원 여부 확인 필요';
  return '';
}

export function profileSummary(profile: LocalProfile) {
  return [profile.region, profile.city, membershipLabel(profile.membership), profile.club]
    .filter(Boolean)
    .join(' · ');
}
