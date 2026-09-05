export type InstallBrowser = 'samsung' | 'ios' | 'android' | 'other';
export type InstallDialogMode = 'samsung' | 'prompt' | 'ios' | 'checking' | 'installed-help' | 'manual';

export function detectInstallBrowser(userAgent: string, maxTouchPoints = 0): InstallBrowser {
  if (/SamsungBrowser\//i.test(userAgent)) return 'samsung';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  return 'other';
}

export function canUseNativeInstallPrompt(browser: InstallBrowser) {
  return browser !== 'samsung';
}

export function shouldAutoOpenInstallGuide(
  browser: InstallBrowser,
  isInstalled: boolean,
  installContinuation: boolean,
) {
  return browser !== 'other' && !isInstalled && installContinuation;
}

export function resolveInstallDialogMode(
  browser: InstallBrowser,
  hasPrompt: boolean,
  installContinuation: boolean,
  waitExpired: boolean,
): InstallDialogMode {
  if (browser === 'samsung') return 'samsung';
  if (hasPrompt) return 'prompt';
  if (browser === 'ios') return 'ios';
  if (browser === 'android' && installContinuation) return waitExpired ? 'installed-help' : 'checking';
  return 'manual';
}

export function buildChromeIntentUrl(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'https:') return null;
    url.searchParams.delete('updated');
    url.searchParams.delete('verify');
    url.searchParams.set('install', '1');
    url.hash = '';
    const fallback = encodeURIComponent(url.href);
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  } catch {
    return null;
  }
}
