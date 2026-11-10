import { useEffect, useState } from 'react';
import { Footer } from '../components/common';
import { login, preloadLogin } from '../lib/auth';
import { LOGIN_ENABLED } from '../lib/config';
import { externalUrl, isInAppBrowser } from '../lib/inapp';
import { navigate } from '../lib/router';
import { updateSettings } from '../lib/settings';

const MESSAGES = {
  blocked: 'ログイン用の画面がブロックされました。ブラウザのポップアップを許可して、もう一度お試しください。',
  error: 'ログインできませんでした。通信の状態を確認して、もう一度お試しください。',
} as const;

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const inApp = isInAppBrowser(navigator.userAgent);
  const url = externalUrl(window.location);

  useEffect(() => {
    if (!inApp) preloadLogin();
  }, [inApp]);

  async function onLogin() {
    setBusy(true);
    setMessage(null);
    const result = await login();
    setBusy(false);
    if (result === 'ok') navigate('/home');
    else if (result !== 'cancelled') setMessage(MESSAGES[result]);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed'); // コピーできない環境では、下の欄から手でコピーしてもらう
    }
  }

  return (
    <div className="screen login">
      <div className="login-hero">
        <div className="login-logo" aria-hidden="true">
          ✂
        </div>
        <h1>美容師国家試験 過去問トレーナー</h1>
        <p className="muted">第41回〜第54回（新制度）の筆記試験をスマホで</p>
      </div>

      <div className="login-actions">
        {inApp ? (
          // アプリ内ブラウザ（LINE・Instagram など）では Google ログインが使えない（SPEC §6.2）
          <div className="card inapp" role="note">
            <p>
              <strong>Googleログインは Safari / Chrome で開いてください。</strong>
            </p>
            <p className="small">
              このアプリ内の画面ではGoogleログインが使えません。下のボタンでURLをコピーし、Safari か Chrome
              に貼り付けて開いてください。
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => void copyUrl()}>
              URLをコピー
            </button>
            {copied === 'yes' && (
              <p className="small" role="status">
                コピーしました。
              </p>
            )}
            <input
              className="url-box"
              type="text"
              readOnly
              value={url}
              aria-label="このアプリのURL"
              onFocus={(e) => e.currentTarget.select()}
            />
            {copied === 'failed' && (
              <p className="small" role="status">
                コピーできませんでした。上の欄を長押ししてコピーしてください。
              </p>
            )}
          </div>
        ) : LOGIN_ENABLED ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onLogin()}>
              {busy ? 'ログイン中…' : 'Googleでログイン'}
            </button>
            {message && (
              <p className="small error-text" role="alert">
                {message}
              </p>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" disabled aria-describedby="login-soon">
              Googleでログイン
            </button>
            <p id="login-soon" className="small muted center">
              Googleログインは準備中です
            </p>
          </>
        )}
        <button
          type="button"
          className={`btn ${LOGIN_ENABLED && !inApp ? 'btn-secondary' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => {
            updateSettings({ guest: true });
            navigate('/home');
          }}
        >
          ログインせずに使う
        </button>
        <p className="small notice">
          学習記録はクラウドに保存され、作成者が問題の改善や苦手分析に使います。
          ログインせずに使う場合、記録はこの端末の中だけに保存されます。
        </p>
      </div>
      <Footer />
    </div>
  );
}
