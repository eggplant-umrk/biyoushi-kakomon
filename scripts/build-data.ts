/**
 * data-src/exam-{回}.txt（読み取り結果）と data-src/check-{回}.txt（二重チェック）から、
 * public/data/exam-{回}.json・public/data/exams.json・docs/ocr-review.md を作る（SPEC §5 / §6.1）。
 *
 * - id・fieldId・polarity は自動で付ける（手入力のミスを減らすため）
 * - 二重チェックと正答・選択肢の数が食い違う問題、!ocr を付けた問題は ocrChecked: false にする
 *
 * 書式は data-src/README.md を参照。
 * 使い方: node scripts/build-data.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOfNo } from '../src/lib/fields.ts';
import type { ExamMeta, Question, Statement } from '../src/lib/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'data-src');
const outDir = join(root, 'public', 'data');

interface Parsed {
  examNo: number;
  year: string;
  month: number;
  questions: (Question & { page: number; ocrReasons: string[] })[];
}

class ParseError extends Error {}

/** 問題文から polarity を決める（SPEC §5） */
export function derivePolarity(stem: string, hasStatements: boolean, hasImages: boolean): Question['polarity'] {
  // 組合せ問題（a〜d・語句の組合せ）、空欄補充、図の問題は、選択肢を○×にばらせないので other
  if (hasStatements || hasImages || stem.includes('［') || stem.includes('組合せ')) return 'other';
  if (/誤っているもの|該当しないもの|誤りのもの|適切でないもの|正しくないもの/.test(stem)) return 'incorrect';
  if (/\[\[u:[^\]]*(ない|誤)[^\]]*\]\]/.test(stem)) return 'incorrect';
  if (/正しいもの|適切なもの/.test(stem)) return 'correct';
  return 'other';
}

export function parseExam(text: string, file: string): Parsed {
  const lines = text.split(/\r?\n/);
  let examNo = 0;
  let year = '';
  let month = 0;
  const questions: Parsed['questions'] = [];
  let cur: {
    no: number;
    page: number;
    answer: number;
    alt: number[];
    excluded: boolean;
    stem: string[];
    statements: Statement[];
    choices: string[];
    images: string[];
    ocr: string[];
    polarity: Question['polarity'] | null;
    caution: string | null;
  } | null = null;

  const flush = () => {
    if (!cur) return;
    const stem = cur.stem.join('\n').trim();
    if (!stem) throw new ParseError(`${file}: 問${cur.no} の問題文がありません`);
    questions.push({
      id: `${examNo}-${String(cur.no).padStart(2, '0')}`,
      examNo,
      no: cur.no,
      fieldId: fieldOfNo(cur.no).id,
      stem,
      polarity: cur.excluded ? 'other' : (cur.polarity ?? derivePolarity(stem, cur.statements.length > 0, cur.images.length > 0)),
      statements: cur.statements.length ? cur.statements : null,
      choices: cur.choices,
      answer: cur.answer,
      ...(cur.alt.length ? { altAnswers: cur.alt } : {}),
      ...(cur.excluded ? { scoringExcluded: true } : {}),
      images: cur.images,
      explanation: null,
      caution: cur.caution,
      ocrChecked: false, // 二重チェックの照合後に決める
      page: cur.page,
      ocrReasons: cur.ocr,
    });
    cur = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const where = `${file}:${i + 1}`;
    if (!line || line.startsWith('#')) return;
    let m: RegExpExecArray | null;
    if ((m = /^@exam\s+(\d+)\s+(\S+)\s+(\d+)$/.exec(line))) {
      examNo = Number(m[1]);
      year = m[2] ?? '';
      month = Number(m[3]);
      return;
    }
    if ((m = /^==\s*(\d+)\s+p(\d+)\s+ans=(\d)((?:,\d)*)$/.exec(line))) {
      flush();
      cur = {
        no: Number(m[1]),
        page: Number(m[2]),
        answer: Number(m[3]),
        alt: (m[4] ?? '').split(',').filter(Boolean).map(Number),
        excluded: false,
        stem: [],
        statements: [],
        choices: [],
        images: [],
        ocr: [],
        polarity: null,
        caution: null,
      };
      return;
    }
    if (!cur) throw new ParseError(`${where}: 問題の外に書かれた行です: ${line}`);
    if ((m = /^!img\s+(\S+)$/.exec(line))) {
      cur.images.push(`images/${m[1]}`);
      return;
    }
    if ((m = /^!ocr\s+(.+)$/.exec(line))) {
      cur.ocr.push(m[1] ?? '');
      return;
    }
    if (line === '!excluded') {
      cur.excluded = true;
      return;
    }
    if ((m = /^!polarity\s+(correct|incorrect|other)$/.exec(line))) {
      cur.polarity = m[1] as Question['polarity'];
      return;
    }
    if ((m = /^!caution\s+(.+)$/.exec(line))) {
      cur.caution = m[1] ?? null;
      return;
    }
    if (line.startsWith('!')) throw new ParseError(`${where}: 不明な指示です: ${line}`);
    if ((m = /^\(([1-4])\)\s+(.+)$/.exec(line))) {
      const n = Number(m[1]);
      if (n !== cur.choices.length + 1) throw new ParseError(`${where}: 選択肢の番号が順番どおりではありません`);
      cur.choices.push(m[2] ?? '');
      return;
    }
    if ((m = /^([a-e])\s+(.+)$/.exec(line)) && cur.choices.length === 0) {
      cur.statements.push({ label: m[1] ?? '', text: m[2] ?? '' });
      return;
    }
    if (cur.choices.length > 0 || cur.statements.length > 0) {
      throw new ParseError(`${where}: 選択肢・記述の後に問題文の行があります: ${line}`);
    }
    cur.stem.push(line);
  });
  flush();
  if (!examNo) throw new ParseError(`${file}: @exam 行がありません`);
  return { examNo, year, month, questions };
}

interface CheckRow {
  no: number;
  answer: number;
  count: number;
  note: string;
}

export function parseCheck(text: string): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('@')) continue;
    const m = /^(\d+)\s+(\d|\?)\s+(\d)(?:\s+(.*))?$/.exec(line);
    if (!m) throw new ParseError(`check の書式エラー: ${line}`);
    rows.push({ no: Number(m[1]), answer: m[2] === '?' ? -1 : Number(m[2]), count: Number(m[3]), note: m[4] ?? '' });
  }
  return rows;
}

function main() {
  const files = readdirSync(srcDir)
    .filter((f) => /^exam-\d+\.txt$/.test(f))
    .sort();
  const metas: ExamMeta[] = [];
  const review: { examNo: number; no: number; reason: string; page: number }[] = [];
  const reviewQuestions = new Map<string, Question>();
  let figures = 0;

  for (const f of files) {
    const parsed = parseExam(readFileSync(join(srcDir, f), 'utf8'), f);
    const checkPath = join(srcDir, `check-${parsed.examNo}.txt`);
    const check = existsSync(checkPath) ? parseCheck(readFileSync(checkPath, 'utf8')) : [];
    const checkByNo = new Map(check.map((c) => [c.no, c]));

    for (const q of parsed.questions) {
      const reasons = [...q.ocrReasons];
      const c = checkByNo.get(q.no);
      if (!c) reasons.push('二重チェックの記録がない');
      else {
        if (c.answer === -1) reasons.push(`二重チェックで〇印を読み取れなかった${c.note ? `（${c.note}）` : ''}`);
        else if (c.answer !== q.answer)
          reasons.push(`正答の読み取りが食い違う（1回目: ${q.answer}、二重チェック: ${c.answer}）`);
        if (c.count !== q.choices.length)
          reasons.push(`選択肢の数が食い違う（1回目: ${q.choices.length}、二重チェック: ${c.count}）`);
      }
      for (const img of q.images) {
        if (!existsSync(join(root, 'public', img))) reasons.push(`図のファイルがない: ${img}`);
      }
      if (q.images.length) figures += 1;
      q.ocrChecked = reasons.length === 0;
      for (const reason of reasons) review.push({ examNo: q.examNo, no: q.no, reason, page: q.page });
      if (reasons.length) reviewQuestions.set(`${q.examNo}-${q.no}`, q);
    }
    for (const c of check) {
      if (!parsed.questions.some((q) => q.no === c.no)) {
        review.push({ examNo: parsed.examNo, no: c.no, reason: '二重チェックにはあるが、1回目の読み取りにない問題番号', page: 0 });
      }
    }

    const questions: Question[] = parsed.questions.map(({ page: _p, ocrReasons: _r, ...q }) => q);
    writeFileSync(
      join(outDir, `exam-${parsed.examNo}.json`),
      JSON.stringify({ examNo: parsed.examNo, questions }, null, 2) + '\n',
    );
    metas.push({ examNo: parsed.examNo, year: parsed.year, month: parsed.month, questionCount: questions.length });
    console.log(`第${parsed.examNo}回: ${questions.length}問（ocrChecked: false ${questions.filter((q) => !q.ocrChecked).length}問）`);
  }

  metas.sort((a, b) => b.examNo - a.examNo);
  writeFileSync(join(outDir, 'exams.json'), JSON.stringify(metas, null, 2) + '\n');

  // docs/ocr-review.md
  review.sort((a, b) => b.examNo - a.examNo || a.no - b.no);
  const pad = (n: number) => String(n).padStart(3, '0');
  const md = [
    '# OCR確認待ちの一覧',
    '',
    '`scripts/build-data.ts` が自動で作るファイルです（手で編集しないでください）。',
    '',
    '`ocrChecked: false` の問題の一覧です。原本（公式PDF）と見比べて、問題がなければ `data-src/exam-{回}.txt` の該当問題から',
    '`!ocr` の行を消し、`node scripts/build-data.ts` を実行してください。ページ画像は `python scripts/pdf-to-png.py` で作れます（`raw/` はコミットしません）。',
    '',
    `件数: ${new Set(review.map((r) => `${r.examNo}-${r.no}`)).size}問`,
    '',
    '| 回 | 問題 | 理由 | ページ画像 |',
    '|---|---|---|---|',
    ...review.map(
      (r) =>
        `| 第${r.examNo}回 | 問${r.no} | ${r.reason.replace(/\|/g, '｜')} | ${r.page ? `raw/pages/${r.examNo}-${pad(r.page)}.png` : '—'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(join(root, 'docs', 'ocr-review.md'), md);
  writeFileSync(join(root, 'docs', 'ocr-review.html'), reviewHtml(review, reviewQuestions));
  console.log(`図を使った問題: ${figures}問 / OCR確認待ち: ${review.length}件`);
}

/**
 * docs/ocr-review.html：OCR確認待ちの問題について、元のページ画像（raw/pages）と、
 * 切り出し・〇印消去後の図（public/images）を横に並べる確認用ページ。
 * ローカルでファイルを直接開いて使う（raw/ はコミットしないので、公開先では画像が出ない）。
 */
function reviewHtml(
  review: { examNo: number; no: number; reason: string; page: number }[],
  questions: Map<string, Question>,
): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad = (n: number) => String(n).padStart(3, '0');
  const keys = [...new Set(review.map((r) => `${r.examNo}-${r.no}`))];
  const sections = keys.map((key) => {
    const rows = review.filter((r) => `${r.examNo}-${r.no}` === key);
    const first = rows[0]!;
    const q = questions.get(key);
    const pageSrc = first.page ? `../raw/pages/${first.examNo}-${pad(first.page)}.png` : '';
    const answers = q ? [q.answer, ...(q.altAnswers ?? [])] : [];
    const text = q
      ? `<p class="stem">${esc(q.stem)}</p><ol>${q.choices
          .map((c, i) => `<li${answers.includes(i + 1) ? ' class="ans"' : ''}>${esc(c)}${answers.includes(i + 1) ? '　← 正答として登録' : ''}</li>`)
          .join('')}</ol>`
      : '<p>（1回目の読み取りにない問題）</p>';
    const figs = q?.images.length
      ? q.images.map((img) => `<a href="../public/${esc(img)}"><img src="../public/${esc(img)}" alt="処理後の図 ${esc(img)}"></a><p class="path">public/${esc(img)}</p>`).join('')
      : '<p class="none">図はありません（登録した問題文と正答を、左の原本と見比べてください）</p>';
    return `<section id="q${key}">
  <h2>第${first.examNo}回 問${first.no}</h2>
  <ul class="reasons">${rows.map((r) => `<li>${esc(r.reason)}</li>`).join('')}</ul>
  <div class="pair">
    <div><h3>元のページ画像</h3>${pageSrc ? `<a href="${pageSrc}"><img src="${pageSrc}" alt="元のページ画像"></a><p class="path">${pageSrc.slice(3)}</p>` : '<p class="none">ページ不明</p>'}</div>
    <div><h3>切り出し・〇印消去後</h3>${figs}<h3>登録した内容</h3>${text}</div>
  </div>
</section>`;
  });
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>OCR確認（ローカル用）</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1400px; line-height: 1.6; color: #222; background: #fafafa; }
  nav a { display: inline-block; margin: 0 8px 4px 0; }
  section { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  h2 { margin: 0 0 4px; font-size: 20px; }
  h3 { margin: 8px 0 4px; font-size: 14px; color: #555; }
  .reasons { margin: 0 0 8px; padding-left: 20px; color: #a03030; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .pair img { max-width: 100%; border: 1px solid #ccc; background: #fff; }
  .path, .none { font-size: 12px; color: #777; margin: 2px 0 8px; }
  .ans { font-weight: bold; color: #0a6b2d; }
  @media (max-width: 800px) { .pair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>OCR確認待ち（${keys.length}問）</h1>
<p>scripts/build-data.ts が自動で作るファイルです。このファイルをブラウザで直接開いてください（左の画像は raw/pages が必要です。なければ python scripts/pdf-to-png.py で作れます）。
問題がなければ data-src/exam-{回}.txt の該当問題から !ocr の行を消し、node scripts/build-data.ts を実行します。画像はクリックで原寸表示。</p>
<nav>${keys.map((k) => `<a href="#q${k}">${k.replace('-', '回 問')}</a>`).join('')}</nav>
${sections.join('\n')}
</body>
</html>
`;
}

main();
