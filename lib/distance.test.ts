import { describe, expect, it } from 'vitest';

import { brouterUrl, formatDrivingRoute, parseBrouterRoute } from './distance';

describe('자동차 거리 표시', () => {
  it('BRouter 응답의 미터와 초를 km와 분으로 바꾼다', () => {
    const route = parseBrouterRoute({ features: [{ properties: { 'track-length': '69200', 'total-time': '3339' } }] });
    expect(route).toEqual({ distanceKm: 69.2, durationMinutes: 56 });
    expect(formatDrivingRoute(route)).toBe('약 69km · 56분');
  });

  it('출발지와 도착지를 자동차 경로 주소에 넣는다', () => {
    const url = brouterUrl(
      { latitude: 35.856, longitude: 129.224 },
      { latitude: 35.3076, longitude: 128.9843 },
    );
    expect(decodeURIComponent(url)).toContain('129.224,35.856|128.9843,35.3076');
    expect(url).toContain('profile=car-fast');
  });

  it('경로가 없는 응답은 오류로 처리한다', () => {
    expect(() => parseBrouterRoute({ features: [] })).toThrow('자동차 경로를 찾지 못했습니다.');
  });
});
