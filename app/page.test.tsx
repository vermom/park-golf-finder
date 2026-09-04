import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('내 정보 선택창 호환성', () => {
  it('기본 대화상자 안에서는 포털이 없는 휴대폰 기본 선택창을 사용한다', () => {
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain('<dialog');
    expect(markup).toContain('<select id="profile-region"');
    expect(markup).toContain('<select id="profile-membership"');
    expect(markup).not.toContain('id="profile-membership-number"');
  });

  it('대화상자 밖의 기존 대회 필터 선택창은 그대로 유지한다', () => {
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="지역"');
  });

  it('어르신이 따라 하기 쉬운 큰 설치 안내를 제공한다', () => {
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain('휴대폰에 앱 설치하기');
    expect(markup).toContain('홈 화면에 추가');
    expect(markup).toContain('나중에 하기');
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Chrome에서 설치 계속');
    expect(source).toContain('설치 후에는 Chrome에 다시 들어갈 필요가 없어요');
    expect(source).toContain('휴대폰에 앱 설치');
    expect(source).toContain('이미 설치되어 있을 가능성이 커요');
    expect(source).toContain('아이콘을 길게 누르세요');
  });

  it('대회 카드에 자동수집 출처 문구를 반복해서 표시하지 않는다', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    expect(source).not.toContain('event.source_type');
    expect(source).not.toContain('event.trust_status');
  });
});
