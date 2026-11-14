import { devices, expect, test } from '@playwright/test';

/**
 * ログインのポップアップ（SPEC §6.2・§14 #63）。リダイレクトは使わない。
 * ポップアップがブロックされた・閉じられたとき、iPhone のホーム画面に追加したアプリで開いたとき、の画面を確かめる。
 * 本物の Google のポップアップは E2E では開けないので、E2E 用のビルドで結果を指定する（localStorage の e2e-popup）。
 *   npm run test:e2e
 */

test('ポップアップがブロックされたら、リダイレクトせずに、許可のしかたを案内する', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('e2e-popup', 'blocked'));
  await page.goto('./');
  const before = page.url();
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page.getByRole('alert')).toContainText('ポップアップ');
  await expect(page.getByTestId('popup-help')).toContainText('ポップアップブロック');
  // 画面は移らない（リダイレクトしない）。もう一度押せる
  expect(page.url()).toBe(before);
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeEnabled();
});

test('ポップアップを閉じたときは、エラーを出さずにログイン画面のまま', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('e2e-popup', 'closed'));
  await page.goto('./');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('iPhone のホーム画面に追加したアプリでは、ログインボタンの代わりに Safari で開く案内を出す', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, userAgent: devices['iPhone 15'].userAgent });
  await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByTestId('ios-app-note')).toContainText('ログインは Safari で行ってください');
  await expect(page.getByRole('link', { name: 'Safari で開く' })).toHaveAttribute('href', /openExternalBrowser=1$/);
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toHaveCount(0);
  // ログインせずには使える
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await context.close();
});

test('iPhone の Safari（ホーム画面のアプリではない）では、ふつうにログインボタンが出る', async ({ browser }, info) => {
  const context = await browser.newContext({ ...info.project.use, userAgent: devices['iPhone 15'].userAgent });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
  await expect(page.getByTestId('ios-app-note')).toHaveCount(0);
  await context.close();
});
