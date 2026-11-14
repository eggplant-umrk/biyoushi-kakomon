import { expect, test, type Page } from '@playwright/test';
import { ADMIN_USER, fakeUser, findUserDoc, idTokenOf, login, newDevice, readAs, FIRESTORE } from './helpers';

/**
 * 7a-2：閲覧モード・検索・要復習マーク・メモ。
 * ゲストの確認と、ログインしたときの同期（Firebase Emulator）・本人だけのものになっていること。
 *   npm run test:e2e
 */

const tabs = (page: Page) => page.getByRole('navigation', { name: 'メインメニュー' });

async function enterAsGuest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/#\/home$/);
}

test('閲覧モード：全770問の一覧、絞り込み、検索の強調、1問を開いて解説を読み、その1問を解く', async ({ page }) => {
  await enterAsGuest(page);
  await tabs(page).getByRole('button', { name: '読む' }).click();
  await expect(page.getByTestId('read-count')).toHaveText('770問');
  // 長い一覧でも、描くのは見えている行だけ（仮想リスト）
  expect(await page.getByTestId('read-item').count()).toBeLessThan(80);

  // 絞り込み：第54回だけ・関係法規だけ
  await page.getByRole('button', { name: /絞り込み/ }).click();
  await page.locator('#read-filters').getByRole('checkbox', { name: '第54回' }).evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByTestId('read-count')).toHaveText('55問');
  await page.locator('#read-filters').getByRole('radio', { name: '関係法規' }).evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByTestId('read-count')).toHaveText('10問');
  await page.getByRole('button', { name: 'すべて外す' }).click();
  await page.getByTestId('filter-apply').click();
  await expect(page.getByTestId('read-count')).toHaveText('770問');

  // 検索：一致した語を強調する（全角・半角、カタカナ・ひらがなの違いは無視）
  await page.getByRole('searchbox').fill('ぱーまねんと');
  await expect(page.getByTestId('read-count')).toContainText('に一致');
  await expect(page.locator('mark.hit').first()).toHaveText(/パーマネント/);
  // 検索語を続けて変えても、前の検索語の結果を新しい検索語の件数として出さない
  const firstCount = await page.getByTestId('read-count').innerText();
  await page.getByRole('searchbox').fill('ぱーまねんと 酸化');
  await expect(page.getByTestId('read-count')).toContainText('「ぱーまねんと 酸化」に一致');
  expect(await page.getByTestId('read-count').innerText()).not.toBe(firstCount.replace('ぱーまねんと', 'ぱーまねんと 酸化'));
  const narrowed = Number((await page.getByTestId('read-count').innerText()).match(/：(\d+)問/)?.[1]);
  const wide = Number(firstCount.match(/：(\d+)問/)?.[1]);
  expect(narrowed).toBeLessThan(wide);
  // 検索語は、HTML として解釈しない
  await page.getByRole('searchbox').fill('<b>x</b>');
  await expect(page.getByTestId('read-count')).toContainText('<b>x</b>');
  await expect(page.locator('.read b')).toHaveCount(0);
  await page.getByRole('button', { name: '検索語を消す' }).click();
  await expect(page.getByTestId('read-count')).toHaveText('770問');

  // 1問を開く：正答と解説（解答画面と同じ表示）
  await page.getByTestId('read-item').first().click();
  await expect(page).toHaveURL(/#\/read\?q=54-01$/);
  await expect(page.getByText('○ 正答')).toBeVisible();
  await expect(page.getByTestId('explanation')).toBeVisible();
  // 次の問題へ
  await page.getByRole('button', { name: '次の問題' }).click();
  await expect(page).toHaveURL(/q=54-02$/);
  // この問題を解く
  await page.getByTestId('solve-this').click();
  await expect(page).toHaveURL(/#\/quiz$/);
  await expect(page.getByTestId('quiz-count')).toHaveText('1/1');
  await expect(page.locator('.quiz-meta')).toContainText('第54回 問2');
});

test('要復習マークとメモ：閲覧モードと解答画面の両方から。一覧に印が出て、絞り込みと「今日やること」に反映', async ({ page }) => {
  await enterAsGuest(page);
  await page.goto('./#/read?q=54-03');
  await page.getByRole('button', { name: '要復習マークを付ける' }).click();
  await expect(page.getByRole('button', { name: '要復習マークを外す' })).toHaveAttribute('aria-pressed', 'true');

  // メモ：500文字まで。HTML として解釈しない
  await page.getByRole('button', { name: 'メモを書く' }).click();
  const area = page.getByRole('textbox', { name: 'メモ' });
  await area.fill('x'.repeat(520));
  await expect(area).toHaveValue('x'.repeat(500));
  await area.fill('<img src=x onerror=alert(1)> 覚え方：三十日');
  await expect(page.getByText(/\d+ \/ 500文字/)).toBeVisible();
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByTestId('memo-view')).toContainText('<img src=x onerror=alert(1)> 覚え方：三十日');
  await expect(page.locator('.memo-view img')).toHaveCount(0);

  // 一覧に印が出る。「要復習のみ」「メモありのみ」で絞り込める
  await page.getByRole('button', { name: '一覧へ戻る' }).click();
  await page.getByRole('button', { name: /絞り込み/ }).click();
  await page.locator('#read-filters').getByRole('checkbox', { name: '要復習のみ' }).evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByTestId('read-count')).toHaveText('1問');
  await expect(page.getByTestId('memo-badge')).toHaveCount(1);
  await page.locator('#read-filters').getByRole('checkbox', { name: '要復習のみ' }).evaluate((el) => (el as HTMLInputElement).click());
  await page.locator('#read-filters').getByRole('checkbox', { name: 'メモありのみ' }).evaluate((el) => (el as HTMLInputElement).click());
  await expect(page.getByTestId('read-count')).toHaveText('1問');

  // ホームの「今日やること」：要復習の問題を解く（まだ間違えた問題がないとき）
  await tabs(page).getByRole('button', { name: 'ホーム' }).click();
  await page.getByRole('button', { name: /要復習の問題を解く（1問）/ }).click();
  await expect(page.getByTestId('quiz-count')).toHaveText('1/1');
  await expect(page.locator('.quiz-meta')).toContainText('第54回 問3');
  // 解答画面でも、マークとメモが見える。たまたま正解しても外さなければ残る
  await expect(page.getByRole('button', { name: '要復習マークを外す' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'メモを開く（メモあり）' })).toBeVisible();
  await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
  await expect(page.getByTestId('memo-view')).toBeVisible();

  // 出題条件の「要復習のみ」
  await page.goto('./#/setup');
  await page.getByRole('button', { name: 'すべての回' }).click();
  await page.getByRole('radio', { name: '要復習のみ（★）' }).evaluate((el) => (el as HTMLInputElement).click());
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page.getByTestId('quiz-count')).toHaveText('1/1');
  // 解答画面から外せる
  await page.getByRole('button', { name: '要復習マークを外す' }).click();
  await expect(page.getByRole('button', { name: '要復習マークを付ける' })).toBeVisible();
});

test.describe('ログインしたとき（Firebase Emulator）', () => {
  // Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できない（login.spec.ts と同じ）
  test.skip(
    ({ browserName }) => browserName === 'webkit' && process.platform === 'win32',
    'Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できない',
  );

  test('要復習マーク・メモは端末間で同期し、通信が切れても失われない。管理者は読めず、解答の記録は増えない', async ({ browser }, info) => {
    const user = fakeUser(info, 'memo');
    const a = await newDevice(browser, info, user);
    await login(a.page);
    await expect.poll(async () => (await findUserDoc(user.name)) !== null, { timeout: 20_000 }).toBe(true);
    const uid = String((await findUserDoc(user.name))?.path ?? '').split('/').pop() ?? '';
    expect(uid).not.toBe('');

    // 端末A：1問にマークとメモ
    await a.page.goto('./#/read?q=53-10');
    await a.page.getByRole('button', { name: '要復習マークを付ける' }).click();
    await a.page.getByRole('button', { name: 'メモを書く' }).click();
    await a.page.getByRole('textbox', { name: 'メモ' }).fill('端末Aのメモ');
    await a.page.getByRole('button', { name: '保存する' }).click();
    const owner = { headers: { Authorization: 'Bearer owner' } };
    const marksOf = async () => {
      const r = await fetch(`${FIRESTORE}/users/${uid}/review/marks`, owner);
      if (!r.ok) return [];
      const b = (await r.json()) as { fields?: { ids?: { mapValue?: { fields?: Record<string, unknown> } } } };
      return Object.keys(b.fields?.ids?.mapValue?.fields ?? {}).sort();
    };
    const memoOf = async (qid: string) => {
      const r = await fetch(`${FIRESTORE}/users/${uid}/memos/${qid}`, owner);
      if (!r.ok) return null;
      return ((await r.json()) as { fields?: { text?: { stringValue?: string } } }).fields?.text?.stringValue ?? null;
    };
    await expect.poll(marksOf, { timeout: 20_000 }).toEqual(['53-10']);
    await expect.poll(() => memoOf('53-10'), { timeout: 20_000 }).toBe('端末Aのメモ');

    // 通信が切れているときに付けたマーク・書いたメモも、つながったら届く
    await a.context.setOffline(true);
    await a.page.goto('./#/read?q=53-11');
    await a.page.getByRole('button', { name: '要復習マークを付ける' }).click();
    await a.page.getByRole('button', { name: 'メモを書く' }).click();
    await a.page.getByRole('textbox', { name: 'メモ' }).fill('通信なしのメモ');
    await a.page.getByRole('button', { name: '保存する' }).click();
    await a.page.waitForTimeout(5000);
    expect(await marksOf()).toEqual(['53-10']);
    await a.context.setOffline(false);
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(marksOf, { timeout: 20_000 }).toEqual(['53-10', '53-11']);
    await expect.poll(() => memoOf('53-11'), { timeout: 20_000 }).toBe('通信なしのメモ');

    // 解答の記録（users の集計）は増えていない
    const doc = await findUserDoc(user.name);
    expect(Number(doc?.totals?.mapValue?.fields?.answered?.integerValue ?? 0)).toBe(0);

    // 端末B：同じアカウントでログインすると、マークとメモが見える。外すと端末Aにも届く
    const b = await newDevice(browser, info, user);
    await login(b.page);
    await b.page.goto('./#/read');
    await b.page.getByRole('button', { name: /絞り込み/ }).click();
    await b.page.locator('#read-filters').getByRole('checkbox', { name: '要復習のみ' }).evaluate((el) => (el as HTMLInputElement).click());
    await expect(b.page.getByTestId('read-count')).toHaveText('2問', { timeout: 20_000 });
    await expect(b.page.getByTestId('memo-badge')).toHaveCount(2);
    await b.page.goto('./#/read?q=53-10');
    await expect(b.page.getByTestId('memo-view')).toContainText('端末Aのメモ');
    await b.page.getByRole('button', { name: '要復習マークを外す' }).click();
    await expect.poll(marksOf, { timeout: 20_000 }).toEqual(['53-11']);

    // 管理者でも、マーク・メモは読めない（ルール）。管理画面にも出ない
    const adm = await newDevice(browser, info, ADMIN_USER);
    await login(adm.page);
    await expect(tabs(adm.page).getByRole('button', { name: '管理' })).toBeVisible();
    const token = await idTokenOf(adm.page);
    expect(await readAs(token, `users/${uid}/memos/53-10`)).toBe(403);
    expect(await readAs(token, `users/${uid}/memos`)).toBe(403);
    expect(await readAs(token, `users/${uid}/review/marks`)).toBe(403);
    // 本人は読める（比較のため）
    expect(await readAs(await idTokenOf(a.page), `users/${uid}/memos/53-10`)).toBe(200);
    await adm.page.goto('./#/admin');
    await expect(adm.page.getByText('端末Aのメモ')).toHaveCount(0);

    await Promise.all([a.context.close(), b.context.close(), adm.context.close()]);
  });
});
