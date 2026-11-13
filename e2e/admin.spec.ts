import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ExamFile, ExamMeta } from '../src/lib/types';
import { ADMIN_USER, answeredOf, answerQuestions, fakeUser, findUserDoc, login, newDevice, startDefaultSet, type FakeUser } from './helpers';

/**
 * 管理画面の E2E（SPEC §7 / §10 フェーズ5）。iPhone 15 / Pixel 7 のエミュレーションで、Firebase Emulator に対して動かす。
 *   npm run test:e2e
 */

// Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できないので、Windows でだけ飛ばす（login.spec.ts と同じ）
test.skip(
  ({ browserName }) => browserName === 'webkit' && process.platform === 'win32',
  'Windows 版の Playwright WebKit は Firestore Emulator と安定して通信できない',
);

// 初期の出題条件は「最新の回・全分野・10問・番号順」。すべて (1) を選んだときの正解数を実データから求める
const exams = JSON.parse(readFileSync('public/data/exams.json', 'utf8')) as ExamMeta[];
const latest = Math.max(...exams.map((e) => e.examNo));
const latestFile = JSON.parse(readFileSync(`public/data/exam-${latest}.json`, 'utf8')) as ExamFile;
const picked = [...latestFile.questions].sort((a, b) => a.no - b.no).slice(0, 10);
const scored = picked.filter((q) => !q.scoringExcluded);
const CORRECT = scored.filter((q) => q.answer === 1 || (q.altAnswers ?? []).includes(1)).length;
const WRONG = scored.length - CORRECT;
const pct = (c: number, a: number) => `${Math.round((c / a) * 100)}%`;

const tabs = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'メインメニュー' });

test('管理者は利用者の一覧と詳細を見られ、苦手問題を自分の記録に残さずに出題できる', async ({ browser }, info) => {
  test.setTimeout(120_000);
  expect(WRONG).toBeGreaterThan(0);

  // 利用者：同じ10問を2回解く（2回以上解いて間違えた問題が「苦手問題」になる）
  const user = fakeUser(info);
  const u = await newDevice(browser, info, user);
  await login(u.page);
  for (let round = 0; round < 2; round++) {
    await startDefaultSet(u.page);
    await answerQuestions(u.page, picked.length);
    await expect(u.page).toHaveURL(/#\/result$/);
  }
  const total = scored.length * 2;
  await expect.poll(async () => answeredOf(await findUserDoc(user.name)), { timeout: 20_000 }).toBe(total);
  const userDocBefore = JSON.stringify(await findUserDoc(user.name));

  // 利用者の画面には「管理」タブも、見られていることが分かる表示もない
  await u.page.goto('./#/home');
  await expect(tabs(u.page).getByRole('button', { name: '管理' })).toHaveCount(0);

  // 管理者
  const a = await newDevice(browser, info, ADMIN_USER);
  const problems: string[] = [];
  a.page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  a.page.on('pageerror', (e) => problems.push(e.message));
  await login(a.page);
  await tabs(a.page).getByRole('button', { name: '管理' }).click();
  await expect(a.page).toHaveURL(/#\/admin$/);

  // 一覧：表示名、最終学習日、直近7日、累計と正答率
  await expect(a.page.getByTestId('admin-user-count')).toHaveText(/利用者 \d+人/);
  const card = a.page.getByRole('button', { name: new RegExp(user.name) });
  await expect(card).toBeVisible();
  await expect(card).toContainText('最終学習日今日');
  await expect(card).toContainText(`直近7日${total}問`);
  await expect(card).toContainText(`累計${total}問・正答率 ${pct(CORRECT * 2, total)}`);
  // 自分（管理者）も一覧に出る
  await expect(a.page.getByRole('button', { name: /管理者テスト.*自分/ })).toBeVisible();
  // スマホの幅で横スクロールが出ない
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const box = await card.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);

  // 詳細
  await card.click();
  await expect(a.page).toHaveURL(/#\/admin\?u=/);
  await expect(a.page.getByTestId('admin-detail-name')).toHaveText(user.name);
  await expect(a.page.getByTestId('admin-total')).toHaveText(`${total}問`);
  // 分野別：8分野。解いたのは関係法規（問1〜10）だけ
  const fields = a.page.getByTestId('admin-fields').getByRole('listitem');
  await expect(fields).toHaveCount(8);
  await expect(fields.first()).toContainText('関係法規');
  await expect(fields.first()).toContainText(`${pct(CORRECT * 2, total)} (${total})`);
  // 直近14日の学習量：14本の棒。今日の分だけ入っている
  await expect(a.page.getByRole('list', { name: '直近14日の日別の解答数' }).getByRole('listitem')).toHaveCount(14);
  await expect(a.page.getByTestId('admin-series-total')).toHaveText(`合計 ${total}問`);
  // 苦手問題：2回とも間違えた問題
  const weak = a.page.getByTestId('admin-weak-list').getByRole('listitem');
  await expect(weak).toHaveCount(Math.min(WRONG, 10));
  await expect(weak.first()).toContainText(`第${latest}回 問`);
  await expect(weak.first()).toContainText('0/2回 正解');
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  // 一覧へ戻って、もう一度詳細を開ける（ブラウザの「戻る」でも一覧に戻る）
  await a.page.getByRole('button', { name: '← 利用者の一覧へ' }).click();
  await expect(a.page).toHaveURL(/#\/admin$/);
  await a.page.getByRole('button', { name: new RegExp(user.name) }).click();
  await expect(a.page.getByTestId('admin-detail-name')).toHaveText(user.name);
  await a.page.goBack();
  await expect(a.page.getByTestId('admin-user-count')).toBeVisible();
  await a.page.goForward();

  // この人の苦手問題で出題：管理者の端末で解く。チェックや過去の正誤は出さない
  await a.page.getByRole('button', { name: `この人の苦手問題で出題（${WRONG}問）` }).click();
  await expect(a.page).toHaveURL(/#\/quiz$/);
  await expect(a.page.getByTestId('quiz-count')).toHaveText(`1/${WRONG}`);
  await expect(a.page.getByTestId('study-note')).toBeVisible();
  await expect(a.page.getByRole('button', { name: /あとで見直すチェック/ })).toHaveCount(0);
  await answerQuestions(a.page, WRONG);
  await expect(a.page).toHaveURL(/#\/result$/);
  await expect(a.page.getByTestId('study-note')).toBeVisible();
  await expect(a.page.getByTestId('score')).toContainText(`0 / ${WRONG} 問正解`);

  // 管理者自身の記録は増えていない（端末内も Firestore も）
  await a.page.getByRole('button', { name: 'ホームへ' }).click();
  await expect(a.page.getByTestId('total-count')).toHaveText('0問');
  await expect(a.page.getByTestId('today-count')).toHaveText('0問');
  await a.page.goto('./#/stats');
  await expect(a.page.getByText('まだ記録がありません。')).toBeVisible();
  await a.page.waitForTimeout(1500); // もし送信していれば届くだけの時間を置く
  expect(answeredOf(await findUserDoc(ADMIN_USER.name))).toBe(0);
  // 利用者の記録も変わっていない（管理者は読むだけ）
  expect(JSON.stringify(await findUserDoc(user.name))).toBe(userDocBefore);

  expect(problems).toEqual([]);
  await u.context.close();
  await a.context.close();
});

test('管理者以外には管理タブが出ず、/admin を開いても何も表示されない', async ({ browser }, info) => {
  // 見られる側の利用者（記録あり）
  const target = fakeUser(info, 'tgt');
  const t = await newDevice(browser, info, target);
  await login(t.page);
  await startDefaultSet(t.page);
  await answerQuestions(t.page, 2);
  await t.page.goto('./#/home');
  await expect.poll(async () => answeredOf(await findUserDoc(target.name)), { timeout: 20_000 }).toBeGreaterThan(0);
  const targetUid = String((await findUserDoc(target.name))?.path ?? '').split('/').pop() ?? '';
  expect(targetUid).not.toBe('');
  await t.context.close();

  // 別の一般の利用者と、メールが確認済みでない人。
  // （管理者と同じメールで未確認・Googleログイン以外、といった「管理者に見せかけた人」はルールのテストで確認している）
  const others: FakeUser[] = [fakeUser(info, 'other'), { ...fakeUser(info, 'fake'), email_verified: false }];
  for (const who of others) {
    const { context, page } = await newDevice(browser, info, who);
    await login(page);
    await expect(page.getByTestId('total-count')).toBeVisible();
    await expect(tabs(page).getByRole('button', { name: '管理' })).toHaveCount(0);
    // URL を直接開いても、ホームに戻されて管理画面は出ない
    for (const url of ['./#/admin', `./#/admin?u=${targetUid}`]) {
      await page.goto(url);
      await expect(page).toHaveURL(/#\/home$/);
      await expect(page.getByTestId('admin-user-count')).toHaveCount(0);
      await expect(page.getByText(target.name)).toHaveCount(0);
    }
    // 読み込み直しても同じ（管理者かどうかは毎回ルールで判定される）
    await page.goto(`./#/admin?u=${targetUid}`);
    await page.reload();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByText(target.name)).toHaveCount(0);
    await context.close();
  }

  // ログインしていない人（ゲスト）も同じ
  const guest = await browser.newContext({ ...info.project.use });
  const gp = await guest.newPage();
  await gp.goto('./');
  await gp.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(tabs(gp).getByRole('button', { name: '管理' })).toHaveCount(0);
  await gp.goto(`./#/admin?u=${targetUid}`);
  await expect(gp).toHaveURL(/#\/home$/);
  await expect(gp.getByText(target.name)).toHaveCount(0);
  await guest.close();
});
