import { describe, expect, it } from 'vitest';

import { EMPTY_PROFILE, hasProfile, normalizeProfile, profileSummary } from './profile';

describe('기기 안에 저장하는 내 정보', () => {
  it('허용한 지역과 제한 길이의 문자열만 불러온다', () => {
    expect(normalizeProfile({ region: '경북', city: ' 경주시 ', club: '동경주클럽', membership: 'member', membershipNumber: ' 1234-5678 ' })).toEqual({
      region: '경북',
      city: '경주시',
      club: '동경주클럽',
      membership: 'member',
      membershipNumber: '1234-5678',
    });
  });

  it('잘못된 저장값은 빈 정보로 안전하게 처리한다', () => {
    expect(normalizeProfile({ region: '없는 지역', membership: '관리자', membershipNumber: '1234' })).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile({ region: '경북', membership: 'not-member', membershipNumber: '1234' }).membershipNumber).toBe('');
    expect(hasProfile(EMPTY_PROFILE)).toBe(false);
  });

  it('저장한 정보만 읽기 쉬운 한 줄로 표시한다', () => {
    expect(profileSummary({ region: '경남', city: '양산시', club: '한마음클럽', membership: 'member', membershipNumber: '1234-5678' }))
      .toBe('경남 · 양산시 · 대한파크골프협회 회원 · 한마음클럽');
  });
});
