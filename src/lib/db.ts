import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FieldId } from './types';

/**
 * ゲストモードの端末内記録（IndexedDB）。SPEC §6.2 / §6.3 の Firestore のモデルに形をそろえておき、
 * フェーズ3でログイン時に引き継げるようにする。
 */

export interface ProgressRec {
  id: string; // 問題ID
  attempts: number;
  correctCount: number;
  history: string; // 直近10回の正誤 "○×○"
  lastAnsweredAt: number; // epoch ms
  checked: boolean;
  lastCorrect: boolean | null;
}

export interface DayRec {
  date: string; // YYYY-MM-DD（日本時間）
  answered: number;
  correct: number;
}

export interface QuizSession {
  id: string;
  mode: 'practice';
  questionIds: string[];
  answers: (number | null)[]; // 選んだ番号（1〜4）。未解答は null
  index: number;
  startedAt: number;
}

export interface QuizResult {
  sessionId: string;
  questionIds: string[];
  answers: (number | null)[];
  correctFlags: boolean[];
  fieldIds: FieldId[];
  endedAt: number;
}

interface KakomonDB extends DBSchema {
  progress: { key: string; value: ProgressRec };
  days: { key: string; value: DayRec };
  kv: { key: string; value: unknown };
}

const DB_NAME = 'kakomon-guest';
let dbp: Promise<IDBPDatabase<KakomonDB>> | null = null;

function db(): Promise<IDBPDatabase<KakomonDB>> {
  dbp ??= openDB<KakomonDB>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('progress', { keyPath: 'id' });
      d.createObjectStore('days', { keyPath: 'date' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

/** 日本時間の YYYY-MM-DD */
export function jstDate(epochMs: number): string {
  return new Date(epochMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function emptyProgress(id: string): ProgressRec {
  return { id, attempts: 0, correctCount: 0, history: '', lastAnsweredAt: 0, checked: false, lastCorrect: null };
}

export function applyAnswer(p: ProgressRec, correct: boolean, now: number): ProgressRec {
  return {
    ...p,
    attempts: p.attempts + 1,
    correctCount: p.correctCount + (correct ? 1 : 0),
    history: (p.history + (correct ? '○' : '×')).slice(-10),
    lastAnsweredAt: now,
    lastCorrect: correct,
  };
}

export async function recordAnswer(qid: string, correct: boolean, now = Date.now()): Promise<ProgressRec> {
  const d = await db();
  const tx = d.transaction(['progress', 'days'], 'readwrite');
  const ps = tx.objectStore('progress');
  const ds = tx.objectStore('days');
  const next = applyAnswer((await ps.get(qid)) ?? emptyProgress(qid), correct, now);
  await ps.put(next);
  const date = jstDate(now);
  const day = (await ds.get(date)) ?? { date, answered: 0, correct: 0 };
  await ds.put({ date, answered: day.answered + 1, correct: day.correct + (correct ? 1 : 0) });
  await tx.done;
  return next;
}

export async function setChecked(qid: string, checked: boolean): Promise<ProgressRec> {
  const d = await db();
  const tx = d.transaction('progress', 'readwrite');
  const next = { ...((await tx.store.get(qid)) ?? emptyProgress(qid)), checked };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function getAllProgress(): Promise<Map<string, ProgressRec>> {
  const all = await (await db()).getAll('progress');
  return new Map(all.map((p) => [p.id, p]));
}

export async function getAllDays(): Promise<DayRec[]> {
  return (await db()).getAll('days');
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}
async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
}
async function kvDel(key: string): Promise<void> {
  await (await db()).delete('kv', key);
}

export const getSession = () => kvGet<QuizSession>('currentSession');
export const saveSession = (s: QuizSession) => kvSet('currentSession', s);
export const clearSession = () => kvDel('currentSession');
export const getLastResult = () => kvGet<QuizResult>('lastResult');
export const saveLastResult = (r: QuizResult) => kvSet('lastResult', r);

/** 端末内の記録をすべて消す（設定 → データ削除） */
export async function clearAllLocal(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['progress', 'days', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('progress').clear(), tx.objectStore('days').clear(), tx.objectStore('kv').clear()]);
  await tx.done;
}
