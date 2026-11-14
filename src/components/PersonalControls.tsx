import { useState } from 'react';
import type { MemoRec } from '../lib/db';
import { toggleMark } from '../lib/personal';
import { Icon } from './Icon';

/**
 * 要復習マーク（★）とメモ（7a-2）。解答画面と閲覧モードの両方で使う。
 * どちらも本人だけのもの（SPEC §14 #59）。入力された文字は、React の文字として表示する（HTML として解釈しない）。
 */

export function MarkButton({ qid, on, compact = false }: { qid: string; on: boolean; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`icon-btn star ${on ? 'on' : ''} ${compact ? 'compact' : ''}`}
      aria-pressed={on}
      aria-label={on ? '要復習マークを外す' : '要復習マークを付ける'}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void toggleMark(qid, !on).finally(() => setBusy(false));
      }}
    >
      <Icon name="star" filled={on} />
      <span className="star-label">{on ? '要復習中' : '要復習'}</span>
    </button>
  );
}

export function MemoButton({ memo, onOpen }: { memo: MemoRec | undefined; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`icon-btn star memo-btn ${memo ? 'on' : ''}`}
      aria-label={memo ? 'メモを開く（メモあり）' : 'メモを書く'}
      onClick={onOpen}
    >
      <Icon name="note" />
      <span className="star-label">{memo ? 'メモあり' : 'メモ'}</span>
    </button>
  );
}

/** 保存したメモの表示（解説の下など）。文字としてそのまま出す */
export function MemoView({ memo, onEdit }: { memo: MemoRec; onEdit: () => void }) {
  return (
    <div className="memo-view" data-testid="memo-view">
      <div className="memo-view-head">
        <span className="memo-view-label">
          <Icon name="note" size={16} />
          自分のメモ
        </span>
        <button type="button" className="link-btn" onClick={onEdit}>
          編集
        </button>
      </div>
      <p className="memo-view-text">{memo.text}</p>
    </div>
  );
}
