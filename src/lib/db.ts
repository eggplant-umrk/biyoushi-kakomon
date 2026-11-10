import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { FieldId } from './types';

/**
 * 端末内の記録（IndexedDB）。SPEC §6.2 / §6.3 の Firestore のモデルに形をそろえてある。
 *
 * - ゲスト：`kakomon-guest`。記録はこの端末の中だけ
 * - ログイン中：`kakomon-user`。Firestore の記録の写し（キャッシュ）と、未送信分（outbox）を置く。
 *   ログアウト・アカウント削除のときに丸ごと消す
 *
 * 画面はどちらの場合も「いま有効な端末内DB」だけを読み書きする。Firestore との同期は cloud.ts が行う。
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
  /** その日に記録したセットの数（ログイン中だけ使う。Firestore の sessions は最大50件） */
  sessionCount?: number;
}

/** セット1回分の結果（Firestore の days/{日付}.sessions の1件） */
export interface SessionRec {
  mode: 'practice';
  total: number;
  correct: number;
  endedAt: number; // epoch ms
}

/**
 * Firestore へまだ送っていない分（ログイン中だけ使う。SPEC §6.4）。
 * 回数は「増えた分」で持ち、送信時に increment() で足す（別の端末の記録を上書きしないため）。
 * rev は変更のたびに増やし、送信中に同じ問題がまた変わったかを見分ける。
 */
export interface Outbox {
  progress: Record<string, { attempts: number; correct: number; rev: number }>;
  days: Record<string, { answered: number; correct: number; sessions: SessionRec[] }>;
}

export interface SyncState {
  uid: string;
  /** 最後に Firestore から取り込んだ時点（サーバー時刻の epoch ms）。0 はまだ取り込んでいない */
  lastPulledAt: number;
}

export const MAX_SESSIONS_PER_DAY = 50;

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

export type LocalDbKind = 'guest' | 'user';
const DB_NAMES: Record<LocalDbKind, string> = { guest: 'kakomon-guest', user: 'kakomon-user' };
const OUTBOX_KEY = 'outbox';
const SYNC_KEY = 'syncState';

let active: LocalDbKind = 'guest';
const opened = new Map<LocalDbKind, Promise<IDBPDatabase<KakomonDB>>>();

function db(kind: LocalDbKind = active): Promise<IDBPDatabase<KakomonDB>> {
  let p = opened.get(kind);
  if (!p) {
    p = openDB<KakomonDB>(DB_NAMES[kind], 1, {
      upgrade(d) {
        d.createObjectStore('progress', { keyPath: 'id' });
        d.createObjectStore('days', { keyPath: 'date' });
        d.createObjectStore('kv');
      },
    });
    opened.set(kind, p);
  }
  return p;
}

/** 画面が読み書きする端末内DBを切り替える（ログインしたら 'user'、していなければ 'guest'） */
export function setLocalDb(kind: LocalDbKind): void {
  active = kind;
}
export function activeLocalDb(): LocalDbKind {
  return active;
}

const emptyOutbox = (): Outbox => ({ progress: {}, days: {} });

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
  const kind = active;
  const d = await db(kind);
  const tx = d.transaction(['progress', 'days', 'kv'], 'readwrite');
  const ps = tx.objectStore('progress');
  const ds = tx.objectStore('days');
  const next = applyAnswer((await ps.get(qid)) ?? emptyProgress(qid), correct, now);
  await ps.put(next);
  const date = jstDate(now);
  const day = (await ds.get(date)) ?? { date, answered: 0, correct: 0 };
  await ds.put({ ...day, answered: day.answered + 1, correct: day.correct + (correct ? 1 : 0) });
  if (kind === 'user') {
    const kv = tx.objectStore('kv');
    const out = ((await kv.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
    const p = (out.progress[qid] ??= { attempts: 0, correct: 0, rev: 0 });
    p.attempts += 1;
    p.correct += correct ? 1 : 0;
    p.rev += 1;
    const od = (out.days[date] ??= { answered: 0, correct: 0, sessions: [] });
    od.answered += 1;
    od.correct += correct ? 1 : 0;
    await kv.put(out, OUTBOX_KEY);
  }
  await tx.done;
  return next;
}

export async function setChecked(qid: string, checked: boolean): Promise<ProgressRec> {
  const kind = active;
  const d = await db(kind);
  const tx = d.transaction(['progress', 'kv'], 'readwrite');
  const ps = tx.objectStore('progress');
  const next = { ...((await ps.get(qid)) ?? emptyProgress(qid)), checked };
  await ps.put(next);
  if (kind === 'user') {
    const kv = tx.objectStore('kv');
    const out = ((await kv.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
    (out.progress[qid] ??= { attempts: 0, correct: 0, rev: 0 }).rev += 1;
    await kv.put(out, OUTBOX_KEY);
  }
  await tx.done;
  return next;
}

/** セットの結果を、その日の記録に足す（ログイン中だけ。1日50件まで） */
export async function addSessionRecord(rec: SessionRec): Promise<void> {
  if (active !== 'user') return;
  const d = await db('user');
  const tx = d.transaction(['days', 'kv'], 'readwrite');
  const ds = tx.objectStore('days');
  const date = jstDate(rec.endedAt);
  const day = (await ds.get(date)) ?? { date, answered: 0, correct: 0 };
  if ((day.sessionCount ?? 0) < MAX_SESSIONS_PER_DAY) {
    await ds.put({ ...day, sessionCount: (day.sessionCount ?? 0) + 1 });
    const kv = tx.objectStore('kv');
    const out = ((await kv.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
    (out.days[date] ??= { answered: 0, correct: 0, sessions: [] }).sessions.push(rec);
    await kv.put(out, OUTBOX_KEY);
  }
  await tx.done;
}

export async function getAllProgress(): Promise<Map<string, ProgressRec>> {
  const all = await (await db()).getAll('progress');
  return new Map(all.map((p) => [p.id, p]));
}

export async function getAllDays(): Promise<DayRec[]> {
  return (await db()).getAll('days');
}

// ---- ログイン中の端末内DB（Firestore の写し）を cloud.ts から操作するための関数 ----

export async function getOutbox(): Promise<Outbox> {
  return ((await (await db('user')).get('kv', OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
}

export function outboxSize(out: Outbox): number {
  return Object.keys(out.progress).length + Object.keys(out.days).length;
}

/** 送信できた分を outbox から引く。送信中に増えた分は残す */
export async function settleOutbox(sent: Outbox): Promise<void> {
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const out = ((await tx.store.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
  for (const [qid, s] of Object.entries(sent.progress)) {
    const cur = out.progress[qid];
    if (!cur) continue;
    if (cur.rev === s.rev) delete out.progress[qid];
    else {
      cur.attempts -= s.attempts;
      cur.correct -= s.correct;
    }
  }
  for (const [date, s] of Object.entries(sent.days)) {
    const cur = out.days[date];
    if (!cur) continue;
    cur.answered -= s.answered;
    cur.correct -= s.correct;
    cur.sessions = cur.sessions.slice(s.sessions.length);
    if (cur.answered <= 0 && cur.sessions.length === 0) delete out.days[date];
  }
  await tx.store.put(out, OUTBOX_KEY);
  await tx.done;
}

/** 送れない日付（今日・前日より前。ルールで書けない）の未送信分を捨てる */
export async function dropOutboxDays(dates: string[]): Promise<void> {
  if (!dates.length) return;
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const out = ((await tx.store.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
  for (const date of dates) delete out.days[date];
  await tx.store.put(out, OUTBOX_KEY);
  await tx.done;
}

export async function getSyncState(): Promise<SyncState | undefined> {
  return (await (await db('user')).get('kv', SYNC_KEY)) as SyncState | undefined;
}
export async function setSyncState(s: SyncState): Promise<void> {
  await (await db('user')).put('kv', s, SYNC_KEY);
}

/** Firestore から取り込んだ記録で、端末内の写しを置き換える */
export async function putPulled(progress: ProgressRec[], days: DayRec[]): Promise<void> {
  const d = await db('user');
  const tx = d.transaction(['progress', 'days'], 'readwrite');
  await Promise.all([
    ...progress.map((p) => tx.objectStore('progress').put(p)),
    ...days.map((x) => tx.objectStore('days').put(x)),
  ]);
  await tx.done;
}

export async function getUserProgress(ids: string[]): Promise<Map<string, ProgressRec>> {
  const d = await db('user');
  const tx = d.transaction('progress', 'readonly');
  const recs = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return new Map(recs.filter((r): r is ProgressRec => !!r).map((r) => [r.id, r]));
}

/** ゲストの記録がある問題の数（1回以上解いたか、チェックを付けた問題） */
export async function guestProgressCount(): Promise<number> {
  return (await db('guest')).count('progress');
}

/**
 * ゲストの記録を、ログイン中の端末内DBに足し込む（SPEC §6.2）。足した分は outbox に入り、次の送信で Firestore に届く。
 * 日別の記録は、ルールで書ける今日・前日の分だけ引き継ぐ。終わったらゲストの記録は消す。
 */
export async function importGuestIntoUser(now = Date.now()): Promise<number> {
  const g = await db('guest');
  const [gp, gd] = await Promise.all([g.getAll('progress'), g.getAll('days')]);
  const u = await db('user');
  const tx = u.transaction(['progress', 'days', 'kv'], 'readwrite');
  const ps = tx.objectStore('progress');
  const ds = tx.objectStore('days');
  const kv = tx.objectStore('kv');
  const out = ((await kv.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
  for (const p of gp) {
    const cur = (await ps.get(p.id)) ?? emptyProgress(p.id);
    const guestIsNewer = p.lastAnsweredAt >= cur.lastAnsweredAt;
    await ps.put({
      id: p.id,
      attempts: cur.attempts + p.attempts,
      correctCount: cur.correctCount + p.correctCount,
      history: (guestIsNewer ? cur.history + p.history : p.history + cur.history).slice(-10),
      lastAnsweredAt: Math.max(cur.lastAnsweredAt, p.lastAnsweredAt),
      checked: cur.checked || p.checked,
      lastCorrect: guestIsNewer ? (p.lastCorrect ?? cur.lastCorrect) : cur.lastCorrect,
    });
    const o = (out.progress[p.id] ??= { attempts: 0, correct: 0, rev: 0 });
    o.attempts += p.attempts;
    o.correct += p.correctCount;
    o.rev += 1;
  }
  const writable = new Set([jstDate(now), jstDate(now - 86_400_000)]);
  for (const day of gd) {
    if (!writable.has(day.date)) continue;
    const cur = (await ds.get(day.date)) ?? { date: day.date, answered: 0, correct: 0 };
    await ds.put({ ...cur, answered: cur.answered + day.answered, correct: cur.correct + day.correct });
    const o = (out.days[day.date] ??= { answered: 0, correct: 0, sessions: [] });
    o.answered += day.answered;
    o.correct += day.correct;
  }
  await kv.put(out, OUTBOX_KEY);
  await tx.done;
  await clearAllLocal('guest');
  return gp.length;
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

/** 端末内の記録をすべて消す（設定 → データ削除、ログアウト、アカウント削除） */
export async function clearAllLocal(kind: LocalDbKind = active): Promise<void> {
  const d = await db(kind);
  const tx = d.transaction(['progress', 'days', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('progress').clear(), tx.objectStore('days').clear(), tx.objectStore('kv').clear()]);
  await tx.done;
}
