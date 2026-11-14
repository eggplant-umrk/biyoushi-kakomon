import { expect, test } from 'vitest';
import type { ProgressRec } from './db';
import { byExam, pct } from './stats';

const rec = (id: string, attempts: number, correctCount: number): ProgressRec => ({
  id,
  attempts,
  correctCount,
  history: '',
  lastAnsweredAt: 0,
  checked: false,
  lastCorrect: null,
});

test('回別の成績：新しい回から。解いていない回も0で並ぶ。チェックだけの記録は数えない', () => {
  const r = byExam([rec('54-01', 2, 1), rec('54-02', 1, 1), rec('53-10', 1, 0), rec('52-01', 0, 0), rec('40-01', 1, 1)], [52, 53, 54]);
  expect(r).toEqual([
    { examNo: 54, seen: 2, answered: 3, correct: 2 },
    { examNo: 53, seen: 1, answered: 1, correct: 0 },
    { examNo: 52, seen: 0, answered: 0, correct: 0 },
  ]);
});

test('正答率の表示', () => {
  expect(pct(2, 3)).toBe('67%');
  expect(pct(0, 0)).toBe('—');
});
