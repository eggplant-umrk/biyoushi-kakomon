import { describe, expect, it } from 'vitest';
import { emptyProgress, type ProgressRec } from './db';
import { fieldOfNo } from './fields';
import { selectQuestions, type SetupOptions } from './select';
import type { Question } from './types';

function q(examNo: number, no: number): Question {
  return {
    id: `${examNo}-${String(no).padStart(2, '0')}`,
    examNo,
    no,
    fieldId: fieldOfNo(no).id,
    stem: '',
    polarity: 'other',
    statements: null,
    choices: ['1', '2', '3', '4'],
    answer: 1,
    images: [],
    explanation: null,
    caution: null,
    ocrChecked: true,
  };
}

const all = [q(54, 1), q(54, 2), q(54, 11), q(53, 1), q(53, 41)];
const base: SetupOptions = {
  exams: [53, 54],
  fields: ['law', 'public_health', 'theory'],
  count: 'all',
  order: 'number',
  filter: 'all',
};
const prog = (p: Partial<ProgressRec> & { id: string }): [string, ProgressRec] => [p.id, { ...emptyProgress(p.id), ...p }];

describe('selectQuestions', () => {
  it('回・分野で絞り、番号順に並べる', () => {
    const r = selectQuestions(all, new Map(), { ...base, exams: [54], fields: ['law'] });
    expect(r.map((x) => x.id)).toEqual(['54-01', '54-02']);
  });
  it('出題数で切る', () => {
    expect(selectQuestions(all, new Map(), { ...base, count: 10 })).toHaveLength(5);
  });
  it('未解答だけ／前回間違えた／チェック', () => {
    const m = new Map([
      prog({ id: '54-01', attempts: 1, correctCount: 1, lastCorrect: true }),
      prog({ id: '54-02', attempts: 2, correctCount: 1, lastCorrect: false, checked: true }),
    ]);
    expect(selectQuestions(all, m, { ...base, filter: 'unanswered' }).map((x) => x.id)).toEqual([
      '53-01',
      '53-41',
      '54-11',
    ]);
    expect(selectQuestions(all, m, { ...base, filter: 'wrong' }).map((x) => x.id)).toEqual(['54-02']);
    expect(selectQuestions(all, m, { ...base, filter: 'checked' }).map((x) => x.id)).toEqual(['54-02']);
  });
  it('正答率が低い順。未解答は後ろ', () => {
    const m = new Map([
      prog({ id: '54-01', attempts: 2, correctCount: 2 }),
      prog({ id: '54-02', attempts: 2, correctCount: 0 }),
      prog({ id: '54-11', attempts: 2, correctCount: 1 }),
    ]);
    const r = selectQuestions(all, m, { ...base, filter: 'lowRate' }).map((x) => x.id);
    expect(r).toEqual(['54-02', '54-11', '54-01', '53-01', '53-41']);
  });
  it('ランダムでも同じ問題がそろう', () => {
    const r = selectQuestions(all, new Map(), { ...base, order: 'random' });
    expect(r.map((x) => x.id).sort()).toEqual(all.map((x) => x.id).sort());
  });
});
