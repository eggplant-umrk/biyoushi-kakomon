import { expect, test } from '@playwright/test';
import {
  ADMIN_USER,
  answeredOf,
  answerQuestions,
  fakeUser,
  FIRESTORE,
  findUserDoc,
  localLeftovers,
  login,
  newDevice,
  startDefaultSet,
} from './helpers';

/**
 * 端末内の写しの消去と、管理画面の「要確認」の E2E（SPEC §8.2 / §8.4）。Firebase Emulator に対して動かす。
 *   npm run test:e2e
 */

// Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できないので、Windows でだけ飛ばす（login.spec.ts と同じ）
test.skip(
  ({ browserName }) => browserName === 'webkit' && process.platform === 'win32',
  'Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できない',
);

test('ログアウト以外でログインが切れたときも、端末内の写しを消して知らせる', async ({ browser }, info) => {
  const user = fakeUser(info, 'end');
  const { context, page } = await newDevice(browser, info, user);
  await login(page);
  await startDefaultSet(page);
  await answerQuestions(page, 2);
  await page.goto('./#/home');
  await expect.poll(async () => answeredOf(await findUserDoc(user.name)), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await localLeftovers(page)).records, { timeout: 10_000 }).toBeGreaterThan(0);

  // Firebase のログイン情報だけを消して読み込み直す（ほかの端末でのアカウント削除・ログインの失効と同じく、
  // アプリのログアウトを通らずに「ログインしていない」になる）
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('firebaseLocalStorage', 'readwrite');
          tx.objectStore('firebaseLocalStorage').clear();
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(page.getByTestId('session-ended')).toBeVisible();
  await expect.poll(async () => (await localLeftovers(page)).records, { timeout: 10_000 }).toBe(0);
  // クラウドの記録は残っている
  expect(answeredOf(await findUserDoc(user.name))).toBeGreaterThan(0);
  await context.close();
});

test('2つのタブで開いているとき、片方でログアウトすると、もう片方もログイン画面になり写しが残らない', async ({ browser }, info) => {
  const user = fakeUser(info, 'tab');
  const { context, page: a } = await newDevice(browser, info, user);
  await login(a);
  await startDefaultSet(a);
  await answerQuestions(a, 2);
  await a.goto('./#/home');
  await expect.poll(async () => answeredOf(await findUserDoc(user.name)), { timeout: 15_000 }).toBeGreaterThan(0);

  const b = await context.newPage();
  await b.goto('./#/home');
  await expect(b.getByTestId('total-count')).toBeVisible();

  await a.goto('./#/settings');
  const reloaded = a.waitForEvent('load');
  await a.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await reloaded;
  await expect(a.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(b.getByRole('button', { name: 'Googleでログイン' })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await localLeftovers(b)).records, { timeout: 10_000 }).toBe(0);
  await context.close();
});

/** 管理画面の「要確認」を確かめるための利用者を、ルールを通さずに用意する（送信回数が解答数よりずっと多い） */
async function seedNoisyUser(uid: string, name: string): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(`${FIRESTORE}/users/${uid}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        displayName: { stringValue: name },
        createdAt: { timestampValue: now },
        lastActiveAt: { timestampValue: now },
        syncAt: { timestampValue: now },
        syncSeq: { integerValue: '5000' },
        totals: { mapValue: { fields: { answered: { integerValue: '10' }, correct: { integerValue: '5' } } } },
        byField: { mapValue: { fields: {} } },
        examBest: { mapValue: { fields: {} } },
      },
    }),
  });
  if (!res.ok) throw new Error(`seed users/${uid}: ${res.status}`);
}

test('管理画面で、更新回数が異常に多い利用者を「要確認」として先頭に出す', async ({ browser }, info) => {
  const id = fakeUser(info, 'noisy').sub;
  const name = `多い ${id}`.slice(0, 30);
  await seedNoisyUser(id, name);

  const { context, page } = await newDevice(browser, info, ADMIN_USER);
  await login(page);
  await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '管理' }).click();
  await expect(page.getByTestId('admin-alert')).toBeVisible();
  // 一覧の先頭は「要確認」の人（ほかのテストの利用者もいるので、名前で探す）
  await expect(page.locator('.admin-users li').first()).toContainText('要確認');
  const row = page.locator('.admin-users li').filter({ hasText: name });
  await expect(row).toContainText('要確認');
  await expect(row).toContainText(`ID ${id.slice(0, 6)}`);
  await row.getByRole('button').click();
  await expect(page.getByTestId('admin-detail-alert')).toContainText('解答の伴わない送信が多い');
  await expect(page.getByText('自己申告')).toBeVisible();
  await context.close();
});
