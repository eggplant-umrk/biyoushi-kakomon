import type { ProgressRec } from './db';
import type { FieldId, Question } from './types';

export type CountOpt = 10 | 20 | 30 | 'all';
export type OrderOpt = 'number' | 'random';
export type FilterOpt = 'all' | 'unanswered' | 'wrong' | 'checked' | 'lowRate';

export interface SetupOptions {
  exams: number[];
  fields: FieldId[];
  count: CountOpt;
  order: OrderOpt;
  filter: FilterOpt;
}

export const FILTER_LABELS: Record<FilterOpt, string> = {
  all: 'すべて',
  unanswered: '未解答だけ',
  wrong: '前回間違えた問題だけ',
  checked: 'チェック（★）した問題だけ',
  lowRate: '正答率が低い順',
};

function byNumber(a: Question, b: Question): number {
  return a.examNo - b.examNo || a.no - b.no;
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

export function rateOf(p: ProgressRec | undefined): number | null {
  return p && p.attempts > 0 ? p.correctCount / p.attempts : null;
}

/** 出題条件から問題を選ぶ（SPEC §3.1） */
export function selectQuestions(
  all: readonly Question[],
  progress: ReadonlyMap<string, ProgressRec>,
  opt: SetupOptions,
  rng: () => number = Math.random,
): Question[] {
  let qs = all.filter((q) => opt.exams.includes(q.examNo) && opt.fields.includes(q.fieldId));

  switch (opt.filter) {
    case 'unanswered':
      qs = qs.filter((q) => !progress.get(q.id)?.attempts);
      break;
    case 'wrong':
      qs = qs.filter((q) => progress.get(q.id)?.lastCorrect === false);
      break;
    case 'checked':
      qs = qs.filter((q) => progress.get(q.id)?.checked === true);
      break;
    case 'lowRate':
    case 'all':
      break;
  }

  if (opt.filter === 'lowRate') {
    // 解いたことのある問題を正答率の低い順に。未解答の問題は後ろに回す
    qs = [...qs].sort((a, b) => {
      const ra = rateOf(progress.get(a.id));
      const rb = rateOf(progress.get(b.id));
      if (ra === null && rb === null) return byNumber(a, b);
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb || byNumber(a, b);
    });
  } else if (opt.order === 'random') {
    qs = shuffle(qs, rng);
  } else {
    qs = [...qs].sort(byNumber);
  }

  return opt.count === 'all' ? qs : qs.slice(0, opt.count);
}
