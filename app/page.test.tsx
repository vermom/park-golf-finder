import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Home from './page';

describe('내 정보 선택창 호환성', () => {
  it('기본 대화상자 안에서는 포털이 없는 휴대폰 기본 선택창을 사용한다', () => {
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain('<dialog');
    expect(markup).toContain('<select id="profile-region"');
    expect(markup).toContain('<select id="profile-membership"');
  });

  it('대화상자 밖의 기존 대회 필터 선택창은 그대로 유지한다', () => {
    const markup = renderToStaticMarkup(<Home />);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="지역"');
  });
});
