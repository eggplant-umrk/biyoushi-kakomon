import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ExamFile, ExamMeta } from '../src/lib/types';

/**
 * 解説の表示の E2E（SPEC §6.7.6）。iPhone 15 / Pixel 7 のエミュレーションで動かす。
 * 解説のある回（最新の回）と、まだ解説のない回の両方で、出題と表示が壊れないことを確かめる。
 */
const exams = JSON.parse(readFileSync('public/data/exams.json', 'utf8')) as ExamMeta[];
const examFile = (n: number) => JSON.parse(readFileSync(`public/data/exam-${n}.json`, 'utf8')) as ExamFile;
const latest = Math.max(...exams.map((e) => e.examNo));
const first = [...examFile(latest).questions].sort((a, b) => a.no - b.no)[0]!;
// まだ解説のない回（新しい順に探す）
const pendingExam = exams
  .map((e) => e.examNo)
  .sort((a, b) => b - a)
  .find((n) => examFile(n).questions.every((q) => q.explanation === null));

async function enterAsGuest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('button', { name: '出題' }).click();
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('解説のある問題：要点が先に出て、選択肢ごとの説明と根拠は折りたたまれている', async ({ page }) => {
  const ex = first.explanation;
  test.skip(!ex || ex.status !== 'published', '最新の回の問1に、公開済みの解説がない');
  if (!ex) return;
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await enterAsGuest(page);
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page).toHaveURL(/#\/quiz$/);

  // 解答する前は、解説も、誤りの語句の強調も出ない（答えが分かってしまうため）
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  await expect(page.locator('mark.trap')).toHaveCount(0);

  // 誤りの選択肢を選ぶ
  const wrong = [1, 2, 3, 4].find((n) => n !== first.answer && !(first.altAnswers ?? []).includes(n))!;
  await page.getByRole('list', { name: '選択肢' }).getByRole('button').nth(wrong - 1).click();
  await expect(page.getByTestId('verdict')).toContainText('不正解');

  // 要点：なぜその答えか、自分が選んだ選択肢の誤り
  const box = page.getByTestId('explanation');
  await expect(box).toBeVisible();
  await expect(box).not.toContainText('解説準備中');
  await expect(box.locator('.ex-summary')).toHaveText(ex.summary);
  await expect(box.getByTestId('ex-chosen')).toContainText(`あなたが選んだ (${wrong})`);
  await expect(box.getByTestId('ex-chosen')).toContainText(ex.perChoice[wrong - 1]!);
  if (ex.caution) await expect(box.getByTestId('ex-caution')).toContainText(ex.caution);
  if (ex.traps.length > 0) await expect(page.locator('mark.trap').first()).toBeVisible();

  // 選択肢ごとの説明は折りたたまれていて、開くと4つ出る
  const detail = box.getByTestId('ex-detail');
  await expect(detail).not.toHaveAttribute('open', '');
  await expect(detail.getByRole('listitem').first()).toBeHidden();
  const fold = detail.locator('summary');
  expect((await fold.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48);
  await fold.click();
  await expect(detail.getByRole('listitem')).toHaveCount(4 + (ex.perStatement?.length ?? 0));
  await expect(detail.locator('li.is-answer')).toContainText(`(${first.answer}) 正答`);

  // 根拠の資料：折りたたみ。リンクは https で、別タブで開く
  if (ex.sources.length > 0) {
    await box.getByText(`根拠の資料（${ex.sources.length}件）`).click();
    const links = box.locator('.sources a');
    await expect(links).toHaveCount(ex.sources.length);
    await expect(links.first()).toHaveAttribute('href', /^https:\/\//);
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
  }

  // スマホの幅で横スクロールが出ない。次の問題へ進める
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('quiz-count')).toHaveText('2/10');
  await expect(page.getByTestId('explanation')).toHaveCount(0);
  expect(problems).toEqual([]);
});

// 教科書の参照（SPEC §14）。最初の10問（問1〜10）の中で、参照が付いている最初の問題まで解いて表示を確かめる
async function answerUntil(page: Page, no: number) {
  for (let i = 1; i < no; i++) {
    await expect(page.getByTestId('quiz-count')).toHaveText(`${i}/10`);
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await expect(page.getByTestId('verdict')).toBeVisible();
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('quiz-count')).toHaveText(`${no}/10`);
  await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
  await expect(page.getByTestId('verdict')).toBeVisible();
}

const withRef = (n: number) =>
  [...examFile(n).questions].sort((a, b) => a.no - b.no).find((q) => q.no <= 10 && (q.textbookRefs?.length ?? 0) > 0);

test('教科書の参照：解説のある問題にも、解説のまだない問題にも、1行で表示される', async ({ browser }, info) => {
  const explained = withRef(latest);
  const pending = pendingExam === undefined ? undefined : withRef(pendingExam);
  test.skip(!explained && !pending, '教科書の参照が付いた問題がない');

  for (const [examNo, q] of [
    [latest, explained],
    [pendingExam, pending],
  ] as const) {
    if (!q || examNo === undefined) continue;
    const context = await browser.newContext({ ...info.project.use });
    const page = await context.newPage();
    await enterAsGuest(page);
    for (const e of exams) {
      const box = page.getByRole('checkbox', { name: `第${e.examNo}回` });
      if (e.examNo === examNo) await box.check();
      else await box.uncheck();
    }
    await page.getByRole('button', { name: 'この条件で始める' }).click();
    await expect(page).toHaveURL(/#\/quiz$/);

    // 解答する前は出さない（どの分野の何ページかが、答えの手がかりになりうる）
    await expect(page.getByTestId('textbook-refs')).toHaveCount(0);
    await answerUntil(page, q.no);

    const refs = page.getByTestId('textbook-refs').getByRole('listitem');
    await expect(refs).toHaveCount(q.textbookRefs!.length);
    const r = q.textbookRefs![0]!;
    await expect(refs.first()).toContainText('教科書');
    await expect(refs.first()).toContainText(`p.${r.page}`);
    await expect(refs.first()).toContainText(r.title);
    // 版が違うとページがずれるので、「第○版の場合」と添える
    await expect(refs.first()).toContainText(/第\d+版の場合|初版の場合/);
    if (q.explanation?.status === 'published') await expect(page.getByTestId('explanation')).toBeVisible();
    else await expect(page.getByText('解説準備中')).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await context.close();
  }
});

test('解説のない問題：「解説準備中」と出て、そのまま解き進められる', async ({ page }) => {
  test.skip(pendingExam === undefined, 'すべての回に解説がある');
  await enterAsGuest(page);
  // 回を、解説のない回だけにする
  await page.getByRole('checkbox', { name: `第${latest}回` }).uncheck();
  await page.getByRole('checkbox', { name: `第${pendingExam}回` }).check();
  await page.getByRole('button', { name: 'この条件で始める' }).click();
  await expect(page).toHaveURL(/#\/quiz$/);

  for (let i = 1; i <= 2; i++) {
    await expect(page.getByTestId('quiz-count')).toHaveText(`${i}/10`);
    await page.getByRole('list', { name: '選択肢' }).getByRole('button').first().click();
    await expect(page.getByTestId('verdict')).toBeVisible();
    await expect(page.getByText('解説準備中')).toBeVisible();
    await expect(page.getByTestId('explanation')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByTestId('next').click();
  }
});
