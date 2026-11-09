import { expect, test, type Page } from '@playwright/test';

// サンプル5問の正答（public/data/exam-54.json）。すべて (1) を選ぶと正解は問11の1問だけになる
const TOTAL = 5;

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test('ゲストで5問解いて、結果と記録が残る', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  // ログイン画面
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '美容師国家試験 過去問トレーナー' })).toBeVisible();
  await expect(page.getByText('学習記録はクラウドに保存され、作成者が問題の改善や苦手分析に使います。')).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();

  // ホーム
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId('today-count')).toHaveText('0問');
  await expectNoHorizontalScroll(page);

  // 出題条件 → 開始
  await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '出題' }).click();
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page).toHaveURL(/#\/quiz$/);

  for (let i = 1; i <= TOTAL; i++) {
    await expect(page.getByTestId('quiz-count')).toHaveText(`${i}/${TOTAL}`);
    const choices = page.getByRole('list', { name: '選択肢' }).getByRole('button');
    await expect(choices).toHaveCount(4);
    const box = await choices.first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
    await expectNoHorizontalScroll(page);

    if (i === 1) {
      // あとで見直すチェック
      const star = page.getByRole('button', { name: 'あとで見直すチェックを付ける' });
      await star.click();
      await expect(page.getByRole('button', { name: 'あとで見直すチェックを外す' })).toHaveAttribute('aria-pressed', 'true');
    }

    await choices.first().click();
    // 正誤は色だけでなく記号と文字で表示する
    await expect(page.getByTestId('verdict')).toContainText(/正解|不正解/);
    await expect(page.getByText('○ 正答')).toBeVisible();
    // 端末内への記録が終わると過去の正誤マークが出る
    await expect(page.getByLabel(/^過去の正誤/)).toBeVisible();

    if (i === 2) {
      // 途中で閉じても「続きから」で再開できる
      await page.reload();
      await page.goto('./#/home');
      await page.getByRole('button', { name: /続きから/ }).click();
      await expect(page.getByTestId('quiz-count')).toHaveText(`2/${TOTAL}`);
      await expect(page.getByTestId('verdict')).toBeVisible();
    }

    await page.getByTestId('next').click();
  }

  // 結果
  await expect(page).toHaveURL(/#\/result$/);
  await expect(page.getByTestId('score')).toContainText(`1 / ${TOTAL} 問正解`);
  await expect(page.getByRole('heading', { name: '間違えた問題（4問）' })).toBeVisible();

  // ホームの成績に反映される
  await page.getByRole('button', { name: 'ホームへ' }).click();
  await expect(page.getByTestId('today-count')).toHaveText(`${TOTAL}問`);
  await expect(page.getByTestId('total-count')).toHaveText(`${TOTAL}問`);
  await expect(page.getByRole('button', { name: /続きから/ })).toHaveCount(0);

  // CSP 違反やスクリプトエラーが出ていない
  expect(problems).toEqual([]);
});
