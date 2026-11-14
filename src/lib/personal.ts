import { useEffect, useState, useSyncExternalStore } from 'react';
import { getMarks, getMemos, setMark as dbSetMark, setMemo as dbSetMemo, type MemoRec } from './db';

/**
 * 要復習マーク・メモ（7a-2）を画面から使うための小さな入れ物。
 * 書き込みは端末内DB（db.ts）に保存し、ログイン中は未送信分に入れて、少し待ってからまとめて送る（auth.ts）。
 * 本人だけのもの：Firestore では本人しか読めない場所に置き、管理画面には出さない（SPEC §14 #59）。
 */

let version = 0;
const listeners = new Set<() => void>();
let onChange: (() => void) | null = null;

/** 画面に「変わった」と知らせる（取り込み・書き込みのあと） */
export function bumpPersonal(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** 書き込んだあとに呼ぶ関数（ログイン中の送信の予約）を登録する。auth.ts から使う */
export function onPersonalChange(fn: () => void): void {
  onChange = fn;
}

export function usePersonalVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}

export interface Personal {
  marks: Set<string>;
  memos: Map<string, MemoRec>;
}

/** 要復習マークとメモ。変わるたびに読み直す。読み込み中は null */
export function usePersonal(extraDep: unknown = 0): Personal | null {
  const v = usePersonalVersion();
  const [data, setData] = useState<Personal | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([getMarks(), getMemos()]).then(([marks, memos]) => {
      if (alive) setData({ marks, memos });
    });
    return () => {
      alive = false;
    };
  }, [v, extraDep]);
  return data;
}

export async function toggleMark(qid: string, on: boolean): Promise<void> {
  await dbSetMark(qid, on);
  bumpPersonal();
  onChange?.();
}

export async function saveMemo(qid: string, text: string): Promise<void> {
  await dbSetMemo(qid, text);
  bumpPersonal();
  onChange?.();
}
