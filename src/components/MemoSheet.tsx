import { useEffect, useRef, useState } from 'react';
import { MEMO_MAX, type MemoRec } from '../lib/db';
import { saveMemo } from '../lib/personal';
import { Icon } from './Icon';

/** メモを書く画面（下から出るシート）。500文字まで。空にして保存すると消える */
export function MemoSheet({
  qid,
  title,
  memo,
  onClose,
}: {
  qid: string;
  title: string;
  memo: MemoRec | undefined;
  onClose: () => void;
}) {
  const [text, setText] = useState(memo?.text ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const changedRef = useRef(false);
  // 書きかけのまま閉じようとしたら、捨ててよいかを確かめる（誤って背景を押して消えないように）
  const tryClose = () => {
    if (changedRef.current) setConfirmDiscard(true);
    else onClose();
  };
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (changedRef.current) setConfirmDiscard(true);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const save = async (value: string) => {
    setSaving(true);
    try {
      await saveMemo(qid, value);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  const changed = text !== (memo?.text ?? '');
  changedRef.current = changed;
  return (
    <div className="sheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && tryClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="memo-title">
        <div className="sheet-head">
          <h2 id="memo-title" className="card-title">
            <Icon name="note" size={20} />
            メモ<span className="small muted">（{title}）</span>
          </h2>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={tryClose}>
            <Icon name="close" />
          </button>
        </div>
        <p className="small muted">自分用のメモです。ほかの利用者や、アプリの管理画面には表示されません。</p>
        <label className="sr-only" htmlFor="memo-text">
          メモ
        </label>
        <textarea
          id="memo-text"
          ref={area}
          className="memo-text"
          value={text}
          maxLength={MEMO_MAX}
          rows={6}
          placeholder="覚え方や、間違えた理由など"
          onChange={(e) => setText(e.target.value)}
        />
        <p className="memo-count small muted" aria-live="polite">
          {text.length} / {MEMO_MAX}文字
        </p>
        {confirmDiscard && (
          <div className="discard" role="alertdialog" aria-label="書いたメモを捨てますか">
            <p>書いたメモは、まだ保存していません。捨てますか？</p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                捨てる
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDiscard(false)}>
                書き続ける
              </button>
            </div>
          </div>
        )}
        <div className="sheet-actions">
          {memo && (
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => void save('')}>
              メモを消す
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !changed}
            onClick={() => void save(text)}
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
