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

/**
 * 出題のモード。
 * - practice：ふつうの出題。解答を自分の記録に残す
 * - study：管理者が、利用者の苦手問題を自分の端末で出題するとき（勉強会用。SPEC §7）。
 *   解答・チェック・セットの結果を、自分の記録にもクラウドにも残さない
 */
export type QuizMode = 'practice' | 'study';

export interface QuizSession {
  id: string;
  mode: QuizMode;
  questionIds: string[];
  answers: (number | null)[]; // 選んだ番号（1〜4）。未解答は null
  index: number;
  startedAt: number;
}

export interface QuizResult {
  sessionId: string;
  /** 省略時は practice（この項目がなかった頃の結果） */
  mode?: QuizMode;
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
const INFLIGHT_KEY = 'inflight';

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

/**
 * 送信できた分を outbox から引く。送信中に増えた分と、1回の送信で送りきれなかった分は残す。
 * 問題ごとの分は、送ったあとに変わっていなければ（rev が同じ）、回数を送りきった時点で消す
 */
function subtractSent(out: Outbox, sent: Outbox): void {
  for (const [qid, s] of Object.entries(sent.progress)) {
    const cur = out.progress[qid];
    if (!cur) continue;
    cur.attempts = Math.max(0, cur.attempts - s.attempts);
    cur.correct = Math.max(0, Math.min(cur.correct - s.correct, cur.attempts));
    if (cur.rev === s.rev && cur.attempts === 0) delete out.progress[qid];
  }
  for (const [date, s] of Object.entries(sent.days)) {
    const cur = out.days[date];
    if (!cur) continue;
    cur.answered = Math.max(0, cur.answered - s.answered);
    cur.correct = Math.max(0, Math.min(cur.correct - s.correct, cur.answered));
    cur.sessions = cur.sessions.slice(s.sessions.length);
    if (cur.answered <= 0 && cur.sessions.length === 0) delete out.days[date];
  }
}

export async function settleOutbox(sent: Outbox): Promise<void> {
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const out = ((await tx.store.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
  subtractSent(out, sent);
  await tx.store.put(out, OUTBOX_KEY);
  await tx.done;
}

/**
 * 送信中の1回分（SPEC §14：二重加算の防止）。送る前に保存し、届いたと分かったら outbox から引いて消す。
 * 再送するときは、中身と連番（seq）を変えずに同じものを送る。
 * - seq：users/{uid}.syncSeq をこの値にする（ルールで「前回＋1」のときだけ許可される）
 * - attempted：一度でも送信を試みたか（結果が分からないまま終わった可能性がある）
 */
export interface Inflight {
  uid: string;
  seq: number;
  sent: Outbox;
  attempted: boolean;
}

export async function getInflight(): Promise<Inflight | undefined> {
  return (await (await db('user')).get('kv', INFLIGHT_KEY)) as Inflight | undefined;
}
export async function setInflight(f: Inflight): Promise<void> {
  await (await db('user')).put('kv', f, INFLIGHT_KEY);
}
export async function clearInflight(): Promise<void> {
  await (await db('user')).delete('kv', INFLIGHT_KEY);
}

/** 送信中の分が届いたので、outbox から引いて、送信中の記録を消す（同じトランザクションで行い、二重に引かない） */
export async function settleInflight(): Promise<void> {
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const f = (await tx.store.get(INFLIGHT_KEY)) as Inflight | undefined;
  if (f) {
    const out = ((await tx.store.get(OUTBOX_KEY)) as Outbox | undefined) ?? emptyOutbox();
    subtractSent(out, f.sent);
    await tx.store.put(out, OUTBOX_KEY);
    await tx.store.delete(INFLIGHT_KEY);
  }
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
  await importGuestPersonal();
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

// ---- 要復習マーク・メモ（7a-2。本人だけのもの。SPEC §14 #59） --------------------
// 端末内では kv に置く（ゲストは端末内だけ、ログイン中は Firestore の写しと未送信分）。
// 解答の記録（progress・days・outbox）とは別に持ち、記録の送信・管理画面の集計には関わらない。

export const MEMO_MAX = 500;

export interface MemoRec {
  text: string;
  /** 最後に書いた時刻（epoch ms） */
  at: number;
}

/** 未送信の要復習マーク・メモ（ログイン中だけ）。値は「最後に決めた状態」なので、何度送っても同じ結果になる */
export interface PersonalOutbox {
  marks: Record<string, boolean>;
  memos: Record<string, string>;
}

export interface PersonalSync {
  uid: string;
  /** メモを最後に取り込んだ時点（サーバー時刻の epoch ms） */
  memosPulledAt: number;
}

const MARKS_KEY = 'reviewMarks';
const MEMOS_KEY = 'memos';
const POUT_KEY = 'personalOutbox';
const PSYNC_KEY = 'personalSync';
const MIGRATED_KEY = 'marksMigrated';

const emptyPersonalOutbox = (): PersonalOutbox => ({ marks: {}, memos: {} });

/**
 * 要復習マークの一覧。初めて読むときに、これまでの「あとで見直すチェック」（progress.checked）を要復習マークに移す（SPEC §14 #59）
 */
export async function getMarks(kind: LocalDbKind = active): Promise<Set<string>> {
  const d = await db(kind);
  const tx = d.transaction(['progress', 'kv'], 'readwrite');
  const kv = tx.objectStore('kv');
  const marks = new Set((await kv.get(MARKS_KEY)) as string[] | undefined);
  if (!(await kv.get(MIGRATED_KEY))) {
    const checked = (await tx.objectStore('progress').getAll()).filter((p) => p.checked).map((p) => p.id);
    if (checked.length) {
      const out = ((await kv.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
      for (const id of checked) {
        if (marks.has(id)) continue;
        marks.add(id);
        if (kind === 'user') out.marks[id] = true;
      }
      await kv.put([...marks], MARKS_KEY);
      if (kind === 'user') await kv.put(out, POUT_KEY);
    }
    await kv.put(true, MIGRATED_KEY);
  }
  await tx.done;
  return marks;
}

export async function setMark(qid: string, on: boolean): Promise<void> {
  const kind = active;
  await getMarks(kind); // 移行を先に済ませる
  const d = await db(kind);
  const tx = d.transaction('kv', 'readwrite');
  const marks = new Set((await tx.store.get(MARKS_KEY)) as string[] | undefined);
  if (on) marks.add(qid);
  else marks.delete(qid);
  await tx.store.put([...marks], MARKS_KEY);
  if (kind === 'user') {
    const out = ((await tx.store.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
    out.marks[qid] = on;
    await tx.store.put(out, POUT_KEY);
  }
  await tx.done;
}

export async function getMemos(kind: LocalDbKind = active): Promise<Map<string, MemoRec>> {
  const raw = ((await (await db(kind)).get('kv', MEMOS_KEY)) as Record<string, MemoRec> | undefined) ?? {};
  return new Map(Object.entries(raw).filter(([, m]) => m.text));
}

/** メモを書く。空にすると消える。500文字を超えた分は切る */
export async function setMemo(qid: string, text: string, now = Date.now()): Promise<void> {
  const kind = active;
  const clean = text.slice(0, MEMO_MAX);
  const d = await db(kind);
  const tx = d.transaction('kv', 'readwrite');
  const memos = ((await tx.store.get(MEMOS_KEY)) as Record<string, MemoRec> | undefined) ?? {};
  if (clean.trim()) memos[qid] = { text: clean, at: now };
  else delete memos[qid];
  await tx.store.put(memos, MEMOS_KEY);
  if (kind === 'user') {
    const out = ((await tx.store.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
    out.memos[qid] = clean.trim() ? clean : '';
    await tx.store.put(out, POUT_KEY);
  }
  await tx.done;
}

export async function getPersonalOutbox(): Promise<PersonalOutbox> {
  return ((await (await db('user')).get('kv', POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
}

export function personalOutboxSize(out: PersonalOutbox): number {
  return Object.keys(out.marks).length + Object.keys(out.memos).length;
}

/** 送れた分を未送信から消す。送っている間に同じ問題がまた変わっていたら残す */
export async function settlePersonal(sent: PersonalOutbox): Promise<void> {
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const out = ((await tx.store.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
  for (const [q, v] of Object.entries(sent.marks)) if (out.marks[q] === v) delete out.marks[q];
  for (const [q, v] of Object.entries(sent.memos)) if (out.memos[q] === v) delete out.memos[q];
  await tx.store.put(out, POUT_KEY);
  await tx.done;
}

/**
 * Firestore から取り込んだ要復習マーク・メモで、端末内の写しを更新する。まだ送っていない変更は残す（上書きしない）。
 * remoteMarks が null のときは、マークは取り込まない（文書がまだない）
 */
export async function putPulledPersonal(remoteMarks: Set<string> | null, memos: { qid: string; text: string; at: number }[]): Promise<void> {
  await getMarks('user');
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const out = ((await tx.store.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
  if (remoteMarks) {
    const next = new Set(remoteMarks);
    for (const [q, on] of Object.entries(out.marks)) {
      if (on) next.add(q);
      else next.delete(q);
    }
    await tx.store.put([...next], MARKS_KEY);
  }
  if (memos.length) {
    const cur = ((await tx.store.get(MEMOS_KEY)) as Record<string, MemoRec> | undefined) ?? {};
    for (const m of memos) {
      if (m.qid in out.memos) continue;
      if (m.text) cur[m.qid] = { text: m.text, at: m.at };
      else delete cur[m.qid];
    }
    await tx.store.put(cur, MEMOS_KEY);
  }
  await tx.done;
}

export async function getPersonalSync(): Promise<PersonalSync | undefined> {
  return (await (await db('user')).get('kv', PSYNC_KEY)) as PersonalSync | undefined;
}
export async function setPersonalSync(s: PersonalSync): Promise<void> {
  await (await db('user')).put('kv', s, PSYNC_KEY);
}

/** ゲストの要復習マーク・メモを、ログイン中の端末内DBに足す（未送信分にも入れる）。ゲストの分は消す */
export async function importGuestPersonal(): Promise<void> {
  const [gm, gmemo] = await Promise.all([getMarks('guest'), getMemos('guest')]);
  if (!gm.size && !gmemo.size) return;
  await getMarks('user');
  const d = await db('user');
  const tx = d.transaction('kv', 'readwrite');
  const marks = new Set((await tx.store.get(MARKS_KEY)) as string[] | undefined);
  const memos = ((await tx.store.get(MEMOS_KEY)) as Record<string, MemoRec> | undefined) ?? {};
  const out = ((await tx.store.get(POUT_KEY)) as PersonalOutbox | undefined) ?? emptyPersonalOutbox();
  for (const q of gm) {
    marks.add(q);
    out.marks[q] = true;
  }
  for (const [q, m] of gmemo) {
    // 同じ問題に両方のメモがあるときは、新しいほうを残す
    if (!memos[q] || memos[q].at < m.at) {
      memos[q] = m;
      out.memos[q] = m.text;
    }
  }
  await tx.store.put([...marks], MARKS_KEY);
  await tx.store.put(memos, MEMOS_KEY);
  await tx.store.put(out, POUT_KEY);
  await tx.done;
  const g = await db('guest');
  const gtx = g.transaction('kv', 'readwrite');
  await Promise.all([gtx.store.delete(MARKS_KEY), gtx.store.delete(MEMOS_KEY)]);
  await gtx.done;
}
