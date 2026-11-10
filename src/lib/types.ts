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
  traps: string[];
  keyPoint: string | null;
  sources: Source[];
  crossChecked: number;
  confidence: 'high' | 'medium' | 'low';
  status: 'draft' | 'published';
  asOf: string | null;
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
