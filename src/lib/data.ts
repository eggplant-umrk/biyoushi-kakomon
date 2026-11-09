import { fieldOfNo, QID_PATTERN } from './fields';
import type { ExamFile, ExamMeta, Question } from './types';

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} の読み込みに失敗しました（${res.status}）`);
  return (await res.json()) as T;
}

/** 問題1件の形式チェック（SPEC §6.1 の検証項目のうち1問で判定できるもの）。問題なければ空配列 */
export function checkQuestion(q: Question): string[] {
  const errs: string[] = [];
  if (!QID_PATTERN.test(q.id)) errs.push(`id が不正: ${q.id}`);
  const expectedId = `${q.examNo}-${String(q.no).padStart(2, '0')}`;
  if (q.id !== expectedId) errs.push(`id と回・番号が不一致: ${q.id} / ${expectedId}`);
  if (!Array.isArray(q.choices) || q.choices.length !== 4) errs.push(`${q.id}: choices が4つではない`);
  if (!Number.isInteger(q.answer) || q.answer < 1 || q.answer > 4) errs.push(`${q.id}: answer が1〜4ではない`);
  try {
    if (fieldOfNo(q.no).id !== q.fieldId) errs.push(`${q.id}: fieldId が番号と不一致`);
  } catch {
    errs.push(`${q.id}: 番号が範囲外`);
  }
  if (q.explanation && q.explanation.perChoice.length !== 4) errs.push(`${q.id}: perChoice が4つではない`);
  return errs;
}

let examsCache: Promise<ExamMeta[]> | null = null;
const examCache = new Map<number, Promise<Question[]>>();

export function loadExams(): Promise<ExamMeta[]> {
  examsCache ??= getJson<ExamMeta[]>('data/exams.json').catch((e: unknown) => {
    examsCache = null;
    throw e;
  });
  return examsCache;
}

export function loadExam(examNo: number): Promise<Question[]> {
  let p = examCache.get(examNo);
  if (!p) {
    p = getJson<ExamFile>(`data/exam-${examNo}.json`).then((f) => {
      const bad = f.questions.flatMap(checkQuestion);
      if (bad.length > 0) console.warn('問題データの形式エラー', bad);
      return f.questions.filter((q) => checkQuestion(q).length === 0);
    });
    p.catch(() => examCache.delete(examNo));
    examCache.set(examNo, p);
  }
  return p;
}

export async function loadQuestions(examNos: readonly number[]): Promise<Question[]> {
  const lists = await Promise.all(examNos.map(loadExam));
  return lists.flat();
}

/** 問題IDの一覧から問題を取り出す（順番を保つ） */
export async function loadQuestionsByIds(ids: readonly string[]): Promise<Question[]> {
  const examNos = [...new Set(ids.map((id) => Number(id.split('-')[0])))];
  const all = await loadQuestions(examNos);
  const byId = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => q !== undefined);
}
