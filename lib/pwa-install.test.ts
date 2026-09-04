import { describe, expect, it } from 'vitest';

import {
  buildChromeIntentUrl,
  canUseNativeInstallPrompt,
  detectInstallBrowser,
  resolveInstallDialogMode,
} from './pwa-install';

describe('브라우저별 안전한 설치 안내', () => {
  const samsungUserAgent = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 SamsungBrowser/30.0';
  const chromeUserAgent = 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';

  it('삼성 인터넷은 Android Chrome보다 먼저 구분하고 기본 설치창을 사용하지 않는다', () => {
    const browser = detectInstallBrowser(samsungUserAgent);
    expect(browser).toBe('samsung');
    expect(canUseNativeInstallPrompt(browser)).toBe(false);
  });

  it('기존 Android Chrome과 iPhone 설치 경로는 유지한다', () => {
    expect(detectInstallBrowser(chromeUserAgent)).toBe('android');
    expect(canUseNativeInstallPrompt('android')).toBe(true);
    expect(detectInstallBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(detectInstallBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', 5)).toBe('ios');
  });

  it('Chrome 설치 버튼이 없으면 잠시 확인한 뒤 기존 앱 찾기 안내로 전환한다', () => {
    expect(resolveInstallDialogMode('android', true, true, false)).toBe('prompt');
    expect(resolveInstallDialogMode('android', false, true, false)).toBe('checking');
    expect(resolveInstallDialogMode('android', false, true, true)).toBe('installed-help');
    expect(resolveInstallDialogMode('android', false, false, true)).toBe('manual');
    expect(resolveInstallDialogMode('samsung', true, true, true)).toBe('samsung');
  });

  it('Chrome 열기 주소는 공식 HTTPS 페이지만 전달하고 실패하면 안전하게 중단한다', () => {
    const intent = buildChromeIntentUrl('https://vermom.github.io/park-golf-finder/?view=all&updated=old#events');
    expect(intent).toContain('package=com.android.chrome');
    expect(intent).toContain('intent://vermom.github.io/park-golf-finder/?view=all&install=1');
    expect(intent).toContain(encodeURIComponent('https://vermom.github.io/park-golf-finder/?view=all&install=1'));
    expect(intent).not.toContain('updated=old');
    expect(intent).not.toContain('#events');
    expect(buildChromeIntentUrl('http://localhost:3001/')).toBeNull();
    expect(buildChromeIntentUrl('not-a-url')).toBeNull();
  });
});
