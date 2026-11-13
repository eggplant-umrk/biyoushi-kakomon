// 問題データの型（SPEC §5）

export type FieldId =
  | 'law'
  | 'public_health'
  | 'infection'
  | 'hygiene'
  | 'anatomy'
  | 'skin'
  | 'cosmetics'
  | 'theory';

export type SourceType = 'law' | 'gov' | 'academic' | 'edu' | 'site';

export interface Source {
  title: string;
  url: string;
  type: SourceType;
}

export interface Explanation {
  summary: string;
  perChoice: string[];
  /** a〜d の組合せ問題で、記述ごとの解説（statements と同じ数。それ以外の問題は null。§14） */
  perStatement: string[] | null;
  traps: string[];
  keyPoint: string | null;
  sources: Source[];
  crossChecked: number;
  confidence: 'high' | 'medium' | 'low';
  status: 'draft' | 'published';
  asOf: string | null;
  /** 法令・統計・制度の時点についての注記（「出題時は○○、現在は△△」）。解答後に解説の中で表示する（§14） */
  caution: string | null;
}

/** 教科書の参照先（§14）。教科書の本文は持たず、節の見出しとページだけを持つ */
export interface TextbookRef {
  /** 教科書と版（src/lib/textbooks.ts の BOOKS のキー。例: unei-2ed-2024） */
  bookId: string;
  /** 編・章（例: 第2編 第2章） */
  chapter: string;
  /** 節（例: 第3節）。節がなければ空文字 */
  section: string;
  /** 節の見出し */
  title: string;
  page: number;
  /** index＝索引の語から引いたページ／toc＝目次から推定した節の開始ページ */
  via: 'index' | 'toc';
  confidence: 'high' | 'medium' | 'low';
}

export interface Statement {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  examNo: number;
  no: number;
  fieldId: FieldId;
  stem: string;
  polarity: 'correct' | 'incorrect' | 'other';
  statements: Statement[] | null;
  choices: string[];
  answer: number; // 1〜4
  /** 公式に「いずれも正解として採点」とされた、answer 以外の選択肢（通常は省略） */
  altAnswers?: number[];
  /** 公式に「正解となる選択肢がないため採点対象外」とされた問題（このとき answer は 0） */
  scoringExcluded?: boolean;
  images: string[];
  explanation: Explanation | null;
  /** 教科書の参照先（ある問題だけ。通常は省略） */
  textbookRefs?: TextbookRef[];
  caution: string | null;
  ocrChecked: boolean;
}

export interface ExamMeta {
  examNo: number;
  year: string;
  month: number;
  questionCount: number;
}

export interface ExamFile {
  examNo: number;
  questions: Question[];
}
