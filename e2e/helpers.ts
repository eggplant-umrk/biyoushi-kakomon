import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

/**
 * ログインを使う E2E（login.spec.ts・admin.spec.ts）の共通部品。
 * Firebase Emulator（Auth・Firestore）に対して動かす。Emulator には本番と同じセキュリティルール
 * （管理者は admin@example.com）を読み込ませてある。
 */

/** ルールが管理者と見なすアカウント：Googleログイン・メール確認済みの admin@example.com（Emulator 用のルール） */
export const ADMIN_USER = { sub: 'e2e-admin', email: 'admin@example.com', email_verified: true, name: '管理者テスト' };

export const FIRESTORE = 'http://localhost:8080/v1/projects/demo-kakomon/databases/(default)/documents';

export interface FakeUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
}

export function fakeUser(info: TestInfo, label = 'user'): FakeUser {
  // 表示名は30文字までなので、短くて重ならないIDにする
  const id = `${label}-${info.project.name.slice(0, 2)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
  return { sub: id, email: `${id}@example.com`, email_verified: true, name: `テスト ${id}` };
}

/** 新しい端末（ブラウザのコンテキスト）を作る。Auth Emulator に渡す Google アカウントを決めておく */
export async function newDevice(browser: Browser, info: TestInfo, user: FakeUser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...info.project.use });
  await context.addInitScript((u) => localStorage.setItem('e2e-user', JSON.stringify(u)), user);
  const page = await context.newPage();
  return { context, page };
}

/**
 * ページを読み込み直したときに WebKit が出すエラーで、アプリの不具合ではないもの。
 * 読み込み直しで Firestore の通信（WebChannel）が途中で切れると、WebKit は「access control checks」のエラーを出し、
 * Firestore SDK は「バックエンドに接続できない」と出す。WebChannel は切れたときに www.google.com/images/cleardot.gif で
 * 通信の確認をしようとし、CSP（img-src）で止められる（Chromium では出ない）
 */
export function isReloadNoise(text: string): boolean {
  return (
    (/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel/.test(text) && /access control checks/.test(text)) ||
    // 読み込み直しで、Auth Emulator への問い合わせ（accounts:lookup など）が途中で切れたとき
    (/localhost:9099\/identitytoolkit\.googleapis\.com\//.test(text) && /access control checks/.test(text)) ||
    /Could not reach Cloud Firestore backend/.test(text) ||
    (/www\.google\.com\/images\/cleardot\.gif/.test(text) && /img-src/.test(text))
  );
}

/**
 * WebKit が、Firestore Emulator との通信（ロングポーリング）が途中で切れたときに出すエラー。
 * 通信路の切断で、SDK がつなぎ直す。アプリの不具合ではない（CI の iPhone で、まれに出る）
 */
export function isConnectionNoise(text: string): boolean {
  return text === 'Failed to load resource: Connection terminated unexpectedly';
}

export async function login(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

/** Emulator の Firestore を、ルールを通さずに読む（テストの確認用） */
export async function findUserDoc(name: string): Promise<Record<string, any> | null> {
  const res = await fetch(`${FIRESTORE}/users?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  const body = (await res.json()) as { documents?: { name: string; fields: Record<string, any> }[] };
  const hit = (body.documents ?? []).find((d) => d.fields.displayName?.stringValue === name);
  return hit ? { path: hit.name, ...hit.fields } : null;
}
export const answeredOf = (doc: Record<string, any> | null) => Number(doc?.totals?.mapValue?.fields?.answered?.integerValue ?? -1);

export async function answerQuestions(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await expect(page.getByTestId('verdict')).toBeVisible();
    await page.getByTestId('next').click();
  }
}

export async function startDefaultSet(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '出題' }).click();
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page).toHaveURL(/#\/quiz$/);
}
