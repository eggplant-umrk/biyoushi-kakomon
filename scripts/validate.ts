/**
 * 問題データの検証（SPEC §6.1 手順5）。エラーがあれば終了コード 1。
 *
 * - 各回55問、問題番号・id の重複なし、`choices` が4つ（空でない）、`answer` が1〜4
 * - `fieldId` と問題番号が一致、`id` が正規表現に合い、回・番号と一致
 * - `polarity`・`statements` の形、下線記法 [[u:…]] の閉じ忘れ、図のファイルの存在
 * - exams.json の一覧と各回のファイルが一致
 *
 * 使い方: node scripts/validate.ts [--expect 41-54]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fieldOfNo, QID_PATTERN } from '../src/lib/fields.ts';
import type { ExamFile, ExamMeta } from '../src/lib/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'data');
const QUESTIONS_PER_EXAM = 55;

const errors: string[] = [];
const err = (m: string) => errors.push(m);

const expectArg = process.argv.indexOf('--expect');
const expectRange = expectArg > 0 ? process.argv[expectArg + 1] : undefined;

const metas = JSON.parse(readFileSync(join(dataDir, 'exams.json'), 'utf8')) as ExamMeta[];
const seenExam = new Set<number>();
let total = 0;

if (expectRange) {
  const [a, b] = expectRange.split('-').map(Number);
  for (let n = a ?? 0; n <= (b ?? a ?? 0); n++) {
    if (!metas.some((m) => m.examNo === n)) err(`exams.json に第${n}回がない`);
  }
}

for (const meta of metas) {
  const n = meta.examNo;
  if (seenExam.has(n)) err(`exams.json: 第${n}回が重複`);
  seenExam.add(n);
  if (!meta.year || !Number.isInteger(meta.month) || meta.month < 1 || meta.month > 12)
    err(`exams.json: 第${n}回の year / month が不正`);
  const path = join(dataDir, `exam-${n}.json`);
  if (!existsSync(path)) {
    err(`exam-${n}.json がない`);
    continue;
  }
  const file = JSON.parse(readFileSync(path, 'utf8')) as ExamFile;
  const p = `exam-${n}.json`;
  if (file.examNo !== n) err(`${p}: examNo が ${file.examNo}`);
  if (file.questions.length !== QUESTIONS_PER_EXAM) err(`${p}: ${file.questions.length}問（55問であるべき）`);
  if (meta.questionCount !== file.questions.length) err(`exams.json: 第${n}回の questionCount が問題数と不一致`);

  const nos = new Set<number>();
  const ids = new Set<string>();
  for (const q of file.questions) {
    const at = `${p} 問${q.no}`;
    total += 1;
    if (nos.has(q.no)) err(`${at}: 問題番号が重複`);
    nos.add(q.no);
    if (ids.has(q.id)) err(`${at}: id が重複`);
    ids.add(q.id);
    if (!QID_PATTERN.test(q.id)) err(`${at}: id が正規表現に合わない: ${q.id}`);
    if (q.id !== `${n}-${String(q.no).padStart(2, '0')}`) err(`${at}: id と回・番号が不一致: ${q.id}`);
    if (q.examNo !== n) err(`${at}: examNo が ${q.examNo}`);
    try {
      if (fieldOfNo(q.no).id !== q.fieldId) err(`${at}: fieldId が番号と不一致 (${q.fieldId})`);
    } catch {
      err(`${at}: 問題番号が範囲外`);
    }
    if (!Array.isArray(q.choices) || q.choices.length !== 4) err(`${at}: choices が4つではない`);
    else if (q.choices.some((c) => typeof c !== 'string' || !c.trim())) err(`${at}: 空の選択肢がある`);
    if (q.scoringExcluded) {
      if (q.answer !== 0) err(`${at}: 採点対象外の問題は answer を 0 にする`);
      if (!q.caution) err(`${at}: 採点対象外の問題には caution（公式の注記）が必要`);
    } else if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > 4) err(`${at}: answer が1〜4ではない (${q.answer})`);
    if (q.altAnswers !== undefined) {
      if (!Array.isArray(q.altAnswers) || q.altAnswers.some((a) => !Number.isInteger(a) || a < 1 || a > 4 || a === q.answer))
        err(`${at}: altAnswers が不正`);
      if (!q.caution) err(`${at}: altAnswers がある問題には caution（公式の注記）が必要`);
    }
    if (!q.stem.trim()) err(`${at}: 問題文が空`);
    if (!['correct', 'incorrect', 'other'].includes(q.polarity)) err(`${at}: polarity が不正`);
    if (q.statements !== null) {
      if (!Array.isArray(q.statements) || q.statements.length < 2) err(`${at}: statements が不正`);
      else if (q.statements.some((s, i) => s.label !== 'abcde'[i] || !s.text.trim())) err(`${at}: statements のラベルが a〜 の順でない`);
    }
    for (const text of [q.stem, ...q.choices, ...(q.statements ?? []).map((s) => s.text)]) {
      const opens = (text.match(/\[\[u:/g) ?? []).length;
      const closes = (text.match(/\[\[u:[^\]]*\]\]/g) ?? []).length;
      if (opens !== closes) err(`${at}: 下線記法 [[u:…]] が閉じていない`);
      if (/<[a-z/]/i.test(text)) err(`${at}: HTML タグのような文字列がある（SPEC §8.4）`);
    }
    for (const img of q.images) {
      if (!/^images\/\d+\/[\w-]+\.webp$/.test(img)) err(`${at}: 図のパスが不正: ${img}`);
      else if (!existsSync(join(root, 'public', img))) err(`${at}: 図のファイルがない: ${img}`);
    }
    if (q.explanation !== null && typeof q.explanation !== 'object') err(`${at}: explanation が不正`);
    if (typeof q.ocrChecked !== 'boolean') err(`${at}: ocrChecked が boolean ではない`);
  }
  for (let i = 1; i <= QUESTIONS_PER_EXAM; i++) if (!nos.has(i)) err(`${p}: 問${i} がない`);
}

if (errors.length) {
  console.error(`検証エラー ${errors.length}件`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`OK: ${metas.length}回・${total}問`);
