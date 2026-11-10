import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

/**
 * ログイン・記録の E2E（SPEC §6.2〜§6.5 / §8.4）。Firebase Emulator（Auth・Firestore）に対して動かす。
 * Emulator には本番と同じセキュリティルール（管理者は admin@example.com）を読み込ませてある。
 *   npm run test:e2e
 */

// Windows 版の Playwright WebKit は通信に curl を使っており、Firestore Emulator との通信（WebChannel）で
// 「rewinding of the data stream failed」という失敗が起きる。CI（Linux）と実機の Safari では起きないので、
// Windows の WebKit でだけログインのテストを飛ばす
test.skip(
  ({ browserName }) => browserName === 'webkit' && process.platform === 'win32',
  'Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できない',
);

const FIRESTORE = 'http://localhost:8080/v1/projects/demo-kakomon/databases/(default)/documents';

interface FakeUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

function fakeUser(info: TestInfo, label = 'user'): FakeUser {
  // 表示名は30文字までなので、短くて重ならないIDにする
  const id = `${label}-${info.project.name.slice(0, 2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
  return { sub: id, email: `${id}@example.com`, email_verified: true, name: `テスト ${id}` };
}

/** 新しい端末（ブラウザのコンテキスト）を作る。Auth Emulator に渡す Google アカウントを決めておく */
async function newDevice(browser: Browser, info: TestInfo, user: FakeUser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...info.project.use });
  await context.addInitScript((u) => localStorage.setItem('e2e-user', JSON.stringify(u)), user);
  const page = await context.newPage();
  return { context, page };
}

async function login(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

/** Emulator の Firestore を、ルールを通さずに読む（テストの確認用） */
async function findUserDoc(name: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${FIRESTORE}/users?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()) as { documents?: { name: string; fields: Record<string, any> }[] };
  const hit = (body.documents ?? []).find((d) => d.fields.displayName?.stringValue === name);
  return hit ? { path: hit.name, ...hit.fields } : null;
}
const answeredOf = (doc: Record<string, any> | null) => Number(doc?.totals?.mapValue?.fields?.answered?.integerValue ?? -1);

async function answerQuestions(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await expect(page.getByTestId('verdict')).toBeVisible();
    await page.getByTestId('next').click();
  }
}

async function startDefaultSet(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '出題' }).click();
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page).toHaveURL(/#\/quiz$/);
}

test('ログインして解いた記録が、別の端末でログインしても見える', async ({ browser }, info) => {
  test.setTimeout(90_000);
  const user = fakeUser(info);
  const a = await newDevice(browser, info, user);
  const problems: string[] = [];
  a.page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  a.page.on('pageerror', (e) => problems.push(e.message));

  await login(a.page);
  await expect(a.page.getByTestId('total-count')).toHaveText('0問');
  // 管理者ではないので管理タブは出ない
  await expect(a.page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '管理' })).toHaveCount(0);

  await startDefaultSet(a.page);
  // 1問目にチェックを付けてから10問解く
  await a.page.getByRole('button', { name: 'あとで見直すチェックを付ける' }).click();
  await answerQuestions(a.page, 10);
  await expect(a.page).toHaveURL(/#\/result$/);
  await a.page.getByRole('button', { name: 'ホームへ' }).click();
  const total = await a.page.getByTestId('total-count').innerText();
  expect(total).toMatch(/^(9|10)問$/); // 採点対象外の問題があれば1問少ない

  // Firestore に届くまで待つ（セット終了時にまとめて送信する）
  const expected = Number(total.replace('問', ''));
  await expect.poll(async () => answeredOf(await findUserDoc(user.name)), { timeout: 15_000 }).toBe(expected);
  const doc = await findUserDoc(user.name);
  // メールアドレスは Firestore に保存しない（SPEC §6.3）
  expect(Object.keys(doc ?? {}).sort()).toEqual(['byField', 'createdAt', 'displayName', 'examBest', 'lastActiveAt', 'path', 'totals']);
  expect(JSON.stringify(doc)).not.toContain(user.email);

  // 別の端末
  const b = await newDevice(browser, info, user);
  await login(b.page);
  await expect(b.page.getByTestId('total-count')).toHaveText(total);
  await expect(b.page.getByTestId('today-count')).toHaveText(total);
  // 記録画面にも出る
  await b.page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '記録' }).click();
  await expect(b.page.getByRole('heading', { name: '最近の学習（日別）' })).toBeVisible();
  await expect(b.page.locator('table').nth(1).locator('tbody tr')).toHaveCount(1);
  // チェックと過去の正誤も引き継がれている
  await startDefaultSet(b.page);
  await expect(b.page.getByRole('button', { name: 'あとで見直すチェックを外す' })).toHaveAttribute('aria-pressed', 'true');
  await expect(b.page.getByLabel(/^過去の正誤/)).toBeVisible();

  // 端末Bで2問解くと、端末Aを開き直したときに合計が増えている（上書きではなく加算）
  await answerQuestions(b.page, 2);
  await b.page.goto('./#/home');
  await a.page.reload();
  await expect
    .poll(async () => {
      await a.page.reload();
      return a.page.getByTestId('total-count').innerText();
    }, { timeout: 20_000 })
    .not.toBe(total);

  expect(problems).toEqual([]);
  await a.context.close();
  await b.context.close();
});

test('ゲストの記録を、ログイン後に引き継げる', async ({ browser }, info) => {
  const user = fakeUser(info);
  const { context, page } = await newDevice(browser, info, user);

  // ゲストで2問解く
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await startDefaultSet(page);
  await answerQuestions(page, 2);
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'ログイン画面へ' }).click();
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page).toHaveURL(/#\/home$/);

  // 引き継ぐか確認される。引き継ぐまではアカウントの記録は0問
  await expect(page.getByRole('heading', { name: 'ログイン前の記録を引き継ぎますか？' })).toBeVisible();
  await expect(page.getByTestId('total-count')).toHaveText('0問');
  await page.getByRole('button', { name: '引き継ぐ' }).click();
  await expect(page.getByRole('heading', { name: 'ログイン前の記録を引き継ぎますか？' })).toHaveCount(0);
  await expect(page.getByTestId('total-count')).toHaveText(/^[12]問$/);
  const total = await page.getByTestId('total-count').innerText();
  await expect
    .poll(async () => answeredOf(await findUserDoc(user.name)), { timeout: 15_000 })
    .toBe(Number(total.replace('問', '')));
  await context.close();
});

test('表示名の変更・ログアウト時のキャッシュ消去・アカウント削除', async ({ browser }, info) => {
  const user = fakeUser(info);
  const { context, page } = await newDevice(browser, info, user);
  await login(page);
  await startDefaultSet(page);
  await answerQuestions(page, 2);

  // 表示名の変更（制御文字は取り除かれ、30文字までになる）
  await page.goto('./#/settings');
  const newName = `改名 ${user.sub}`;
  await page.getByLabel('表示名').fill(`  ${newName}\u0007  `);
  await page.getByRole('button', { name: '表示名を変更する' }).click();
  await expect(page.getByText('変更しました。')).toBeVisible();
  await expect.poll(async () => (await findUserDoc(newName)) !== null, { timeout: 15_000 }).toBe(true);

  // ログアウトすると、端末内の記録の写しが消えてログイン画面に戻る
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  const cached = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('kakomon-user');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const names = Array.from(open.result.objectStoreNames);
          if (!names.includes('progress')) return resolve(0);
          const req = open.result.transaction('progress').objectStore('progress').count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );
  expect(cached).toBe(0);
  // クラウドの記録は残っている
  expect(answeredOf(await findUserDoc(newName))).toBeGreaterThan(0);

  // もう一度ログインして、アカウントを削除する（2段階）
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  const before = await findUserDoc(newName);
  expect(before).not.toBeNull();
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'アカウントを削除する' }).click();
  await page.getByRole('button', { name: '本当に削除する' }).click();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();

  // users/{uid} と、その下の progress・days が消えている
  expect(await findUserDoc(newName)).toBeNull();
  const path = String(before?.path ?? '');
  for (const sub of ['progress', 'days']) {
    const res = await fetch(`http://localhost:8080/v1/${path}/${sub}`, { headers: { Authorization: 'Bearer owner' } });
    const body = (await res.json()) as { documents?: unknown[] };
    expect(body.documents ?? []).toEqual([]);
  }
  await context.close();
});

test('管理者にだけ管理タブが出る（中身は準備中）', async ({ browser }, info) => {
  // ルールが管理者と見なすのは、Googleログイン・メール確認済みの admin@example.com（Emulator 用のルール）
  const admin: FakeUser = { sub: 'e2e-admin', email: 'admin@example.com', email_verified: true, name: '管理者テスト' };
  const { context, page } = await newDevice(browser, info, admin);
  await login(page);
  const tab = page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '管理' });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.getByRole('heading', { name: '準備中' })).toBeVisible();
  await context.close();

  // 同じメールでも確認済みでなければ管理者にならない
  const fake: FakeUser = { ...fakeUser(info, 'fake'), email_verified: false };
  const other = await newDevice(browser, info, fake);
  await login(other.page);
  await expect(other.page.getByTestId('total-count')).toBeVisible();
  await expect(other.page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '管理' })).toHaveCount(0);
  await other.page.goto('./#/admin');
  await expect(other.page).toHaveURL(/#\/home$/);
  await other.context.close();
});

test('アプリ内ブラウザでは、ログインボタンの代わりに外部ブラウザの案内を出す', async ({ browser }, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.5.0',
  });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByText('Googleログインは Safari / Chrome で開いてください。')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toHaveCount(0);
  await expect(page.getByLabel('このアプリのURL')).toHaveValue(/\/biyoushi-kakomon\/\?openExternalBrowser=1$/);
  await expect(page.getByRole('button', { name: 'URLをコピー' })).toBeVisible();
  // ゲストでは使える
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await context.close();
});
