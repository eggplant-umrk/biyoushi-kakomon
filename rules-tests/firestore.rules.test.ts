/**
 * セキュリティルールのテスト（SPEC §8.1）。Firestore Emulator に対して実行する。
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type SetOptions,
  type WriteBatch,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { renderRules, TEST_ADMIN_EMAIL as ADMIN_EMAIL } from '../scripts/setup/build-rules.ts';

const ALICE = 'alice';
const BOB = 'bob';

let env: RulesTestEnvironment;

/** 利用者（Googleログイン、管理者ではない） */
function userDb(uid: string): Firestore {
  return env
    .authenticatedContext(uid, {
      email: `${uid}@example.com`,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: {} },
    })
    .firestore() as unknown as Firestore;
}
/** 管理者（メール一致・確認済み・Googleログイン） */
function adminDb(overrides: Record<string, unknown> = {}): Firestore {
  return env
    .authenticatedContext('admin-uid', {
      email: ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com', identities: {} },
      ...overrides,
    })
    .firestore() as unknown as Firestore;
}
function anonDb(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}
/** ルールを通さずにデータを用意する */
async function seed(fn: (db: Firestore) => Promise<void>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}

function jstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}
const DAY = 86_400_000;
const past = Timestamp.fromMillis(Date.now() - 10 * DAY);

// ---- 正しいデータのひな形 ----------------------------------------------------
const user = (o: Record<string, unknown> = {}) => ({
  displayName: 'アリス',
  createdAt: serverTimestamp(),
  lastActiveAt: serverTimestamp(),
  totals: { answered: 0, correct: 0 },
  byField: {},
  examBest: {},
  syncSeq: 0,
  syncAt: null,
  ...o,
});
const progress = (o: Record<string, unknown> = {}) => ({
  attempts: 3,
  correctCount: 2,
  history: '○×○',
  lastAnsweredAt: serverTimestamp(),
  checked: false,
  nextReviewAt: null,
  ...o,
});
const session = (o: Record<string, unknown> = {}) => ({
  mode: 'practice',
  total: 10,
  correct: 7,
  endedAt: Timestamp.now(),
  ...o,
});
const day = (o: Record<string, unknown> = {}) => ({ answered: 10, correct: 7, sessions: [session()], ...o });
const assignment = (o: Record<string, unknown> = {}) => ({
  title: '皮膚科学の復習',
  questionIds: ['54-31', '54-32'],
  createdAt: serverTimestamp(),
  doneAt: null,
  ...o,
});
const report = (uid: string, o: Record<string, unknown> = {}) => ({
  questionId: '54-01',
  kind: 'unclear',
  comment: '',
  uid,
  createdAt: serverTimestamp(),
  ...o,
});

// ---- 記録の送信（アプリと同じく、users/{uid}.syncSeq を＋1 する writeBatch で書く）------------
/** ops の書き込みと、users/{ALICE} の syncSeq＋1 を同じ writeBatch で送る */
function sendBatch(db: Firestore, ops: (b: WriteBatch) => void, userUpdate: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  ops(b);
  b.update(doc(db, 'users', ALICE), { syncSeq: increment(1), syncAt: serverTimestamp(), lastActiveAt: serverTimestamp(), ...userUpdate });
  return b.commit();
}
const sendSet = (ref: DocumentReference, data: DocumentData, opts?: SetOptions) =>
  sendBatch(ref.firestore, (b) => (opts ? b.set(ref, data, opts) : b.set(ref, data)));
const sendUpdate = (ref: DocumentReference, data: DocumentData) =>
  sendBatch(ref.firestore, (b) => b.update(ref, data));
/** 送信の前提になる users/{ALICE} を用意する */
const seedAlice = (o: Record<string, unknown> = {}) =>
  seed(async (db) => {
    await setDoc(doc(db, 'users', ALICE), { ...user(), createdAt: past, lastActiveAt: past, ...o });
  });

beforeAll(async () => {
  const rules = renderRules(readFileSync('firestore.rules.template', 'utf8'), ADMIN_EMAIL);
  env = await initializeTestEnvironment({ projectId: 'demo-kakomon', firestore: { rules } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe('未ログイン', () => {
  test('何も読めない', async () => {
    const db = anonDb();
    await assertFails(getDoc(doc(db, 'users', ALICE)));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'progress', '54-01')));
    await assertFails(getDocs(collection(db, 'users', ALICE, 'progress')));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now()))));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'assignments', 'a1')));
    await assertFails(getDocs(collection(db, 'reports')));
    await assertFails(getDoc(doc(db, 'admin', 'ping')));
    await assertFails(getDocs(collection(db, 'users')));
  });
  test('何も書けない', async () => {
    const db = anonDb();
    await assertFails(setDoc(doc(db, 'users', ALICE), user()));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'progress', '54-01'), progress()));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now())), day()));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'assignments', 'a1'), assignment()));
    await assertFails(setDoc(doc(db, 'reports', `${ALICE}_54-01`), report(ALICE)));
    await assertFails(setDoc(doc(db, 'admin', 'ping'), {}));
  });
});

describe('他人の記録', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users', ALICE), { ...user(), createdAt: past, lastActiveAt: past });
      await setDoc(doc(db, 'users', ALICE, 'progress', '54-01'), { ...progress(), lastAnsweredAt: past });
      await setDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now())), day());
      await setDoc(doc(db, 'users', ALICE, 'assignments', 'a1'), { ...assignment(), createdAt: past });
    });
  });
  test('users / progress / days / assignments を読めない', async () => {
    const db = userDb(BOB);
    await assertFails(getDoc(doc(db, 'users', ALICE)));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'progress', '54-01')));
    await assertFails(getDocs(collection(db, 'users', ALICE, 'progress')));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now()))));
    await assertFails(getDocs(collection(db, 'users', ALICE, 'days')));
    await assertFails(getDoc(doc(db, 'users', ALICE, 'assignments', 'a1')));
    await assertFails(getDocs(collection(db, 'users')));
  });
  test('users / progress / days / assignments を書けない・消せない', async () => {
    const db = userDb(BOB);
    await assertFails(setDoc(doc(db, 'users', ALICE), user()));
    await assertFails(updateDoc(doc(db, 'users', ALICE), { displayName: 'x', lastActiveAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'users', ALICE)));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'progress', '54-01'), progress()));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'progress', '54-02'), progress()));
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'progress', '54-01')));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now())), day()));
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now()))));
    await assertFails(updateDoc(doc(db, 'users', ALICE, 'assignments', 'a1'), { doneAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'assignments', 'a1')));
  });
  test('本人は自分の記録を読める', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'progress')));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'days')));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'assignments')));
  });
  test('管理者は読めるが、書けない・消せない（おすすめ復習を除く）', async () => {
    const db = adminDb();
    await assertSucceeds(getDoc(doc(db, 'users', ALICE)));
    await assertSucceeds(getDocs(collection(db, 'users')));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'progress')));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'days')));
    await assertSucceeds(getDocs(collection(db, 'users', ALICE, 'assignments')));
    await assertFails(setDoc(doc(db, 'users', ALICE), user()));
    await assertFails(deleteDoc(doc(db, 'users', ALICE)));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'progress', '54-01'), progress()));
    await assertFails(deleteDoc(doc(db, 'users', ALICE, 'progress', '54-01')));
    await assertFails(setDoc(doc(db, 'users', ALICE, 'days', jstDate(Date.now())), day()));
    await assertFails(updateDoc(doc(db, 'users', ALICE, 'assignments', 'a1'), { doneAt: serverTimestamp() }));
  });

  // 管理画面（SPEC §7）が実際に使う読み方：利用者の一覧、直近14日の日別の記録、問題ごとの記録
  const since = () => jstDate(Date.now() - 13 * DAY);
  const adminScreenReads = (db: Firestore) => [
    () => getDocs(collection(db, 'users')),
    () => getDocs(query(collection(db, 'users', ALICE, 'days'), where(documentId(), '>=', since()))),
    () => getDocs(collection(db, 'users', ALICE, 'progress')),
  ];
  test('管理画面の読み方：管理者は読める', async () => {
    const [users, days, prog] = adminScreenReads(adminDb());
    expect((await assertSucceeds(users!())).size).toBe(1);
    expect((await assertSucceeds(days!())).size).toBe(1);
    expect((await assertSucceeds(prog!())).size).toBe(1);
  });
  test.each<[string, () => Firestore]>([
    ['未ログイン', () => anonDb()],
    ['ほかの利用者', () => userDb(BOB)],
    ['管理者と同じメールだが未確認', () => adminDb({ email_verified: false })],
    ['管理者と同じメールだが Google ログインではない', () => adminDb({ firebase: { sign_in_provider: 'password', identities: {} } })],
    ['メールが違う', () => adminDb({ email: 'admin@example.org' })],
  ])('管理画面の読み方：%s は読めない', async (_name, makeDb) => {
    for (const read of adminScreenReads(makeDb())) await assertFails(read());
  });
  test('本人でも、利用者の一覧（他人を含む）は読めない', async () => {
    await assertFails(getDocs(collection(userDb(ALICE), 'users')));
  });
});

describe('users/{uid}', () => {
  const ref = (db: Firestore) => doc(db, 'users', ALICE);

  test('本人は正しいデータで作成・更新・削除できる', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(setDoc(ref(db), user()));
    await assertSucceeds(
      updateDoc(ref(db), {
        syncSeq: increment(1),
        syncAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        'totals.answered': increment(10),
        'totals.correct': increment(7),
        'byField.law.answered': increment(10),
        'byField.law.correct': increment(7),
        'examBest.54': 40,
      }),
    );
    await assertSucceeds(updateDoc(ref(db), { displayName: 'あ'.repeat(30), lastActiveAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  test.each<[string, Record<string, unknown>]>([
    ['許可していないキー', { email: 'a@example.com' }],
    ['許可していないキー（管理者フラグ）', { isAdmin: true }],
    ['displayName が空', { displayName: '' }],
    ['displayName が31文字', { displayName: 'あ'.repeat(31) }],
    ['displayName が文字列でない', { displayName: 123 }],
    ['displayName に制御文字', { displayName: 'a\u0000b' }],
    ['displayName に改行', { displayName: 'a\nb' }],
    ['createdAt が現在時刻でない', { createdAt: past }],
    ['createdAt が文字列', { createdAt: '2026-01-01' }],
    ['lastActiveAt が現在時刻でない', { lastActiveAt: past }],
    ['totals が correct > answered', { totals: { answered: 1, correct: 2 } }],
    ['totals が負の数', { totals: { answered: -1, correct: -1 } }],
    ['totals が上限超え', { totals: { answered: 1000001, correct: 0 } }],
    ['totals が小数', { totals: { answered: 1.5, correct: 0 } }],
    ['totals が文字列', { totals: { answered: '1', correct: 0 } }],
    ['totals に余分なキー', { totals: { answered: 1, correct: 0, x: 1 } }],
    ['totals のキー不足', { totals: { answered: 1 } }],
    ['totals が map でない', { totals: 5 }],
    ['byField に知らない分野', { byField: { math: { answered: 1, correct: 0 } } }],
    ['byField の中身が不正', { byField: { law: { answered: 1, correct: 2 } } }],
    ['byField の中身が数値', { byField: { law: 3 } }],
    ['byField が配列', { byField: [] }],
    ['examBest に収録外の回', { examBest: { '40': 10 } }],
    ['examBest が56点', { examBest: { '54': 56 } }],
    ['examBest が負の数', { examBest: { '54': -1 } }],
    ['examBest が文字列', { examBest: { '54': '40' } }],
    ['syncSeq が 0 でない', { syncSeq: 1 }],
    ['syncSeq が負の数', { syncSeq: -1 }],
    ['syncSeq が文字列', { syncSeq: '0' }],
    ['作成時の totals が 0 でない', { totals: { answered: 10, correct: 5 } }],
    ['作成時の byField が空でない', { byField: { law: { answered: 1, correct: 0 } } }],
    ['作成時の examBest が空でない', { examBest: { '54': 40 } }],
    ['作成時の syncAt が null でない', { syncAt: serverTimestamp() }],
    ['syncAt が文字列', { syncAt: 'now' }],
  ])('作成を拒否：%s', async (_name, override) => {
    await assertFails(setDoc(ref(userDb(ALICE)), user(override)));
  });

  test('キーが足りない作成を拒否', async () => {
    const { examBest: _e, ...rest } = user();
    await assertFails(setDoc(ref(userDb(ALICE)), rest));
    const { syncSeq: _s, ...noSeq } = user();
    await assertFails(setDoc(ref(userDb(ALICE)), noSeq));
  });

  test('更新では createdAt を変えられない・不正な値にできない', async () => {
    await seed(async (db) => {
      await setDoc(ref(db), { ...user(), createdAt: past, lastActiveAt: past });
    });
    const db = userDb(ALICE);
    await assertFails(updateDoc(ref(db), { createdAt: serverTimestamp(), lastActiveAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(db), { displayName: 'ok' })); // lastActiveAt が古いまま
    await assertFails(updateDoc(ref(db), { lastActiveAt: serverTimestamp(), 'totals.correct': increment(1) }));
    await assertFails(updateDoc(ref(db), { lastActiveAt: serverTimestamp(), role: 'admin' }));
    await assertFails(updateDoc(ref(db), { lastActiveAt: serverTimestamp(), 'byField.math.answered': increment(1) }));
    await assertSucceeds(updateDoc(ref(db), { lastActiveAt: serverTimestamp(), displayName: '新しい名前' }));
  });
});

describe('users/{uid}/progress/{qid}', () => {
  const ref = (db: Firestore, qid = '54-01') => doc(db, 'users', ALICE, 'progress', qid);
  beforeEach(() => seedAlice());

  test('本人は正しいデータで作成・更新・削除できる', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(sendSet(ref(db), progress()));
    await assertSucceeds(sendSet(ref(db, '41-55'), progress({ attempts: 0, correctCount: 0, history: '', checked: true })));
    await assertSucceeds(sendSet(ref(db, '49-10'), progress({ nextReviewAt: Timestamp.fromMillis(Date.now() + DAY) })));
    await assertSucceeds(
      sendSet(
        ref(db),
        { attempts: increment(1), correctCount: increment(1), history: '○×○○', lastAnsweredAt: serverTimestamp(), checked: true, nextReviewAt: null },
        { merge: true },
      ),
    );
    expect((await getDoc(ref(db))).data()?.attempts).toBe(4);
    await assertSucceeds(deleteDoc(ref(db)));
  });

  test.each(['40-01', '55-01', '54-56', '54-00', '54-1', '54-001', 'abc', '54_01', '５４-01'])(
    '不正な問題IDを拒否：%s',
    async (qid) => {
      await assertFails(sendSet(ref(userDb(ALICE), qid), progress()));
    },
  );

  test.each<[string, Record<string, unknown>]>([
    ['許可していないキー', { memo: 'x' }],
    ['attempts が文字列', { attempts: '3' }],
    ['attempts が負の数', { attempts: -1, correctCount: -1, history: '' }],
    ['attempts が上限超え', { attempts: 100001 }],
    ['correctCount > attempts', { attempts: 1, correctCount: 2, history: '○' }],
    ['history に不正な文字', { history: '○x○' }],
    ['history が11文字', { attempts: 20, history: '○'.repeat(11) }],
    ['history が attempts より長い', { attempts: 1, correctCount: 1, history: '○○' }],
    ['history が文字列でない', { history: ['○'] }],
    ['lastAnsweredAt が現在時刻でない', { lastAnsweredAt: past }],
    ['lastAnsweredAt が未来', { lastAnsweredAt: Timestamp.fromMillis(Date.now() + DAY) }],
    ['checked が bool でない', { checked: 'true' }],
    ['nextReviewAt が文字列', { nextReviewAt: '2026-12-01' }],
  ])('作成を拒否：%s', async (_name, override) => {
    await assertFails(sendSet(ref(userDb(ALICE)), progress(override)));
  });

  test('キーが足りない作成を拒否', async () => {
    const { nextReviewAt: _n, ...rest } = progress();
    await assertFails(sendSet(ref(userDb(ALICE)), rest));
  });

  test('更新でも検査される', async () => {
    await seed(async (db) => {
      await setDoc(ref(db), { ...progress(), lastAnsweredAt: past });
    });
    const db = userDb(ALICE);
    await assertFails(sendUpdate(ref(db), { checked: true })); // lastAnsweredAt が古いまま
    await assertFails(sendUpdate(ref(db), { correctCount: increment(5), lastAnsweredAt: serverTimestamp() }));
    await assertFails(sendUpdate(ref(db), { extra: 1, lastAnsweredAt: serverTimestamp() }));
    await assertSucceeds(sendUpdate(ref(db), { checked: true, lastAnsweredAt: serverTimestamp() }));
  });
});

describe('users/{uid}/days/{day}', () => {
  const ref = (db: Firestore, d: string) => doc(db, 'users', ALICE, 'days', d);
  const today = () => jstDate(Date.now());
  beforeEach(() => seedAlice());

  test('今日と前日（日本時間）には書ける', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(sendSet(ref(db, today()), day()));
    await assertSucceeds(sendSet(ref(db, jstDate(Date.now() - DAY)), day({ sessions: [] })));
    await assertSucceeds(
      sendSet(ref(db, today()), { answered: increment(5), correct: increment(5), sessions: [session(), session({ mode: 'exam', total: 55, correct: 40 })] }, { merge: true }),
    );
    await assertSucceeds(deleteDoc(ref(db, today())));
  });

  test('今日・前日以外の日付には書けない', async () => {
    const db = userDb(ALICE);
    await assertFails(sendSet(ref(db, jstDate(Date.now() - 2 * DAY)), day()));
    await assertFails(sendSet(ref(db, jstDate(Date.now() - 30 * DAY)), day()));
    await assertFails(sendSet(ref(db, jstDate(Date.now() + DAY)), day()));
    await assertFails(sendSet(ref(db, jstDate(Date.now() + 365 * DAY)), day()));
    await assertFails(sendSet(ref(db, '2020-01-01'), day()));
    await assertFails(sendSet(ref(db, 'today'), day()));
    await assertFails(sendSet(ref(db, today().replaceAll('-', '')), day()));
  });

  test('過去の日付のドキュメントは更新もできない', async () => {
    const old = jstDate(Date.now() - 5 * DAY);
    await seed(async (db) => {
      await setDoc(ref(db, old), day());
    });
    await assertFails(sendUpdate(ref(userDb(ALICE), old), { answered: increment(1) }));
  });

  test.each<[string, Record<string, unknown>]>([
    ['許可していないキー', { memo: 'x' }],
    ['correct > answered', { answered: 1, correct: 2 }],
    ['answered が上限超え', { answered: 100001 }],
    ['answered が文字列', { answered: '10' }],
    ['sessions が51件', { sessions: Array.from({ length: 51 }, () => session()) }],
    ['sessions が配列でない', { sessions: 'x' }],
    ['末尾の session の mode が不正', { sessions: [session({ mode: 'hack' })] }],
    ['末尾の session に余分なキー', { sessions: [session({ payload: 'x'.repeat(1000) })] }],
    ['末尾の session が correct > total', { sessions: [session({ total: 5, correct: 6 })] }],
    ['末尾の session の total が 0', { sessions: [session({ total: 0, correct: 0 })] }],
    ['末尾の session の endedAt が文字列', { sessions: [session({ endedAt: 'now' })] }],
    ['末尾の session が map でない', { sessions: ['x'] }],
  ])('作成を拒否：%s', async (_name, override) => {
    await assertFails(sendSet(ref(userDb(ALICE), today()), day(override)));
  });

  test('sessions は50件まで書ける', async () => {
    await assertSucceeds(
      sendSet(ref(userDb(ALICE), today()), day({ sessions: Array.from({ length: 50 }, () => session()) })),
    );
  });
});

describe('記録の送信：二重加算の防止（syncSeq）と1回の上限', () => {
  const userRef = (db: Firestore) => doc(db, 'users', ALICE);
  const pRef = (db: Firestore, qid = '54-01') => doc(db, 'users', ALICE, 'progress', qid);
  const dRef = (db: Firestore) => doc(db, 'users', ALICE, 'days', jstDate(Date.now()));
  /** アプリと同じ形の送信：syncSeq を seq（絶対値）にし、progress・days・totals を increment で足す */
  const sendLikeApp = (db: Firestore, seq: number, answered = 3, correct = 2) => {
    const b = writeBatch(db);
    const history = '○'.repeat(Math.min(Math.max(answered, 0), 3));
    b.set(pRef(db), { attempts: increment(answered), correctCount: increment(correct), history, lastAnsweredAt: serverTimestamp(), checked: false, nextReviewAt: null }, { merge: true });
    b.set(dRef(db), { answered: increment(answered), correct: increment(correct), sessions: [] }, { merge: true });
    b.update(userRef(db), {
      syncSeq: seq,
      syncAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      'totals.answered': increment(answered),
      'totals.correct': increment(correct),
      'byField.theory.answered': increment(answered),
      'byField.theory.correct': increment(correct),
    });
    return b.commit();
  };
  beforeEach(() => seedAlice({ syncSeq: 7, totals: { answered: 100, correct: 50 }, byField: { theory: { answered: 100, correct: 50 } } }));

  test('連番が「前回＋1」の送信は通り、同じ送信の再送は拒否される（二重に足されない）', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(sendLikeApp(db, 8));
    await assertFails(sendLikeApp(db, 8));
    const u = (await getDoc(userRef(db))).data();
    expect(u?.syncSeq).toBe(8);
    expect(u?.totals).toEqual({ answered: 103, correct: 52 });
    expect((await getDoc(pRef(db))).data()?.attempts).toBe(3);
    expect((await getDoc(dRef(db))).data()?.answered).toBe(3);
    // 次の送信は 9 で通る
    await assertSucceeds(sendLikeApp(db, 9));
  });

  test('連番を飛ばす・戻す・据え置く送信は拒否される', async () => {
    const db = userDb(ALICE);
    await assertFails(sendLikeApp(db, 9));
    await assertFails(sendLikeApp(db, 7));
    await assertFails(sendLikeApp(db, 6));
    await assertFails(sendLikeApp(db, 0));
  });

  test('progress・days は、syncSeq を進めない書き込みでは書けない', async () => {
    const db = userDb(ALICE);
    await assertFails(setDoc(pRef(db), progress()));
    await assertFails(setDoc(dRef(db), day()));
    // users を一緒に更新しても（表示名の変更など）、記録の送信でなければ拒否
    const b = writeBatch(db);
    b.set(pRef(db), progress());
    b.update(userRef(db), { lastActiveAt: serverTimestamp(), displayName: '別の名前' });
    await assertFails(b.commit());
    const b2 = writeBatch(db);
    b2.set(dRef(db), day());
    b2.update(userRef(db), { lastActiveAt: serverTimestamp() });
    await assertFails(b2.commit());
  });

  test('記録（totals・byField）は、syncSeq を進めない更新では変えられない', async () => {
    const db = userDb(ALICE);
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), 'totals.answered': increment(1) }));
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), 'byField.law.answered': increment(1) }));
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), 'examBest.54': 40 }));
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), syncSeq: 100 }));
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), syncAt: serverTimestamp() }));
    // syncSeq を進めても、syncAt を現在時刻にしなければ拒否
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), syncSeq: increment(1) }));
    await assertFails(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), syncSeq: increment(1), syncAt: past }));
    // 表示名の変更は syncSeq を変えずにできる
    await assertSucceeds(updateDoc(userRef(db), { lastActiveAt: serverTimestamp(), displayName: '新しい名前' }));
  });

  test('1回の送信で増やせる解答数は55まで', async () => {
    const db = userDb(ALICE);
    await assertFails(sendLikeApp(db, 8, 56, 0));
    await assertSucceeds(sendLikeApp(db, 8, 55, 55));
  });

  test('正解数の増加は解答数の増加以下', async () => {
    const db = userDb(ALICE);
    // 累計では correct ≤ answered のままでも、1回の増加で correct > answered なら拒否
    await assertFails(sendLikeApp(db, 8, 1, 2));
    await assertSucceeds(sendLikeApp(db, 8, 2, 2));
  });

  test('users の totals の増加の上限と、減らす更新の拒否', async () => {
    const db = userDb(ALICE);
    const upd = (o: Record<string, unknown>) =>
      updateDoc(userRef(db), { syncSeq: increment(1), syncAt: serverTimestamp(), lastActiveAt: serverTimestamp(), ...o });
    await assertFails(upd({ 'totals.answered': increment(56) }));
    await assertFails(upd({ 'totals.answered': increment(1), 'totals.correct': increment(2) }));
    await assertFails(upd({ 'totals.answered': increment(-1) }));
    await assertFails(upd({ 'totals.correct': increment(-1) }));
    // byField も型・範囲は検査される
    await assertFails(upd({ 'byField.math': { answered: 1, correct: 0 } }));
    await assertFails(upd({ 'byField.law': { answered: 1, correct: 2 } }));
    await assertSucceeds(upd({ 'totals.answered': increment(55), 'byField.law': { answered: 55, correct: 0 } }));
  });

  test('progress・days の1回の増加の上限', async () => {
    const db = userDb(ALICE);
    const one = (ref: DocumentReference, data: DocumentData) => sendSet(ref, data, { merge: true });
    await assertFails(one(pRef(db), progress({ attempts: 56, correctCount: 0, history: '' })));
    await assertFails(one(dRef(db), day({ answered: 56, correct: 0, sessions: [] })));
    await assertSucceeds(one(pRef(db), progress({ attempts: 10, correctCount: 0, history: '' })));
    await assertSucceeds(one(dRef(db), day({ answered: 10, correct: 0, sessions: [] })));
    // 正解数だけ増やす・解答数を超えて増やす・減らす
    await assertFails(one(pRef(db), { correctCount: increment(1), lastAnsweredAt: serverTimestamp() }));
    await assertFails(one(pRef(db), { attempts: increment(1), correctCount: increment(2), lastAnsweredAt: serverTimestamp() }));
    await assertFails(one(pRef(db), { attempts: increment(-1), lastAnsweredAt: serverTimestamp() }));
    await assertFails(one(dRef(db), { answered: increment(1), correct: increment(2) }));
    await assertFails(one(dRef(db), { answered: increment(-1) }));
    await assertFails(one(pRef(db), { attempts: increment(56), lastAnsweredAt: serverTimestamp() }));
    await assertFails(one(dRef(db), { answered: increment(56) }));
    await assertSucceeds(one(pRef(db), { attempts: increment(55), correctCount: increment(55), lastAnsweredAt: serverTimestamp() }));
  });

  test('アプリが送る最大の大きさ（問題10件＋今日・前日の日別＋users）が通る', async () => {
    // users の byField（8分野）・examBest（14回）がすべて埋まっている、いちばん検査の多い状態
    const fields = ['law', 'public_health', 'infection', 'hygiene', 'anatomy', 'skin', 'cosmetics', 'theory'];
    const byField = Object.fromEntries(fields.map((f) => [f, { answered: 100, correct: 50 }]));
    const examBest = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(41 + i), 30]));
    await seedAlice({ syncSeq: 7, totals: { answered: 800, correct: 400 }, byField, examBest });
    const db = userDb(ALICE);
    const b = writeBatch(db);
    for (let i = 1; i <= 10; i++) {
      const qid = `54-${String(i).padStart(2, '0')}`;
      b.set(pRef(db, qid), { attempts: increment(5), correctCount: increment(5), history: '○○○○○', lastAnsweredAt: serverTimestamp(), checked: true, nextReviewAt: null }, { merge: true });
    }
    b.set(dRef(db), { answered: increment(50), correct: increment(50), sessions: [session({ total: 50, correct: 50 })] }, { merge: true });
    b.set(doc(db, 'users', ALICE, 'days', jstDate(Date.now() - DAY)), { answered: increment(5), correct: increment(5), sessions: [] }, { merge: true });
    const upd: Record<string, unknown> = {
      syncSeq: 8,
      syncAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      'totals.answered': increment(50),
      'totals.correct': increment(50),
    };
    for (const f of fields) {
      upd[`byField.${f}.answered`] = increment(5);
      upd[`byField.${f}.correct`] = increment(5);
    }
    b.update(userRef(db), upd);
    await assertSucceeds(b.commit());
  });
});

describe('users/{uid}/assignments/{aid}（おすすめ復習）', () => {
  const ref = (db: Firestore, aid = 'a1') => doc(db, 'users', ALICE, 'assignments', aid);
  const seedOne = () =>
    seed(async (db) => {
      await setDoc(ref(db), { ...assignment(), createdAt: past });
    });

  test('管理者以外は作れない（本人でも）', async () => {
    await assertFails(setDoc(ref(userDb(ALICE)), assignment()));
    await assertFails(setDoc(ref(userDb(BOB)), assignment()));
  });

  test('管理者は作成・削除できる', async () => {
    const db = adminDb();
    await assertSucceeds(setDoc(ref(db), assignment()));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  test.each<[string, Record<string, unknown>]>([
    ['問題IDが56件', { questionIds: Array.from({ length: 56 }, () => '54-01') }],
    ['問題IDが0件', { questionIds: [] }],
    ['先頭の問題IDが不正', { questionIds: ['99-99'] }],
    ['doneAt が null でない', { doneAt: Timestamp.now() }],
    ['createdAt が現在時刻でない', { createdAt: past }],
    ['title が空', { title: '' }],
    ['title が51文字', { title: 'あ'.repeat(51) }],
    ['許可していないキー', { from: '先輩' }],
  ])('管理者でも不正なデータでは作れない：%s', async (_name, override) => {
    await assertFails(setDoc(ref(adminDb()), assignment(override)));
  });

  test('管理者に見せかけた人は作れない', async () => {
    // メール未確認
    await assertFails(setDoc(ref(adminDb({ email_verified: false })), assignment()));
    // Googleログインではない（同じメールのパスワードログインなど）
    await assertFails(
      setDoc(ref(adminDb({ firebase: { sign_in_provider: 'password', identities: {} } })), assignment()),
    );
    // メールが違う
    await assertFails(setDoc(ref(adminDb({ email: 'admin@example.org' })), assignment()));
    // メールがない
    await assertFails(setDoc(ref(adminDb({ email: undefined })), assignment()));
  });

  test('利用者は doneAt だけを、現在時刻にだけ更新できる', async () => {
    await seedOne();
    const db = userDb(ALICE);
    await assertFails(updateDoc(ref(db), { title: '書き換え' }));
    await assertFails(updateDoc(ref(db), { questionIds: ['54-01'] }));
    await assertFails(updateDoc(ref(db), { doneAt: serverTimestamp(), title: '書き換え' }));
    await assertFails(updateDoc(ref(db), { doneAt: past }));
    await assertFails(updateDoc(ref(db), { doneAt: 'done' }));
    await assertFails(updateDoc(ref(db), { doneAt: serverTimestamp(), extra: 1 }));
    await assertSucceeds(updateDoc(ref(db), { doneAt: serverTimestamp() }));
  });

  test('本人は（アカウント削除のために）削除できる。他人は削除できない', async () => {
    await seedOne();
    await assertFails(deleteDoc(ref(userDb(BOB))));
    await assertSucceeds(deleteDoc(ref(userDb(ALICE))));
  });
});

describe('reports/{uid}_{questionId}（解説への報告）', () => {
  const ref = (db: Firestore, id = `${ALICE}_54-01`) => doc(db, 'reports', id);

  test('本人の uid・正しいIDで作成できる', async () => {
    const db = userDb(ALICE);
    await assertSucceeds(setDoc(ref(db), report(ALICE)));
    await assertSucceeds(
      setDoc(ref(db, `${ALICE}_41-55`), report(ALICE, { questionId: '41-55', kind: 'wrong', comment: 'あ'.repeat(300) })),
    );
  });

  test.each<[string, string, Record<string, unknown>]>([
    ['IDが {uid}_{問題ID} でない（自動ID）', 'randomid', {}],
    ['IDの問題番号が中身と違う', `${ALICE}_54-02`, {}],
    ['IDの uid が他人', `${BOB}_54-01`, {}],
    ['中身の uid が他人', `${ALICE}_54-01`, { uid: BOB }],
    ['他人の uid でそろえる', `${BOB}_54-01`, { uid: BOB }],
    ['不正な問題ID', `${ALICE}_99-99`, { questionId: '99-99' }],
    ['kind が不正', `${ALICE}_54-01`, { kind: 'spam' }],
    ['comment が301文字', `${ALICE}_54-01`, { comment: 'あ'.repeat(301) }],
    ['comment が文字列でない', `${ALICE}_54-01`, { comment: 1 }],
    ['createdAt が現在時刻でない', `${ALICE}_54-01`, { createdAt: past }],
    ['許可していないキー', `${ALICE}_54-01`, { url: 'https://example.com' }],
  ])('作成を拒否：%s', async (_name, id, override) => {
    await assertFails(setDoc(ref(userDb(ALICE), id), report(ALICE, override)));
  });

  test('キーが足りない作成を拒否', async () => {
    const { comment: _c, ...rest } = report(ALICE);
    await assertFails(setDoc(ref(userDb(ALICE)), rest));
  });

  describe('作成済みの報告', () => {
    beforeEach(async () => {
      await seed(async (db) => {
        await setDoc(ref(db), { ...report(ALICE), createdAt: past });
      });
    });

    test('更新はだれもできない（同じIDへの再投稿も）', async () => {
      await assertFails(updateDoc(ref(userDb(ALICE)), { comment: '変更' }));
      await assertFails(setDoc(ref(userDb(ALICE)), report(ALICE, { comment: '再投稿' })));
      await assertFails(updateDoc(ref(adminDb()), { comment: '変更' }));
    });

    test('管理者以外は他人の報告を読めない', async () => {
      await assertFails(getDoc(ref(userDb(BOB))));
      await assertFails(getDocs(collection(userDb(BOB), 'reports')));
      await assertFails(getDocs(query(collection(userDb(BOB), 'reports'), where('uid', '==', ALICE))));
      // 本人でも、全件の一覧は取れない
      await assertFails(getDocs(collection(userDb(ALICE), 'reports')));
    });

    test('本人は自分の報告だけ読める（アカウント削除用）', async () => {
      const db = userDb(ALICE);
      await assertSucceeds(getDoc(ref(db)));
      const snap = await assertSucceeds(getDocs(query(collection(db, 'reports'), where('uid', '==', ALICE))));
      expect(snap.size).toBe(1);
    });

    test('管理者は読める・削除できる', async () => {
      const db = adminDb();
      const snap = await assertSucceeds(getDocs(collection(db, 'reports')));
      expect(snap.size).toBe(1);
      await assertSucceeds(deleteDoc(ref(db)));
    });

    test('本人は削除できる。他人は削除できない', async () => {
      await assertFails(deleteDoc(ref(userDb(BOB))));
      await assertSucceeds(deleteDoc(ref(userDb(ALICE))));
    });
  });
});

describe('admin/ping（管理者判定）', () => {
  test('管理者だけが読める', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'admin', 'ping')));
    await assertFails(getDoc(doc(userDb(ALICE), 'admin', 'ping')));
    await assertFails(getDoc(doc(anonDb(), 'admin', 'ping')));
  });
  test('管理者に見せかけた人は読めない', async () => {
    await assertFails(getDoc(doc(adminDb({ email_verified: false }), 'admin', 'ping')));
    await assertFails(
      getDoc(doc(adminDb({ firebase: { sign_in_provider: 'password', identities: {} } }), 'admin', 'ping')),
    );
    await assertFails(getDoc(doc(adminDb({ email: 'ADMIN@example.com.evil.example' }), 'admin', 'ping')));
  });
  test('だれも書けない', async () => {
    await assertFails(setDoc(doc(adminDb(), 'admin', 'ping'), {}));
    await assertFails(setDoc(doc(userDb(ALICE), 'admin', 'ping'), {}));
    await assertFails(setDoc(doc(adminDb(), 'admin', 'other'), {}));
    await assertFails(getDoc(doc(adminDb(), 'admin', 'other')));
  });
});

describe('ルールに書いていないパス', () => {
  test('ログインしていても、管理者でも拒否される', async () => {
    await assertFails(getDoc(doc(userDb(ALICE), 'secrets', 'x')));
    await assertFails(setDoc(doc(userDb(ALICE), 'secrets', 'x'), { a: 1 }));
    await assertFails(setDoc(doc(userDb(ALICE), 'users', ALICE, 'notes', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(adminDb(), 'secrets', 'x')));
    await assertFails(setDoc(doc(adminDb(), 'secrets', 'x'), { a: 1 }));
  });
});
