import { useEffect, useState } from 'react';
import { Footer } from '../components/common';
import { changeDisplayName, deleteAccount, logout, useAuth } from '../lib/auth';
import { clearAllLocal } from '../lib/db';
import { cleanDisplayName, DISPLAY_NAME_MAX } from '../lib/displayName';
import { navigate } from '../lib/router';
import { resetSettings, updateSettings, useSettings, type Settings } from '../lib/settings';

const FONT: [Settings['fontSize'], string][] = [
  ['normal', '標準'],
  ['large', '大'],
  ['xlarge', '特大'],
];
const THEME: [Settings['theme'], string][] = [
  ['system', '端末に合わせる'],
  ['light', 'ライト'],
  ['dark', 'ダーク'],
];

export function SettingsScreen() {
  const s = useSettings();
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn';

  return (
    <div className="screen">
      <h1 className="screen-title">設定</h1>

      {signedIn && <DisplayNameCard current={auth.displayName} />}

      <fieldset className="card">
        <legend className="card-title">文字サイズ</legend>
        <div className="segmented">
          {FONT.map(([v, label]) => (
            <label key={v} className="seg">
              <input
                type="radio"
                name="font"
                checked={s.fontSize === v}
                onChange={() => updateSettings({ fontSize: v })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">画面の明るさ</legend>
        <div className="segmented">
          {THEME.map(([v, label]) => (
            <label key={v} className="seg">
              <input type="radio" name="theme" checked={s.theme === v} onChange={() => updateSettings({ theme: v })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">振動</legend>
        <label className="radio-row">
          <input
            type="checkbox"
            checked={s.vibration}
            onChange={(e) => updateSettings({ vibration: e.target.checked })}
          />
          <span>正解・不正解のときに軽く振動する（対応しているAndroid端末のみ）</span>
        </label>
      </fieldset>

      {signedIn ? (
        <>
          <LogoutCard syncError={auth.syncError} />
          <DeleteAccountCard />
        </>
      ) : (
        <>
          <GuestDeleteCard />
          <section className="card">
            <h2 className="card-title">ログイン</h2>
            <p className="small muted">
              現在はログインせずに使っています（記録はこの端末だけに保存）。Googleでログインすると、記録をクラウドに保存して別の端末でも続きから使えます。
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                updateSettings({ guest: false });
                navigate('/');
              }}
            >
              ログイン画面へ
            </button>
          </section>
        </>
      )}
      <Footer />
    </div>
  );
}

/** 表示名の変更。利用者が入力する文字列はこれだけ（SPEC §8.4） */
function DisplayNameCard({ current }: { current: string }) {
  const [value, setValue] = useState(current);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setValue(current);
  }, [current]);

  const clean = cleanDisplayName(value);

  async function save() {
    if (!clean || clean === current || status === 'saving') return;
    setStatus('saving');
    try {
      await changeDisplayName(clean);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">表示名</h2>
      <p className="small muted">作成者に表示される名前です（{DISPLAY_NAME_MAX}文字まで）。</p>
      {/* CSP で form-action 'none' にしているので <form> は使わず、ボタンと Enter キーで保存する */}
      <div className="stack">
        <input
          className="text-input"
          type="text"
          name="displayName"
          aria-label="表示名"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX * 2}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus('idle');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!clean || clean === current || status === 'saving'}
          onClick={() => void save()}
        >
          {status === 'saving' ? '保存中…' : '表示名を変更する'}
        </button>
      </div>
      {status === 'saved' && (
        <p className="small" role="status">
          変更しました。
        </p>
      )}
      {status === 'error' && (
        <p className="small error-text" role="alert">
          変更できませんでした。通信の状態を確認して、もう一度お試しください。
        </p>
      )}
    </section>
  );
}

function LogoutCard({ syncError }: { syncError: boolean }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(0);

  async function run(force: boolean) {
    setBusy(true);
    try {
      const r = await logout(force);
      setPending(r.pending);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">ログアウト</h2>
      <p className="small muted">
        Googleでログインしています。記録はクラウドに保存されます。ログアウトすると、この端末に残っている記録の写しを消します（クラウドの記録は消えません）。
      </p>
      {syncError && pending === 0 && (
        <p className="small" role="status">
          まだ送信できていない記録があります。通信できるようになると自動で送信します。
        </p>
      )}
      {pending > 0 ? (
        <div className="stack">
          <p className="small error-text" role="alert">
            まだクラウドに送信できていない記録が {pending} 件あります。このままログアウトすると、その記録は失われます。
          </p>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(true)}>
            送信せずにログアウトする
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPending(0)}>
            やめる
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(false)}>
          {busy ? 'ログアウト中…' : 'ログアウト'}
        </button>
      )}
    </section>
  );
}

/** アカウント削除（SPEC §8.4）。確認ダイアログは使わず、2段階のボタンで誤操作を防ぐ */
function DeleteAccountCard() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'working' | 'error'>('idle');

  async function run() {
    setStep('working');
    try {
      await deleteAccount();
    } catch {
      setStep('error');
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">アカウントの削除</h2>
      <p className="small muted">
        クラウドに保存した学習記録と、このアプリのアカウントをすべて削除します。元に戻せません。本人確認のため、もう一度Googleでログインする画面が出ます。
      </p>
      {step === 'idle' && (
        <button type="button" className="btn btn-secondary" onClick={() => setStep('confirm')}>
          アカウントを削除する
        </button>
      )}
      {(step === 'confirm' || step === 'working' || step === 'error') && (
        <div className="stack">
          {step === 'error' && (
            <p className="small error-text" role="alert">
              削除できませんでした。同じGoogleアカウントでログインし直したか、通信の状態を確認して、もう一度お試しください。
            </p>
          )}
          <button type="button" className="btn btn-danger" disabled={step === 'working'} onClick={() => void run()}>
            {step === 'working' ? '削除中…' : '本当に削除する'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={step === 'working'} onClick={() => setStep('idle')}>
            やめる
          </button>
        </div>
      )}
    </section>
  );
}

function GuestDeleteCard() {
  // 確認ダイアログ（window.confirm）は使わず、2段階のボタンで誤操作を防ぐ
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <section className="card">
      <h2 className="card-title">記録の削除</h2>
      <p className="small muted">この端末に保存した学習記録（ゲストモードの記録）をすべて削除します。元に戻せません。</p>
      {deleted ? (
        <p role="status">削除しました。</p>
      ) : confirmDelete ? (
        <div className="stack">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void clearAllLocal('guest').then(() => {
                resetSettings();
                setDeleted(true);
                navigate('/');
              });
            }}
          >
            本当に削除する
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
            やめる
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(true)}>
          記録を削除する
        </button>
      )}
    </section>
  );
}
