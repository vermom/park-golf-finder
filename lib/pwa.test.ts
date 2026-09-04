import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('설치 가능한 웹앱 파일', () => {
  const publicPath = resolve(process.cwd(), 'public');

  it('하위 경로에서도 동작하는 manifest와 필수 아이콘을 제공한다', () => {
    const manifest = JSON.parse(readFileSync(resolve(publicPath, 'manifest.webmanifest'), 'utf8')) as {
      start_url: string;
      scope: string;
      display: string;
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons) expect(existsSync(resolve(publicPath, icon.src))).toBe(true);
  });

  it('서비스 워커와 개인정보 안내 페이지를 함께 배포한다', () => {
    expect(readFileSync(resolve(publicPath, 'sw.js'), 'utf8')).toContain('self.registration.scope');
    expect(readFileSync(resolve(publicPath, 'privacy/index.html'), 'utf8')).toContain('운영자 서버나 GitHub 저장소로 전송되지 않습니다.');
  });
});
