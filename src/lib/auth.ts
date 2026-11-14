import { useSyncExternalStore } from 'react';
import { LOGIN_ENABLED } from './config';
import {
  addSessionRecord,
  clearAllLocal,
  getOutbox,
  getPersonalOutbox,
  getSyncState,
  guestProgressCount,
  importGuestIntoUser,
  outboxSize,
  personalOutboxSize,
  setLocalDb,
  setSyncState,
  type SessionRec,
} from './db';
import { bumpPersonal, onPersonalChange } from './personal';
import { getSettings, updateSettings } from './settings';

/**
 * ログイン状態の入れ物。Firebase を使う処理（cloud.ts）はここから動的 import で読み込む。
 * ゲストで使っている間は cloud.ts を読み込まない。
 */
export interface AuthState {
  /** off＝ログインしていない / loading＝確認中 / signedIn＝ログイン中 */
  status: 'off' | 'loading' | 'signedIn';
  uid: string | null;
  displayName: string;
  /** 管理者だけが読める admin/ping を読めた（SPEC §6.5） */
  isAdmin: boolean;
  /** 引き継ぐか確認するゲスト記録の問題数（0 なら確認しない） */
  importCount: number;
  /** 直近の送信・取り込みに失敗した（通信できないときなど。次の機会にやり直す） */
  syncError: boolean;
  /** 端末内の記録が Firestore から更新されるたびに増える。画面の再読み込みに使う */
  dataVersion: number;
}

const FLUSH_EVERY = 10; // 10問ごとに送信（SPEC §6.4）
const REFRESH_MIN_INTERVAL_MS = 60_000;

let state: AuthState = {
  status: 'off',
  uid: null,
  displayName: '',
  isAdmin: false,
  importCount: 0,
  syncError: false,
  dataVersion: 0,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getAuthState(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getAuthState,
    getAuthState,
  );
}

type Cloud = typeof import('./cloud');
let cloudPromise: Promise<Cloud> | null = null;
/** 読み込み済みの cloud.ts（ログインのタップの処理の中で、await を挟まずにポップアップを開くために使う） */
let cloudLoaded: Cloud | null = null;
function loadCloud(): Promise<Cloud> {
  cloudPromise ??= import('./cloud').then((c) => {
    cloudLoaded = c;
    return c;
  });
  return cloudPromise;
}

/** ログイン画面を開いたときに先に読み込んでおく（ボタンを押してから読み込むと、ポップアップがブロックされやすい） */
export function preloadLogin(): void {
  if (LOGIN_ENABLED) {
    void loadCloud()
      .then((c) => c.prepare())
      .catch(() => undefined); // 読み込めなくても、ゲストでは使える
  }
}

let watching = false;
let signedInWaiters: (() => void)[] = [];
let lastRefreshAt = 0;
let answersSinceFlush = 0;

function watchWith(cloud: Cloud): void {
  if (watching) return;
  watching = true;
  cloud.watchAuth((user) => {
    if (user) void onSignedIn(cloud, user.uid, user.googleName);
    else onSignedOut();
  });
}

async function startWatching(): Promise<Cloud> {
  const cloud = await loadCloud();
  watchWith(cloud);
  return cloud;
}

/** アプリ起動時に呼ぶ。前回ログインしていた端末だけ Firebase を読み込む */
export function initAuth(): void {
  if (!LOGIN_ENABLED) return;
  // 背面に回ったら送信、前面に戻ったら他の端末の記録を取り込む。通信が戻ったら送信（SPEC §6.4）。
  // どれもログイン中だけ動く
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') requestFlush();
    else void refresh();
  });
  window.addEventListener('online', () => void refresh(true));

  if (!getSettings().signedIn) return;
  setLocalDb('user');
  set({ status: 'loading', displayName: getSettings().displayName });
  void startWatching().catch(() => onSignedOut());
}

async function onSignedIn(cloud: Cloud, uid: string, googleName: string | null): Promise<void> {
  setLocalDb('user');
  // 端末内の写しが別のアカウントのものなら消す
  const st = await getSyncState();
  if (!st || st.uid !== uid) {
    if (st) await clearAllLocal('user');
    await setSyncState({ uid, lastPulledAt: 0 });
  }
  updateSettings({ signedIn: true, guest: false });
  const importCount = getSettings().guestImportDeclined ? 0 : await guestProgressCount();
  set({ status: 'signedIn', uid, displayName: getSettings().displayName, importCount });
  signedInWaiters.forEach((w) => w());
  signedInWaiters = [];
  await sync(cloud, googleName);
}

function onSignedOut(): void {
  setLocalDb('guest');
  if (getSettings().signedIn) updateSettings({ signedIn: false, displayName: '' });
  set({ status: 'off', uid: null, displayName: '', isAdmin: false, importCount: 0, syncError: false });
}

/** users/{uid} を読む → 未送信分を送る → 変更があれば取り込む */
/** いま動いている同期（ログイン直後は、users/{uid} の作成もここで行う） */
let syncing: Promise<void> = Promise.resolve();

function sync(cloud: Cloud, googleName: string | null = null): Promise<void> {
  syncing = doSync(cloud, googleName);
  return syncing;
}

async function doSync(cloud: Cloud, googleName: string | null = null): Promise<void> {
  lastRefreshAt = Date.now();
  if (!navigator.onLine) {
    set({ syncError: true });
    return;
  }
  try {
    const profile = await cloud.loadProfile(googleName);
    updateSettings({ displayName: profile.displayName });
    set({ displayName: profile.displayName, isAdmin: profile.isAdmin });
    const sent = await cloud.flush();
    // 未送信分が残っているときは取り込まない（端末内の記録を古い値で上書きしないため）
    const pulled = sent ? await cloud.pull(profile.lastActiveAt) : false;
    // 要復習マーク・メモ（本人だけのもの）も、送ってから取り込む
    const personalSent = await cloud.flushPersonal();
    if (personalSent) {
      await cloud.pullPersonal();
      bumpPersonal();
    }
    set({ syncError: !sent || !personalSent, dataVersion: state.dataVersion + (pulled ? 1 : 0) });
  } catch {
    set({ syncError: true });
  }
}

async function refresh(force = false): Promise<void> {
  if (state.status !== 'signedIn') return;
  if (!force && Date.now() - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return;
  await sync(await loadCloud());
}

export type LoginResult = 'ok' | 'cancelled' | 'blocked' | 'storage' | 'error';

function loginResultOf(e: unknown): LoginResult {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' || code === 'auth/user-cancelled') {
    return 'cancelled';
  }
  if (code === 'auth/popup-blocked') return 'blocked';
  // ブラウザの設定で、ログインに必要な保存領域が使えない
  if (code === 'auth/web-storage-unsupported' || code === 'auth/operation-not-supported-in-this-environment') return 'storage';
  return 'error';
}

/**
 * Google ログイン。ボタンのタップから直接呼ぶ（SPEC §6.2）。
 * ログイン用の部品を読み込み済みなら、await を挟まずにその場でポップアップを開く（iPhone の Safari は、タップから間が空くとブロックする）。
 * まだ読み込んでいなければ読み込んでから開くので、ブロックされることがある（そのときは案内を出し、もう一度押してもらう）。
 */
export function login(): Promise<LoginResult> {
  if (!LOGIN_ENABLED) return Promise.resolve('error');
  const done = new Promise<void>((resolve) => signedInWaiters.push(resolve));
  const cloud = cloudLoaded;
  let started: Promise<void>;
  if (cloud) {
    watchWith(cloud);
    started = cloud.signIn(); // タップと同じ処理の中で、すぐにポップアップを開く
  } else {
    started = startWatching().then((c) => c.signIn());
  }
  return started.then(
    () => done.then(() => 'ok' as const),
    (e: unknown) => loginResultOf(e),
  );
}

/** 未送信分を送る（失敗しても次の機会にやり直す） */
export function requestFlush(): void {
  if (state.status !== 'signedIn') return;
  answersSinceFlush = 0;
  window.clearTimeout(personalTimer);
  void loadCloud()
    .then(async (c) => (await c.flush()) && (await c.flushPersonal()))
    .then((ok) => set({ syncError: !ok }))
    .catch(() => set({ syncError: true }));
}

/**
 * 要復習マーク・メモを変えたときに呼ぶ。続けて変えることが多いので、少し待ってからまとめて送る
 * （書き込みを少なくするため。未送信分は端末内に残るので、送る前に閉じても失われない）
 */
const PERSONAL_DELAY_MS = 4000;
let personalTimer: number | undefined;
function requestPersonalFlush(): void {
  if (state.status !== 'signedIn') return;
  window.clearTimeout(personalTimer);
  personalTimer = window.setTimeout(() => {
    void loadCloud()
      .then((c) => c.flushPersonal())
      .then((ok) => set({ syncError: !ok }))
      .catch(() => set({ syncError: true }));
  }, PERSONAL_DELAY_MS);
}
onPersonalChange(requestPersonalFlush);

/** 1問解くたびに呼ぶ。10問ごとに送信する */
export function noteAnswered(): void {
  if (state.status !== 'signedIn') return;
  answersSinceFlush += 1;
  if (answersSinceFlush >= FLUSH_EVERY) requestFlush();
}

/** セットが終わったときに呼ぶ。結果を記録して送信する */
export async function noteSetFinished(rec: SessionRec): Promise<void> {
  if (state.status !== 'signedIn') return;
  if (rec.total > 0) await addSessionRecord(rec);
  requestFlush();
}

/** ゲストの記録をアカウントに引き継ぐ（SPEC §6.2） */
export async function importGuestRecords(): Promise<void> {
  if (state.status !== 'signedIn') return;
  await importGuestIntoUser();
  bumpPersonal();
  set({ importCount: 0, dataVersion: state.dataVersion + 1 });
  requestFlush();
}

/** ゲストの記録を引き継がない（ゲストの記録は端末に残す。次からは確認しない） */
export function declineImport(): void {
  updateSettings({ guestImportDeclined: true });
  set({ importCount: 0 });
}

export async function changeDisplayName(name: string): Promise<void> {
  // 初めてログインした直後は、users/{uid} の作成（同期）が終わってから変える（まだ文書がないと、更新は拒否される）
  await syncing.catch(() => undefined);
  const clean = await (await loadCloud()).updateDisplayName(name);
  updateSettings({ displayName: clean });
  set({ displayName: clean });
}

/** まだ送れていない記録の件数（問題数＋日数＋要復習マーク・メモ） */
export async function pendingCount(): Promise<number> {
  if (state.status !== 'signedIn') return 0;
  return outboxSize(await getOutbox()) + personalOutboxSize(await getPersonalOutbox());
}

function leave(): void {
  updateSettings({ signedIn: false, displayName: '' });
  // Firestore を終了させているので、ページごと読み込み直してログイン画面に戻る
  window.location.hash = '/';
  window.location.reload();
}

/**
 * ログアウト。先に未送信分を送り、送れずに残っていて force でなければ、その件数を返して中断する。
 * ログアウトすると端末内のキャッシュを消す（SPEC §8.4）。
 */
export async function logout(force = false): Promise<{ pending: number }> {
  const cloud = await loadCloud();
  if (!force) {
    await cloud.flush().catch(() => false);
    await cloud.flushPersonal().catch(() => false);
    const pending = await pendingCount();
    if (pending > 0) return { pending };
  }
  await cloud.logout();
  leave();
  return { pending: 0 };
}

/** アカウント削除（SPEC §8.4）。再ログインのポップアップが出るので、ボタンのタップから直接呼ぶ */
export async function deleteAccount(): Promise<void> {
  const cloud = await loadCloud();
  await cloud.deleteAccount();
  leave();
}
