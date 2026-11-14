import { expect, test, type Page } from '@playwright/test';

/**
 * 7a-1 の画面（docs/design.md）：初回の説明、ホームから1タップで解く、前後の移動（ボタン・スワイプ）、図の拡大、記録のグラフ、
 * ダークモード、小さい画面。ゲストで動かす（Firebase Emulator は使わない）。
 *   npm run test:e2e
 */

const tabs = (page: Page) => page.getByRole('navigation', { name: 'メインメニュー' });

async function enterAsGuest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

/** 横のスワイプ（タッチ）を、画面に送る */
async function swipe(page: Page, dx: number) {
  await page.evaluate((d) => {
    const el = document.querySelector('.screen.quiz');
    if (!el) throw new Error('出題画面がない');
    const make = (type: string, x: number) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }));
    };
    make('touchstart', 200);
    make('touchend', 200 + d);
  }, dx);
}

test.describe('初回の説明', () => {
  // この describe だけ「説明を見ていない」状態から始める
  test.use({ storageState: { cookies: [], origins: [] } });

  test('初回だけ出て、スキップすると次からは出ない', async ({ page }) => {
    await enterAsGuest(page);
    const dialog = page.getByRole('dialog', { name: /すきま時間に1問ずつ/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'スキップ' }).click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('today-count')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('ホームの「今日やること」から1タップで解き始め、前後に移れる（ボタン・スワイプ）', async ({ page }) => {
  await enterAsGuest(page);
  // 下のナビゲーションは5つ
  for (const name of ['ホーム', '解く', '読む', '記録', '設定']) await expect(tabs(page).getByRole('button', { name })).toBeVisible();
  await page.getByRole('button', { name: /まだ解いていない問題から10問/ }).click();
  await expect(page).toHaveURL(/#\/quiz$/);
  await expect(page.getByTestId('quiz-count')).toHaveText('1/10');

  // 解答前は「次へ」を押せず、案内が出る。「前へ」も1問目では押せない
  await expect(page.getByTestId('next')).toBeDisabled();
  await expect(page.getByTestId('prev')).toBeDisabled();
  await expect(page.getByText('選択肢をタップして解答')).toBeVisible();
  // 選択肢は高さ56px以上
  const h = await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(56);

  const first = (await page.locator('.quiz-meta').innerText()).match(/第\d+回 問\d+/)?.[0] ?? '';
  expect(first).not.toBe('');
  await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
  // 正誤は、色だけでなく文字でも出る
  await expect(page.getByTestId('verdict')).toContainText(/正解|不正解|採点対象外/);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('quiz-count')).toHaveText('2/10');

  // 前へ：1問目に戻ると、選んだ答えと正誤がそのまま見られる
  await page.getByTestId('prev').click();
  await expect(page.getByTestId('quiz-count')).toHaveText('1/10');
  await expect(page.locator('.quiz-meta')).toContainText(first);
  await expect(page.getByTestId('verdict')).toBeVisible();

  // スワイプ：左で次へ（解答済みなので進める）、右で前へ
  if (test.info().project.name === 'Pixel') {
    await swipe(page, -160);
    await expect(page.getByTestId('quiz-count')).toHaveText('2/10');
    // 未解答の問題では、左スワイプしても進まない
    await swipe(page, -160);
    await expect(page.getByTestId('quiz-count')).toHaveText('2/10');
    await swipe(page, 160);
    await expect(page.getByTestId('quiz-count')).toHaveText('1/10');
  }
});

test('図の問題：タップで拡大表示が開き、拡大・元に戻す・閉じるができる', async ({ page }) => {
  await enterAsGuest(page);
  await tabs(page).getByRole('button', { name: '解く' }).click();
  // 第41回の文化論・技術理論（問41〜）を番号順に
  await page.getByRole('button', { name: 'すべての回' }).click();
  for (let n = 42; n <= 54; n++) await page.getByRole('checkbox', { name: `第${n}回` }).evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByRole('checkbox', { name: '第41回' })).toBeChecked();
  await page.getByRole('button', { name: 'すべて解除' }).click();
  await page.getByRole('checkbox', { name: '文化論・技術理論' }).evaluate((el) => (el as HTMLInputElement).click());
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await page.getByTestId('next').click();
  }
  await expect(page.locator('.quiz-meta')).toContainText('第41回 問43');
  await page.getByRole('button', { name: '図を拡大する' }).first().click();
  const viewer = page.getByRole('dialog', { name: '図の拡大表示' });
  await expect(viewer).toBeVisible();
  const scale = () => page.getByTestId('viewer-img').evaluate((el) => (el as HTMLElement).style.transform);
  expect(await scale()).toContain('scale(1)');
  await viewer.getByRole('button', { name: '拡大' }).click();
  await viewer.getByRole('button', { name: '拡大' }).click();
  expect(await scale()).toContain('scale(2)');
  await viewer.getByRole('button', { name: /元に戻す/ }).click();
  expect(await scale()).toContain('scale(1)');
  await viewer.getByRole('button', { name: '閉じる' }).click();
  await expect(viewer).toHaveCount(0);
});

test('記録：解いたあとは分野別・回別・日別のグラフが出る。読む画面に一覧が出る', async ({ page }) => {
  await enterAsGuest(page);
  await tabs(page).getByRole('button', { name: '記録' }).click();
  await expect(page.getByText('まだ記録がありません。')).toBeVisible();
  await tabs(page).getByRole('button', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: /まだ解いていない問題から10問/ }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await page.getByTestId('next').click();
  }
  await page.goto('./#/stats');
  await expect(page.getByTestId('field-chart').getByRole('listitem')).toHaveCount(8);
  // 回別は、解いた回だけをグラフにし、残りは「まだ解いていない回」にまとめる
  const seen = await page.getByTestId('exam-chart').getByRole('listitem').count();
  expect(seen).toBeGreaterThanOrEqual(1);
  await expect(page.getByText(`まだ解いていない回（${14 - seen}回）`)).toBeVisible();
  await expect(page.getByTestId('day-col')).toHaveCount(1);
  await expect(page.getByTestId('day-col')).toHaveAttribute('aria-label', /3問/);
  await noHorizontalScroll(page);
  await tabs(page).getByRole('button', { name: '読む' }).click();
  await expect(page.getByTestId('read-count')).toHaveText('770問');
});

test('ダークモードと文字サイズの変更が、画面にすぐ反映される', async ({ page }) => {
  await enterAsGuest(page);
  await tabs(page).getByRole('button', { name: '設定' }).click();
  await page.locator('label.seg', { hasText: 'ダーク' }).locator('input').evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(20, 18, 20)');
  await page.locator('label.seg', { hasText: '特大' }).locator('input').evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.locator('html')).toHaveAttribute('data-font', 'xlarge');
  await tabs(page).getByRole('button', { name: 'ホーム' }).click();
  await noHorizontalScroll(page);
});

test.describe('幅360pxの画面', () => {
  test.use({ viewport: { width: 360, height: 700 } });
  test('主な画面で、横スクロールが出ない', async ({ page }) => {
    await enterAsGuest(page);
    for (const hash of ['#/home', '#/setup', '#/stats', '#/settings', '#/read']) {
      await page.goto(`./${hash}`);
      await page.waitForTimeout(300);
      await noHorizontalScroll(page);
    }
    await page.goto('./#/setup');
    await page.getByRole('button', { name: 'この条件で始める' }).click();
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await noHorizontalScroll(page);
  });
});
