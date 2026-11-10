/**
 * Firebase（Authentication・Firestore・App Check）を使う処理をまとめたモジュール。
 * 初回表示を軽くするため、このファイルは auth.ts から動的 import でだけ読み込む（SPEC §9）。
 * ゲストで使っている間は読み込まれず、Firebase への通信も起きない。
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  memoryLocalCache,
  query,
  serverTimestamp,
  setDoc,
  terminate,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig, RECAPTCHA_SITE_KEY } from './config';
import {
  clearAllLocal,
  clearInflight,
  dropOutboxDays,
  emptyProgress,
  getInflight,
  getOutbox,
  getSyncState,
  getUserProgress,
  jstDate,
  outboxSize,
  putPulled,
  setInflight,
  setSyncState,
  settleInflight,
  type DayRec,
  type Outbox,
  type ProgressRec,
} from './db';
import { cleanDisplayName, DEFAULT_DISPLAY_NAME } from './displayName';
import { FIELDS } from './fields';
import { chunkTotals, takeChunk } from './sendplan';
import type { FieldId } from './types';

// config.ts の USE_EMULATOR と同じ。このファイルの中で定数にしておくと、本番ビルドで Emulator 用の分岐が消える
const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === '1';

const DAY_MS = 86_400_000;
const BATCH_SIZE = 400; // writeBatch の上限は500件。余裕を持たせる（アカウント削除で使う）
const PULL_DAYS = 60; // 日別の記録は直近60日分を取り込む

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let fs: Firestore | null = null;

function init(): { auth: Auth; fs: Firestore } {
  if (!app) {
    app = initializeApp(firebaseConfig);
    if (!USE_EMULATOR) {
      // App Check（Fraud Defense＝reCAPTCHA Enterprise のスコアベースのキー）。
      // Firestore は App Check のトークンがない通信を拒否する設定にする（SPEC §8.2）
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    }
    // E2E（Emulator）ではポップアップを使わないので、ポップアップ用の部品（apis.google.com のスクリプト）を読み込まない
    auth = USE_EMULATOR ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
    // 端末内のキャッシュは自前の IndexedDB（db.ts）で持つので、Firestore 側はメモリだけにする（SPEC §14）。
    // E2E で使う Playwright の WebKit はストリーミング通信に失敗するので、Emulator のときだけロングポーリングにする
    fs = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      ...(USE_EMULATOR ? { experimentalForceLongPolling: true } : {}),
    });
    if (USE_EMULATOR) {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(fs, 'localhost', 8080);
    }
  }
  if (!auth || !fs) throw new Error('Firebase を初期化できませんでした');
  return { auth, fs };
}

function googleProvider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

/**
 * E2E テスト（Firebase Emulator）専用。Auth Emulator は、中身を自分で書いた Google の ID トークンを受け付けるので、
 * ポップアップなしでログインできる。USE_EMULATOR はビルド時に決まる定数で、本番ビルドではこの分岐ごと消える。
 */
function e2eCredential() {
  const raw = localStorage.getItem('e2e-user');
  if (!raw) throw new Error('e2e-user がありません');
  return GoogleAuthProvider.credential(raw);
}

/**
 * ログイン画面を開いたときに呼ぶ。Safari / iOS は、タップの直後でないとポップアップを開けないので、
 * ログイン用の部品を先に読み込んでおく（Firebase Auth が自動で行う）。
 */
export function prepare(): void {
  init();
}

export interface CloudUser {
  uid: string;
  googleName: string | null;
}

export function watchAuth(cb: (user: CloudUser | null) => void): () => void {
  return onAuthStateChanged(init().auth, (u) => cb(u ? { uid: u.uid, googleName: u.displayName } : null));
}

/** Google ログイン（ポップアップ）。ボタンのタップから直接呼ぶこと（SPEC §6.2） */
export async function signIn(): Promise<void> {
  const { auth } = init();
  if (USE_EMULATOR) await signInWithCredential(auth, e2eCredential());
  else await signInWithPopup(auth, googleProvider());
}

function requireUid(): string {
  const uid = init().auth.currentUser?.uid;
  if (!uid) throw new Error('ログインしていません');
  return uid;
}

export interface Profile {
  displayName: string;
  /** users/{uid}.lastActiveAt（サーバー時刻の epoch ms） */
  lastActiveAt: number;
  isAdmin: boolean;
}

/**
 * 起動時・ログイン直後に呼ぶ。users/{uid} を1件読み（なければ作り）、管理者かどうかを調べる。
 * 管理者の判定は、管理者だけが読める admin/ping の読み込みを試して行う（SPEC §6.5）。
 * 管理者のメールアドレスはこのアプリのコードには入っていない。
 */
export async function loadProfile(googleName: string | null): Promise<Profile> {
  const { fs } = init();
  const uid = requireUid();
  const ref = doc(fs, 'users', uid);
  const snap = await getDoc(ref);
  let displayName: string;
  let lastActiveAt = 0;
  if (snap.exists()) {
    const d = snap.data();
    displayName = cleanDisplayName(typeof d.displayName === 'string' ? d.displayName : '') || DEFAULT_DISPLAY_NAME;
    lastActiveAt = d.lastActiveAt instanceof Timestamp ? d.lastActiveAt.toMillis() : 0;
  } else {
    // 初回：Google の表示名で作る（メールアドレス・プロフィール画像は保存しない。SPEC §6.3）
    displayName = cleanDisplayName(googleName) || DEFAULT_DISPLAY_NAME;
    try {
      await setDoc(ref, {
        displayName,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        totals: { answered: 0, correct: 0 },
        byField: {},
        examBest: {},
        syncSeq: 0,
        syncAt: null,
      });
    } catch (e) {
      // 別の端末が同時に作った場合は、上書き（createdAt の変更）になるのでルールで拒否される。できていればそれを使う
      if (!(await getDoc(ref)).exists()) throw e;
    }
  }
  let isAdmin = false;
  try {
    await getDoc(doc(fs, 'admin', 'ping'));
    isAdmin = true;
  } catch {
    isAdmin = false; // 読めなければ管理者ではない
  }
  return { displayName, lastActiveAt, isAdmin };
}

// ---- 送信（SPEC §6.4）-------------------------------------------------------

function fieldOfQid(qid: string): FieldId | null {
  const no = Number(qid.split('-')[1]);
  return FIELDS.find((f) => no >= f.from && no <= f.to)?.id ?? null;
}

let flushing: Promise<boolean> | null = null;

/**
 * 未送信分（outbox）を writeBatch で Firestore に送る。全部送れたら true。
 * 回数は increment() で足すので、別の端末で増えた分を上書きしない。
 *
 * 二重加算の防止（SPEC §14）：1回の送信ごとに users/{uid}.syncSeq を「前回＋1」に、syncAt をサーバー時刻にする。ルールは「前回＋1」の
 * 書き込みだけを許可するので、同じ送信を2回送っても2回目は拒否される（届いていたのに応答が来なかった場合など）。
 * 送る分と連番は送る前に端末内（inflight）に保存し、再送では同じものを送る。再送が拒否され、Firestore の syncSeq が
 * その連番以上になっていれば「前回の送信は届いていた」とみなして、outbox から消す。
 * 1回に送る解答数は55まで、問題は10件まで（ルールの上限）。多いときは何回かに分けて送る。
 */
export function flush(): Promise<boolean> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function readSyncSeq(uid: string): Promise<number> {
  const { fs } = init();
  const snap = await getDoc(doc(fs, 'users', uid));
  const v = snap.exists() ? snap.data().syncSeq : 0;
  return typeof v === 'number' ? v : 0;
}

function isPermissionDenied(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'permission-denied';
}

const MAX_SENDS = 50; // 1回の flush で送る回数の上限（55問×50回。無限ループの防止）

async function doFlush(): Promise<boolean> {
  const uid = requireUid();
  if (!navigator.onLine) return false;

  let rebuilt = 0;
  for (let i = 0; i < MAX_SENDS; i++) {
    let inflight = await getInflight();
    if (inflight && inflight.uid !== uid) {
      await clearInflight();
      inflight = undefined;
    }
    if (!inflight) {
      const out = await getOutbox();
      // 日別の記録は、今日と前日（日本時間）の分しか書けない（ルール）。それより古い未送信分は捨てる
      const now = Date.now();
      const writable = new Set([jstDate(now), jstDate(now - DAY_MS)]);
      const stale = Object.keys(out.days).filter((d) => !writable.has(d));
      if (stale.length) {
        await dropOutboxDays(stale);
        for (const d of stale) delete out.days[d];
      }
      if (outboxSize(out) === 0) return true;
      const sent = takeChunk(out);
      if (outboxSize(sent) === 0) return true;
      inflight = { uid, seq: (await readSyncSeq(uid)) + 1, sent, attempted: false };
    }

    const retry = inflight.attempted;
    await setInflight({ ...inflight, attempted: true });
    try {
      await commitChunk(uid, inflight.seq, inflight.sent);
    } catch (e) {
      // 通信の失敗などは、送信中の分をそのまま残して次の機会に同じものを再送する
      if (!isPermissionDenied(e)) throw e;
      const remote = await readSyncSeq(uid);
      if (!(retry && remote >= inflight.seq)) {
        // 初めての送信が拒否された（別の端末が先に同じ連番で送った、日付が変わって書けなくなった、など）。
        // 送っていないので、outbox から作り直して送る。続けて拒否されたらあきらめる
        await clearInflight();
        if (++rebuilt > 1) throw e;
        continue;
      }
      // 再送が拒否され、連番が進んでいる＝前回の送信が届いていた
    }
    await settleInflight();
  }
  return outboxSize(await getOutbox()) === 0;
}

/** 1回分を writeBatch で送る。users/{uid}.syncSeq を seq に、syncAt をサーバー時刻にする */
async function commitChunk(uid: string, seq: number, sent: Outbox): Promise<void> {
  const { fs } = init();
  const qids = Object.keys(sent.progress);
  const local = await getUserProgress(qids);
  const batch = writeBatch(fs);
  const byField = new Map<FieldId, { answered: number; correct: number }>();

  for (const qid of qids) {
    const delta = sent.progress[qid];
    if (!delta) continue;
    const p = local.get(qid) ?? emptyProgress(qid);
    batch.set(
      doc(fs, 'users', uid, 'progress', qid),
      {
        attempts: increment(delta.attempts),
        correctCount: increment(delta.correct),
        history: p.history,
        lastAnsweredAt: serverTimestamp(),
        checked: p.checked,
        nextReviewAt: null,
      },
      { merge: true },
    );
    const f = fieldOfQid(qid);
    if (f && delta.attempts > 0) {
      const cur = byField.get(f) ?? { answered: 0, correct: 0 };
      byField.set(f, { answered: cur.answered + delta.attempts, correct: cur.correct + delta.correct });
    }
  }

  for (const [date, d] of Object.entries(sent.days)) {
    batch.set(
      doc(fs, 'users', uid, 'days', date),
      {
        answered: increment(d.answered),
        correct: increment(d.correct),
        // セットの結果を足す。足すものがないときも sessions という配列を必ず持たせる（ルールで必須のため）
        sessions: d.sessions.length
          ? arrayUnion(
              ...d.sessions.map((s) => ({
                mode: s.mode,
                total: s.total,
                correct: s.correct,
                endedAt: Timestamp.fromMillis(s.endedAt),
              })),
            )
          : arrayRemove(''),
      },
      { merge: true },
    );
  }

  const totals = chunkTotals(sent);
  const upd: Record<string, FieldValue | number> = {
    syncSeq: seq,
    syncAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    'totals.answered': increment(totals.answered),
    'totals.correct': increment(totals.correct),
  };
  for (const [f, v] of byField) {
    upd[`byField.${f}.answered`] = increment(v.answered);
    upd[`byField.${f}.correct`] = increment(v.correct);
  }
  batch.update(doc(fs, 'users', uid), upd);
  await batch.commit();
}

// ---- 取り込み ---------------------------------------------------------------

/**
 * Firestore の記録を端末内の写しに取り込む。変更があったときだけ読む：
 * users/{uid}.lastActiveAt が前回の取り込みより新しければ、それ以降に変わった progress だけを読む。
 * この端末で初めてログインしたときは全件（最大770件）を読む。
 * 取り込んだら true。
 */
export async function pull(remoteLastActiveAt: number): Promise<boolean> {
  const { fs } = init();
  const uid = requireUid();
  const st = await getSyncState();
  const last = st?.uid === uid ? st.lastPulledAt : 0;
  if (last > 0 && remoteLastActiveAt <= last) return false;

  const pcol = collection(fs, 'users', uid, 'progress');
  const psnap = await getDocs(last > 0 ? query(pcol, where('lastAnsweredAt', '>', Timestamp.fromMillis(last))) : pcol);
  let newest = Math.max(last, remoteLastActiveAt);
  const progress: ProgressRec[] = psnap.docs.map((d) => {
    const x = d.data();
    const history = typeof x.history === 'string' ? x.history : '';
    const at = x.lastAnsweredAt instanceof Timestamp ? x.lastAnsweredAt.toMillis() : 0;
    newest = Math.max(newest, at);
    return {
      id: d.id,
      attempts: Number(x.attempts) || 0,
      correctCount: Number(x.correctCount) || 0,
      history,
      lastAnsweredAt: at,
      checked: x.checked === true,
      lastCorrect: history ? history.endsWith('○') : null,
    };
  });

  const since = jstDate(Date.now() - PULL_DAYS * DAY_MS);
  const dsnap = await getDocs(query(collection(fs, 'users', uid, 'days'), where(documentId(), '>=', since)));
  const days: DayRec[] = dsnap.docs.map((d) => {
    const x = d.data();
    return {
      date: d.id,
      answered: Number(x.answered) || 0,
      correct: Number(x.correct) || 0,
      sessionCount: Array.isArray(x.sessions) ? x.sessions.length : 0,
    };
  });

  await putPulled(progress, days);
  await setSyncState({ uid, lastPulledAt: newest });
  return true;
}

// ---- 設定画面の操作 ---------------------------------------------------------

export async function updateDisplayName(name: string): Promise<string> {
  const { fs } = init();
  const clean = cleanDisplayName(name);
  if (!clean) throw new Error('表示名を入力してください');
  await updateDoc(doc(fs, 'users', requireUid()), { displayName: clean, lastActiveAt: serverTimestamp() });
  return clean;
}

/** 端末内のキャッシュを消す（SPEC §8.4：ログアウト時に IndexedDB・Firestore のキャッシュを消去） */
async function clearCaches(): Promise<void> {
  await clearAllLocal('user');
  if (fs) {
    try {
      await terminate(fs);
      await clearIndexedDbPersistence(fs);
    } catch {
      // メモリキャッシュなので消すものがなくても問題ない
    }
  }
}

/** ログアウト。呼んだあとはページを読み込み直すこと（Firestore を終了させているため） */
export async function logout(): Promise<void> {
  await signOut(init().auth);
  await clearCaches();
}

async function deleteAll(refs: DocumentReference[]): Promise<void> {
  const { fs } = init();
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = writeBatch(fs);
    for (const r of refs.slice(i, i + BATCH_SIZE)) batch.delete(r);
    await batch.commit();
  }
}

/**
 * アカウント削除（SPEC §8.4）。直前に再ログインを求め、
 * progress・days・assignments・自分の reports・users/{uid} を消してから、Firebase Auth のユーザーを消す。
 * 呼んだあとはページを読み込み直すこと。
 */
export async function deleteAccount(): Promise<void> {
  const { auth, fs } = init();
  const user = auth.currentUser;
  if (!user) throw new Error('ログインしていません');
  if (USE_EMULATOR) await reauthenticateWithCredential(user, e2eCredential());
  else await reauthenticateWithPopup(user, googleProvider());
  const uid = user.uid;
  for (const sub of ['progress', 'days', 'assignments'] as const) {
    const snap = await getDocs(collection(fs, 'users', uid, sub));
    await deleteAll(snap.docs.map((d) => d.ref));
  }
  const reports = await getDocs(query(collection(fs, 'reports'), where('uid', '==', uid)));
  await deleteAll(reports.docs.map((d) => d.ref));
  await deleteDoc(doc(fs, 'users', uid));
  await deleteUser(user);
  await clearCaches();
}
