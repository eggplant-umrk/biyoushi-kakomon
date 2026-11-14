import { describe, expect, it, test } from 'vitest';
import { externalUrl, isInAppBrowser, isIOSStandalone } from './inapp';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';

describe('isInAppBrowser', () => {
  it.each([
    ['LINE (iOS)', `${IOS} Mobile/15E148 Safari Line/14.5.0`],
    ['Instagram (iOS)', `${IOS} Mobile/15E148 Instagram 320.0.0.0 (iPhone15,2; iOS 18_0; ja_JP)`],
    ['Facebook (iOS)', `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0;FBDV/iPhone15,2]`],
    ['X (iOS)', `${IOS} Mobile/15E148 Twitter for iPhone/10.30`],
    [
      'LINE (Android)',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 Line/14.5.0/IAB',
    ],
    [
      'Android WebView',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36',
    ],
    ['TikTok', `${IOS} Mobile/15E148 musical_ly_33.0.0 BytedanceWebview/d8a21c6`],
  ])('アプリ内ブラウザと判定する：%s', (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(true);
  });

  it.each([
    ['Safari (iOS)', `${IOS} Version/18.0 Mobile/15E148 Safari/604.1`],
    ['Chrome (iOS)', `${IOS} CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1`],
    [
      'Chrome (Android)',
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    ],
    [
      'Chrome (PC)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ],
  ])('通常のブラウザはそのまま：%s', (_name, ua) => {
    expect(isInAppBrowser(ua)).toBe(false);
  });
});

describe('externalUrl', () => {
  it('openExternalBrowser=1 を付け、ハッシュは含めない', () => {
    expect(externalUrl({ origin: 'https://eggplant-umrk.github.io', pathname: '/biyoushi-kakomon/' })).toBe(
      'https://eggplant-umrk.github.io/biyoushi-kakomon/?openExternalBrowser=1',
    );
  });
});


describe('ホーム画面に追加したアプリ（iPhone・iPad）', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  test('iPhone で standalone のときだけ true', () => {
    expect(isIOSStandalone({ userAgent: IPHONE, standalone: true })).toBe(true);
    expect(isIOSStandalone({ userAgent: IPHONE, standalone: false })).toBe(false);
    expect(isIOSStandalone({ userAgent: IPHONE })).toBe(false);
  });
  test('iPad（デスクトップ表示の UA）も、タッチがあれば iOS とみなす', () => {
    expect(isIOSStandalone({ userAgent: IPAD_DESKTOP, standalone: true, maxTouchPoints: 5 })).toBe(true);
    expect(isIOSStandalone({ userAgent: IPAD_DESKTOP, standalone: true, maxTouchPoints: 0 })).toBe(false);
  });
  test('Android のホーム画面のアプリは対象外（ポップアップでログインできる）', () => {
    expect(isIOSStandalone({ userAgent: ANDROID, standalone: true })).toBe(false);
  });
});
