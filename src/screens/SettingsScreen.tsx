import { useState } from 'react';
import { Footer } from '../components/common';
import { clearAllLocal } from '../lib/db';
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
  // 確認ダイアログ（window.confirm）は使わず、2段階のボタンで誤操作を防ぐ
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <div className="screen">
      <h1 className="screen-title">設定</h1>

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
                void clearAllLocal().then(() => {
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

      <section className="card">
        <h2 className="card-title">ログイン</h2>
        <p className="small muted">現在はログインせずに使っています（記録はこの端末だけに保存）。Googleログインは準備中です。</p>
      </section>
      <Footer />
    </div>
  );
}
