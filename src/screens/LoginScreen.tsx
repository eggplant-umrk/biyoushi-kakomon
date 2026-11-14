import { useEffect, useState } from 'react';
import { Footer } from '../components/common';
import { login, preloadLogin } from '../lib/auth';
import { LOGIN_ENABLED } from '../lib/config';
import { externalUrl, isInAppBrowser, isIOSStandalone } from '../lib/inapp';
import { navigate } from '../lib/router';
import { updateSettings } from '../lib/settings';

const MESSAGES = {
  blocked:
    'ログイン用の画面（ポップアップ）がブロックされました。ポップアップを許可してから、もう一度「Googleでログイン」を押してください。',
  storage:
    'ブラウザの設定で、ログインに必要な保存ができません。プライベートブラウズを使っていれば、ふつうの画面で開いてください。',
  error: 'ログインできませんでした。通信の状態を確認して、もう一度お試しください。',
} as const;

/** ポップアップの許可のしかた（ブロックされたときに出す） */
function PopupHelp() {
  return (
    <ul className="small popup-help" data-testid="popup-help">
      <li>iPhone の Safari：「設定」アプリ →「アプリ」→「Safari」→「ポップアップブロック」をオフ</li>
      <li>iPhone の Chrome：Chrome の「設定」→「コンテンツの設定」→「ポップアップをブロック」をオフ</li>
      <li>Android の Chrome：アドレスバーに出る「ポップアップがブロックされました」から「常に許可」</li>
    </ul>
  );
}

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<keyof typeof MESSAGES | null>(null);
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const inApp = isInAppBrowser(navigator.userAgent);
  // iPhone のホーム画面に追加したアプリ：Google ログインを終えてもアプリに戻れないので、Safari で開く案内を出す
  const iosApp = !inApp && isIOSStandalone(navigator as Navigator & { standalone?: boolean });
  const url = externalUrl(window.location);

  useEffect(() => {
    if (!inApp && !iosApp) preloadLogin();
  }, [inApp, iosApp]);

  // login() は、await を挟まずにこのタップの処理の中で呼ぶ（ポップアップを開くため）
  function onLogin() {
    setMessage(null);
    const pending = login();
    setBusy(true);
    void pending.then((result) => {
      setBusy(false);
      if (result === 'ok') navigate('/home');
      else if (result !== 'cancelled') setMessage(result);
    });
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
        ) : iosApp && LOGIN_ENABLED ? (
          // ホーム画面に追加したアプリ（iPhone）。ポップアップが開けず、ログインを終えてもアプリに戻れない（SPEC §14 #63）
          <div className="card inapp" role="note" data-testid="ios-app-note">
            <p>
              <strong>ログインは Safari で行ってください。</strong>
            </p>
            <p className="small">
              ホーム画面に追加したアプリでは、iPhone の仕組みのため Googleログインができません。下のボタンで Safari
              を開いてログインしてください。ホーム画面のアプリは、ログインせずにこのまま使えます（Safari
              とホーム画面のアプリは、記録が別々に保存されます）。
            </p>
            <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
              Safari で開く
            </a>
            <p className="small">開かないときは、このURLを Safari に貼り付けてください。</p>
            <input
              className="url-box"
              type="text"
              readOnly
              value={url}
              aria-label="このアプリのURL"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        ) : LOGIN_ENABLED ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onLogin}>
              {busy ? 'ログイン中…' : 'Googleでログイン'}
            </button>
            {message && (
              <div className="login-error" role="alert">
                <p className="small error-text">{MESSAGES[message]}</p>
                {message === 'blocked' && <PopupHelp />}
              </div>
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
          className={`btn ${LOGIN_ENABLED && !inApp && !iosApp ? 'btn-secondary' : 'btn-primary'}`}
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
