import { describe, expect, test } from 'vitest';
import type { ProgressRec } from './db';
import { todayPlan, weakPlan } from './quickstart';

const rec = (id: string, o: Partial<ProgressRec> = {}): ProgressRec => ({
  id,
  attempts: 1,
  correctCount: 1,
  history: '○',
  lastAnsweredAt: 0,
  checked: false,
  lastCorrect: true,
  ...o,
});
const map = (recs: ProgressRec[]) => new Map(recs.map((r) => [r.id, r]));

describe('今日やること', () => {
  test('前回間違えた問題があれば、その解き直し（20問まで）', () => {
    const p = todayPlan(map([rec('54-01', { lastCorrect: false }), rec('54-02')]), [54, 53], 110);
    expect(p.kind).toBe('wrong');
    expect(p.opt).toMatchObject({ exams: [54, 53], filter: 'wrong', count: 'all' });
    expect(p.label).toContain('1問');
    const many = map(Array.from({ length: 25 }, (_, i) => rec(`54-${String(i + 1).padStart(2, '0')}`, { lastCorrect: false })));
    expect(todayPlan(many, [54], 55).opt.count).toBe(20);
  });
  test('間違えた問題がなく、未解答があれば、未解答から10問', () => {
    const p = todayPlan(map([rec('54-01')]), [54], 55);
    expect(p.kind).toBe('unanswered');
    expect(p.opt).toMatchObject({ filter: 'unanswered', count: 10, order: 'random' });
    expect(p.detail).toContain('1問');
  });
  test('記録がなければ、未解答から10問', () => {
    expect(todayPlan(new Map(), [54], 55).kind).toBe('unanswered');
  });
  test('全部解いていれば、ランダムに10問', () => {
    const all = map(Array.from({ length: 3 }, (_, i) => rec(`54-0${i + 1}`)));
    expect(todayPlan(all, [54], 3).kind).toBe('random');
  });
});

describe('弱点', () => {
  test('解答数が5以上の分野のうち、正答率がいちばん低い分野', () => {
    const w = weakPlan(
      [
        { fieldId: 'law', answered: 10, correct: 8 },
        { fieldId: 'skin', answered: 6, correct: 2 },
        { fieldId: 'anatomy', answered: 2, correct: 0 }, // 解答数が少ないので対象外
      ],
      [54],
    );
    expect(w?.fieldId).toBe('skin');
    expect(w?.opt).toMatchObject({ fields: ['skin'], filter: 'lowRate', count: 10 });
  });
  test('対象の分野がなければ null', () => {
    expect(weakPlan([{ fieldId: 'law', answered: 4, correct: 0 }], [54])).toBeNull();
  });
});
