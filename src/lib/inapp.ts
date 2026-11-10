/**
 * アプリ内ブラウザ（LINE・Instagram など）の検知（SPEC §6.2）。
 * アプリ内ブラウザでは Google ログインのポップアップが使えない（Google 側で拒否される）ので、
 * ログインボタンの代わりに「Safari / Chrome で開いてください」と案内する。
 */
const IN_APP_PATTERNS: readonly RegExp[] = [
  /\bLine\//i, // LINE
  /\bFBAN\/|\bFBAV\/|\bFB_IAB\//, // Facebook / Messenger
  /\bInstagram\b/i,
  /\bTwitter\b/i, // X（旧Twitter）
  /\bMicroMessenger\b/i, // WeChat
  /\bKAKAOTALK\b/i,
  /\bTikTok\b|\bmusical_ly\b|\bBytedanceWebview\b/i,
  /\bSnapchat\b/i,
  /\bYJApp-/i, // Yahoo! JAPAN アプリ
  /\bGSA\//, // Google アプリ（iOS）
  /; wv\)/, // Android WebView 全般
];

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_PATTERNS.some((re) => re.test(userAgent));
}

/** 外部ブラウザで開いてもらうためのURL。LINE は `openExternalBrowser=1` が付いたリンクを外部ブラウザで開く */
export function externalUrl(loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}?openExternalBrowser=1`;
}
