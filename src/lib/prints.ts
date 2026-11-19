import type { Explanation, FieldId, Question, Statement } from './types';

/**
 * 類題プリント（学校で配られた、過去問に似た問題のプリント）。「読む」で問題と解説を読むだけで、
 * 解答の記録・要復習マーク・メモの対象にはしない（問題IDが過去問の形ではないため。SPEC §14 #69）。
 */
export interface PrintQuestion {
  /** 例: law-1-03（プリントID-問題番号） */
  id: string;
  no: number;
  stem: string;
  polarity: Question['polarity'];
  statements: Statement[] | null;
  choices: string[];
  /** 1〜4。正解になる選択肢がない問題は 0（scoringExcluded） */
  answer: number;
  altAnswers?: number[];
  scoringExcluded?: boolean;
  /** 同じ内容の記述がある過去問（読むで開ける） */
  related: string[];
  /** プリントと法令が食い違う点など、問題の下に出す注意 */
  caution: string | null;
  explanation: Explanation;
}

export interface PrintFile {
  id: string;
  title: string;
  fieldId: FieldId;
  note: string;
  questions: PrintQuestion[];
}

/** 「読む」の一覧に出すプリント（問題の本文は、開いたときに読み込む） */
export const PRINTS: readonly { id: string; title: string; count: number }[] = [
  { id: 'law-1', title: '関係法規・制度及び運営管理 類題プリント', count: 20 },
];

/** 「law-1-03」→ プリントID「law-1」 */
export function printIdOf(questionId: string): string {
  return questionId.replace(/-\d+$/, '');
}

/** 解説の部品（Explanation）にそのまま渡せる形にする */
export function asQuestion(file: PrintFile, q: PrintQuestion): Question {
  return {
    id: q.id,
    examNo: 0,
    no: q.no,
    fieldId: file.fieldId,
    stem: q.stem,
    polarity: q.polarity,
    statements: q.statements,
    choices: q.choices,
    answer: q.answer,
    altAnswers: q.altAnswers,
    scoringExcluded: q.scoringExcluded,
    images: [],
    explanation: q.explanation,
    caution: q.caution,
    ocrChecked: true,
  };
}

/** データの決まりを調べる（単体テストで使う）。問題があれば説明の一覧を返す */
export function checkPrint(file: PrintFile, knownQids: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  const meta = PRINTS.find((p) => p.id === file.id);
  if (!meta) errors.push(`${file.id}: PRINTS にない`);
  else if (meta.count !== file.questions.length) errors.push(`${file.id}: 問題数が PRINTS と違う`);
  file.questions.forEach((q, i) => {
    const at = q.id;
    if (q.id !== `${file.id}-${String(i + 1).padStart(2, '0')}` || q.no !== i + 1) errors.push(`${at}: ID・番号が順番どおりでない`);
    if (q.choices.length !== 4) errors.push(`${at}: 選択肢が4つでない`);
    if (q.scoringExcluded ? q.answer !== 0 : !(q.answer >= 1 && q.answer <= 4)) errors.push(`${at}: answer が不正`);
    if ((q.scoringExcluded || q.altAnswers?.length) && !q.caution) errors.push(`${at}: 答えが1つに決まらないのに caution がない`);
    const ex = q.explanation;
    if (ex.perChoice.length !== 4) errors.push(`${at}: perChoice が4つでない`);
    if ((q.statements?.length ?? 0) !== (ex.perStatement?.length ?? 0)) errors.push(`${at}: perStatement の数が記述と違う`);
    if (ex.status !== 'published' || !ex.summary) errors.push(`${at}: 解説が公開の状態でない`);
    for (const s of ex.sources) if (!s.url.startsWith('https://')) errors.push(`${at}: 出典の URL が https でない`);
    for (const r of q.related) if (!knownQids.has(r)) errors.push(`${at}: 関連する過去問 ${r} がない`);
  });
  return errors;
}
