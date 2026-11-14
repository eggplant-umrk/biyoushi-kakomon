/**
 * data-src/exam-{回}.txt（読み取り結果）と data-src/check-{回}.txt（二重チェック）から、
 * public/data/exam-{回}.json・public/data/exams.json・docs/ocr-review.md を作る（SPEC §5 / §6.1）。
 * data-src/explanations/exam-{回}.json（解説）と data-src/textbook-refs.json（教科書の参照）があれば問題に付け、
 * docs/explanation-review.md（解説の確認待ち）を作る（SPEC §6.7）。
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
import { checkExplanation, checkTextbookRefs } from '../src/lib/explanationCheck.ts';
import { fieldOfNo } from '../src/lib/fields.ts';
import type { ExamMeta, Explanation, Question, Statement, TextbookRef } from '../src/lib/types.ts';

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

/** data-src/explanations/exam-{回}.json の1問ぶん。review は確認待ちの一覧（docs/explanation-review.md）にだけ出す */
interface ExplanationSrc extends Explanation {
  no: number;
  review: { reason: string; ask: string } | null;
}

interface ReviewRow {
  examNo: number;
  no: number;
  confidence: string;
  reason: string;
  ask: string;
}

function loadExplanations(examNo: number): Map<number, ExplanationSrc> {
  const path = join(srcDir, 'explanations', `exam-${examNo}.json`);
  if (!existsSync(path)) return new Map();
  const list = JSON.parse(readFileSync(path, 'utf8')) as ExplanationSrc[];
  const byNo = new Map<number, ExplanationSrc>();
  for (const e of list) {
    if (byNo.has(e.no)) throw new ParseError(`explanations/exam-${examNo}.json: 問${e.no} が重複`);
    byNo.set(e.no, e);
  }
  return byNo;
}

/** data-src/textbook-refs.json：{ "54-08": [参照…], "54-07": [] }。空の配列は「調べたが該当なし」（問題データには出さない） */
function loadTextbookRefs(): Map<string, TextbookRef[]> {
  const path = join(srcDir, 'textbook-refs.json');
  if (!existsSync(path)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(path, 'utf8')) as Record<string, TextbookRef[]>));
}

function main() {
  const textbookRefs = loadTextbookRefs();
  const exReview: ReviewRow[] = [];
  const exCount = { total: 0, high: 0, medium: 0, low: 0, draft: 0 };
  const dataErrors: string[] = [];
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

    // 解説と教科書の参照を付ける
    const explanations = loadExplanations(parsed.examNo);
    for (const no of explanations.keys()) {
      if (!parsed.questions.some((q) => q.no === no)) dataErrors.push(`explanations/exam-${parsed.examNo}.json: 問${no} は問題データにない`);
    }
    for (const q of parsed.questions) {
      const src = explanations.get(q.no);
      if (src) {
        const { no: _no, review, ...ex } = src;
        // フィールドの順番をそろえる（差分を読みやすくするため）
        q.explanation = {
          summary: ex.summary,
          perChoice: ex.perChoice,
          perStatement: ex.perStatement ?? null,
          traps: ex.traps,
          keyPoint: ex.keyPoint ?? null,
          sources: ex.sources,
          crossChecked: ex.crossChecked,
          confidence: ex.confidence,
          status: ex.status,
          asOf: ex.asOf ?? null,
          caution: ex.caution ?? null,
        };
        exCount.total += 1;
        exCount[ex.confidence] += 1;
        if (ex.status === 'draft') exCount.draft += 1;
        if (review || ex.confidence === 'low') {
          exReview.push({
            examNo: q.examNo,
            no: q.no,
            confidence: ex.confidence,
            reason: review?.reason ?? '（理由が書かれていない）',
            ask: review?.ask ?? '（確認してほしい点が書かれていない）',
          });
          if (ex.confidence === 'low' && !review) dataErrors.push(`${q.id}: confidence が low なのに review（理由と確認してほしい点）がない`);
        }
      }
      const refs = textbookRefs.get(q.id);
      if (refs && refs.length > 0) q.textbookRefs = refs;
      for (const e of [...checkExplanation(q), ...checkTextbookRefs(q)]) dataErrors.push(`${q.id}: ${e}`);
    }

    const questions: Question[] = parsed.questions.map(({ page: _p, ocrReasons: _r, ...q }) => q);
    writeFileSync(
      join(outDir, `exam-${parsed.examNo}.json`),
      JSON.stringify({ examNo: parsed.examNo, questions }, null, 2) + '\n',
    );
    metas.push({ examNo: parsed.examNo, year: parsed.year, month: parsed.month, questionCount: questions.length });
    console.log(`第${parsed.examNo}回: ${questions.length}問（ocrChecked: false ${questions.filter((q) => !q.ocrChecked).length}問）`);
  }

  if (dataErrors.length) {
    console.error(`解説・教科書の参照のエラー ${dataErrors.length}件`);
    for (const e of dataErrors) console.error(`  - ${e}`);
    process.exit(1);
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
  writeFileSync(join(root, 'docs', 'ocr-review.html'), reviewHtml(review, reviewQuestions, loadFigureMarks()));
  console.log(`図を使った問題: ${figures}問 / OCR確認待ち: ${review.length}件`);

  // docs/explanation-review.md
  exReview.sort((a, b) => b.examNo - a.examNo || a.no - b.no);
  const cell = (v: string) => v.replace(/\|/g, '｜').replace(/\s+/g, ' ');
  const LEVEL: Record<string, string> = { high: '高', medium: '中', low: '低' };
  const exMd = [
    '# 解説の確認待ちの一覧',
    '',
    '`scripts/build-data.ts` が `data-src/explanations/exam-{回}.json` の `review` から自動で作るファイルです（手で編集しないでください）。',
    '',
    '確信度が低い問題、一次情報の出典が見つからなかった問題、正答に疑いがある問題、教科書でしか確かめられない問題の一覧です（SPEC §6.7）。',
    '確認できたら、`data-src/explanations/exam-{回}.json` の該当問題の解説を直し、`confidence` を上げて `review` を `null` にし、`node scripts/build-data.ts` を実行してください。',
    '確信度が「低」の解説には、アプリで「この解説は確認中です」と表示されます。',
    '',
    `解説のある問題: ${exCount.total}問（確信度 高 ${exCount.high}・中 ${exCount.medium}・低 ${exCount.low}）／確認待ち: ${exReview.length}問`,
    '',
    '| 回 | 問題 | 確信度 | 理由 | 確認してほしい点 |',
    '|---|---|---|---|---|',
    ...exReview.map((r) => `| 第${r.examNo}回 | 問${r.no} | ${LEVEL[r.confidence] ?? r.confidence} | ${cell(r.reason)} | ${cell(r.ask)} |`),
    '',
  ].join('\n');
  writeFileSync(join(root, 'docs', 'explanation-review.md'), exMd);
  const refCount = [...textbookRefs.values()].filter((r) => r.length > 0).length;
  console.log(`解説: ${exCount.total}問（高 ${exCount.high}・中 ${exCount.medium}・低 ${exCount.low}・下書き ${exCount.draft}）/ 解説の確認待ち: ${exReview.length}問 / 教科書の参照: ${refCount}問`);
}

/**
 * docs/ocr-review.html：OCR確認待ちの問題について、元のページ画像（raw/pages）と、
 * 切り出し・〇印消去後の図（public/images）を横に並べる確認用ページ。
 * ローカルでファイルを直接開いて使う（raw/ はコミットしないので、公開先では画像が出ない）。
 */
/** data-src/figure-marks.json：図の中の〇印の消し跡の検査結果（python scripts/data/check-figure-marks.py が書く） */
interface FigureMark {
  id: string;
  exam: number;
  no: number;
  image: string;
  status: 'clean' | 'residue' | 'nomark' | 'unknown';
  mode?: 'plain' | 'texture';
  brightDiff?: number;
  darkRatio?: number;
  roughDiff?: number;
  fixed?: boolean;
  before?: { brightDiff?: number; darkRatio?: number; roughDiff?: number };
  reason?: string;
  note?: string;
}

function loadFigureMarks(): FigureMark[] {
  const path = join(srcDir, 'figure-marks.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as FigureMark[]) : [];
}

function reviewHtml(
  review: { examNo: number; no: number; reason: string; page: number }[],
  questions: Map<string, Question>,
  marks: FigureMark[],
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
  // 図の中の〇印の消し跡：PDF の元の図（〇印あり）と、処理前後の図（〇印のあたりを拡大し、明るさ・コントラストを上げたもの）を並べる
  const STATUS: Record<FigureMark['status'], string> = { clean: '跡なし', residue: '跡あり', nomark: 'この図に〇印はない', unknown: '判定できず' };
  const num = (m: { brightDiff?: number; darkRatio?: number; roughDiff?: number } | undefined) =>
    m && m.brightDiff !== undefined
      ? `明るさの差 ${m.brightDiff}／${m.roughDiff !== undefined ? `ざらつきの差 ${m.roughDiff}` : `濃い画素の割合 ${m.darkRatio ?? 0}`}`
      : '—';
  const shot = (id: string, name: string, alt: string) =>
    `<figure><a href="../raw/marks/${esc(id)}-${name}.png"><img src="../raw/marks/${esc(id)}-${name}.png" alt="${esc(alt)}" loading="lazy"></a><figcaption>${esc(alt)}</figcaption></figure>`;
  const markSections = marks.map((m) => {
    const head = `<h3 id="m${esc(m.id)}">第${m.exam}回 問${m.no}（${esc(m.id)}）— <span class="st-${m.status}">${STATUS[m.status]}</span>${m.fixed ? '（今回、処理をやり直した）' : ''}</h3>`;
    if (m.status === 'nomark') return `${head}<p class="none">この図に〇印はありません（同じ問題の別の図にあります）。</p>`;
    const nums = `<p class="path">検査の値：${num(m)}${m.before ? `（やり直す前：${num(m.before)}）` : ''}${m.mode === 'texture' ? '　※〇印が網点の上にある図' : ''}${m.note ? `　${esc(m.note)}` : ''}${m.reason ? `　${esc(m.reason)}` : ''}</p>`;
    return `${head}${nums}<div class="marks">
${shot(m.id, 'original-zoom', 'PDF の元の図（〇印あり）')}
${shot(m.id, 'before-bright', '処理前：明るさを上げた')}
${shot(m.id, 'before-contrast', '処理前：コントラストを上げた')}
${shot(m.id, 'after-bright', '処理後：明るさを上げた')}
${shot(m.id, 'after-contrast', '処理後：コントラストを上げた')}
<figure><a href="../public/${esc(m.image.replace(/^public\//, ''))}"><img class="whole" src="../public/${esc(m.image.replace(/^public\//, ''))}" alt="処理後の図（全体）" loading="lazy"></a><figcaption>処理後の図（全体）</figcaption></figure>
</div>`;
  });
  const markCount = (st: FigureMark['status']) => marks.filter((m) => m.status === st).length;
  const marksHtml = marks.length
    ? `<h2 id="marks">図の中の〇印の消し跡の確認（${marks.length}枚）</h2>
<p>図の中に正答の〇印が描かれていた問題です。〇印を画像処理で消した跡（薄い輪・点線・線の欠け）が残ると、図を見ただけで正答が分かってしまいます。
<code>python scripts/data/check-figure-marks.py</code> が、PDF の〇印の位置と切り出した図を見比べて自動で調べます（<code>--fix</code> で処理をやり直します）。
結果：跡なし ${markCount('clean')}枚／跡あり ${markCount('residue')}枚／〇印のない図 ${markCount('nomark')}枚／判定できず ${markCount('unknown')}枚。
下の画像は、〇印のあたりを拡大したものです（<code>raw/marks/</code>。スクリプトを実行すると作られます）。「処理前」は、最後に <code>--fix</code> を実行する前の図です。
〇印が網点の上にある図（第54回 問50）は、自動では直さず、手作業で直しています。</p>
<nav>${marks.map((m) => `<a href="#m${esc(m.id)}">${esc(m.id)}</a>`).join('')}</nav>
${markSections.join('\n')}`
    : '';
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
  .marks { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
  .marks figure { margin: 0; }
  .marks img { max-height: 260px; max-width: 320px; border: 1px solid #ccc; background: #fff; image-rendering: pixelated; }
  .marks img.whole { image-rendering: auto; }
  .marks figcaption { font-size: 12px; color: #555; }
  .st-clean { color: #0a6b2d; } .st-residue, .st-unknown { color: #a03030; } .st-nomark { color: #777; }
  @media (max-width: 800px) { .pair { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>OCR確認待ち（${keys.length}問）</h1>
<p>scripts/build-data.ts が自動で作るファイルです。このファイルをブラウザで直接開いてください（左の画像は raw/pages が必要です。なければ python scripts/pdf-to-png.py で作れます）。
問題がなければ data-src/exam-{回}.txt の該当問題から !ocr の行を消し、node scripts/build-data.ts を実行します。画像はクリックで原寸表示。</p>
<nav>${keys.map((k) => `<a href="#q${k}">${k.replace('-', '回 問')}</a>`).join('')}</nav>
${sections.join('\n')}
${marksHtml}
</body>
</html>
`;
}

main();
