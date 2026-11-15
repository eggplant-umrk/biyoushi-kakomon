/**
 * 管理画面（SPEC §7）のデータ取得と集計。
 *
 * 読み取りを増やさないよう、取得した結果はこのモジュールの中（メモリ）に持つ：
 * - 利用者の一覧（直近14日の日別の記録つき）は、最初に管理画面を開いたときに1回だけまとめて読む
 * - 問題ごとの記録は、その利用者の詳細を初めて開いたときに1回だけ読む
 * 一覧と詳細を行き来しても読み直さない。読み直すのは「最新の状態に更新」を押したときと、ページを読み込み直したときだけ。
 * 端末（IndexedDB）には保存しないので、他人の記録が管理者の端末に残り続けることはない。
 */
import type { AdminUserData } from './cloud';
import { jstDate, type DayRec, type ProgressRec } from './db';
import { FIELDS } from './fields';
import type { FieldId } from './types';

export type { AdminUserData } from './cloud';

const DAY_MS = 86_400_000;
export const SERIES_DAYS = 14;
export const RECENT_DAYS = 7;
/** 詳細画面に出す苦手問題の数 */
export const WEAK_SHOWN = 10;
/** 「この人の苦手問題で出題」で出す最大の問題数 */
export const WEAK_QUIZ_MAX = 20;

// ---- 集計（純粋な関数）------------------------------------------------------

/** 今日を含む直近 n 日の日付（古い順） */
export function lastDates(now: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => jstDate(now - (n - 1 - i) * DAY_MS));
}

/** 今日を含む直近 n 日の解答数の合計 */
export function recentAnswered(days: readonly DayRec[], now: number, n = RECENT_DAYS): number {
  const dates = new Set(lastDates(now, n));
  return days.filter((d) => dates.has(d.date)).reduce((sum, d) => sum + d.answered, 0);
}

/** 直近 n 日の日別の解答数（記録のない日は 0。古い順） */
export function dailySeries(days: readonly DayRec[], now: number, n = SERIES_DAYS): DayRec[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return lastDates(now, n).map((date) => byDate.get(date) ?? { date, answered: 0, correct: 0 });
}

// ---- 更新回数が異常に多い利用者（SPEC §8.2）---------------------------------
// 1人のログイン利用者が、無料枠の書き込みを使い切るほど送り続けていないかの目安。一覧で読んでいる users と days だけで判定し、
// 読み取りは増やさない。表示名の変更・要復習マーク・メモの書き込みの回数は、記録に残らないので分からない（SPEC §8.6）

/** 送信回数（syncSeq）が、解答数よりこれだけ多ければ目立たせる。アプリは10問ごとと、セットの終わりに送るので、ふつうは解答数より少ない */
export const ALERT_EXTRA_SENDS = 200;
/** 1日あたりの解答数がこれを超えたら目立たせる（全770問を1日に解いても届かない数） */
export const ALERT_ANSWERS_PER_DAY = 1000;

export type ActivityAlert = 'sends' | 'answers';

/** 更新回数が異常に多い利用者の印。sends＝解答の伴わない送信が多い、answers＝1日の解答数が多すぎる */
export function activityAlerts(u: AdminUserData, now: number): ActivityAlert[] {
  const alerts: ActivityAlert[] = [];
  if (u.syncSeq > u.answered + ALERT_EXTRA_SENDS) alerts.push('sends');
  const since = u.createdAt > 0 ? u.createdAt : now;
  const perDay = u.answered / Math.max(1, (now - since) / DAY_MS);
  const maxDay = Math.max(0, ...u.days.map((d) => d.answered));
  if (perDay > ALERT_ANSWERS_PER_DAY || maxDay > ALERT_ANSWERS_PER_DAY) alerts.push('answers');
  return alerts;
}

/** 一覧の並び順：更新回数が異常に多い人を先に、あとは最終学習日の新しい順 */
export function sortUsers(users: readonly AdminUserData[], now = Date.now()): AdminUserData[] {
  const flagged = (u: AdminUserData) => (activityAlerts(u, now).length > 0 ? 1 : 0);
  return [...users].sort(
    (a, b) => flagged(b) - flagged(a) || b.lastActiveAt - a.lastActiveAt || a.displayName.localeCompare(b.displayName, 'ja'),
  );
}

/** 管理画面で同じ表示名の人を見分けるための、uid の先頭6文字 */
export function shortUid(uid: string): string {
  return uid.slice(0, 6);
}

/** 「今日（11/13）」「昨日（11/12）」「3日前（11/10）」のような最終学習日の表示。0 を渡すと「—」（まだ解いていない人） */
export function lastActiveLabel(lastActiveAt: number, now: number): string {
  if (!lastActiveAt) return '—';
  const date = jstDate(lastActiveAt);
  const diff = Math.round((Date.parse(jstDate(now)) - Date.parse(date)) / DAY_MS);
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  if (diff <= 0) return `今日（${md}）`;
  if (diff === 1) return `昨日（${md}）`;
  return `${diff}日前（${md}）`;
}

export interface FieldRate {
  fieldId: FieldId;
  answered: number;
  correct: number;
}

/** 分野別の成績。正答率の低い順（まだ解いていない分野は最後） */
export function fieldRates(byField: AdminUserData['byField']): FieldRate[] {
  const rate = (f: FieldRate) => (f.answered ? f.correct / f.answered : Number.POSITIVE_INFINITY);
  return FIELDS.map((f) => ({ fieldId: f.id, answered: byField[f.id]?.answered ?? 0, correct: byField[f.id]?.correct ?? 0 })).sort(
    (a, b) => rate(a) - rate(b),
  );
}

/**
 * 苦手問題：直近の解答が不正解の問題（1回だけ解いて間違えた問題も含む。SPEC §14）。
 * 間違えたことがあっても、直近で正解できた問題は含めない（もう解けるようになったとみなす）。
 * 正答率の低い順、同じなら解いた回数の多い順、最近解いた順。
 */
export function weakQuestions(progress: readonly ProgressRec[], limit: number): ProgressRec[] {
  return progress
    .filter((p) => p.attempts > 0 && p.lastCorrect === false)
    .sort(
      (a, b) =>
        a.correctCount / a.attempts - b.correctCount / b.attempts ||
        b.attempts - a.attempts ||
        b.lastAnsweredAt - a.lastAnsweredAt ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

// ---- 取得とキャッシュ -------------------------------------------------------

interface UsersCache {
  users: AdminUserData[];
  fetchedAt: number;
}

let usersCache: Promise<UsersCache> | null = null;
const progressCache = new Map<string, Promise<ProgressRec[]>>();

/** 利用者の一覧。2回目以降はメモリの結果を返す（Firestore を読まない） */
export function loadAdminUsers(): Promise<UsersCache> {
  usersCache ??= import('./cloud')
    .then((c) => c.adminLoadUsers())
    .then((users) => ({ users: sortUsers(users, Date.now()), fetchedAt: Date.now() }))
    .catch((e: unknown) => {
      usersCache = null; // 失敗したら、次に開いたときにやり直す
      throw e;
    });
  return usersCache;
}

/** 利用者1人の問題ごとの記録。2回目以降はメモリの結果を返す */
export function loadAdminProgress(uid: string): Promise<ProgressRec[]> {
  let p = progressCache.get(uid);
  if (!p) {
    p = import('./cloud').then((c) => c.adminLoadProgress(uid));
    p.catch(() => progressCache.delete(uid));
    progressCache.set(uid, p);
  }
  return p;
}

/** 「最新の状態に更新」：メモリの結果を捨てる（次の取得で Firestore を読み直す） */
export function clearAdminCache(): void {
  usersCache = null;
  progressCache.clear();
}
