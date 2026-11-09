import { describe, expect, it } from 'vitest';
import { applyAnswer, clearAllLocal, emptyProgress, getAllDays, getAllProgress, jstDate, recordAnswer } from './db';

describe('jstDate', () => {
  it('日本時間の日付になる', () => {
    expect(jstDate(Date.UTC(2026, 10, 9, 15, 0, 0))).toBe('2026-11-10');
    expect(jstDate(Date.UTC(2026, 10, 9, 14, 59, 59))).toBe('2026-11-09');
  });
});

describe('applyAnswer', () => {
  it('history は直近10回だけ残す', () => {
    let p = emptyProgress('54-01');
    for (let i = 0; i < 12; i++) p = applyAnswer(p, i % 2 === 0, i);
    expect(p.history).toHaveLength(10);
    expect(p.attempts).toBe(12);
    expect(p.correctCount).toBe(6);
    expect(p.lastCorrect).toBe(false);
  });
});

describe('recordAnswer（IndexedDB）', () => {
  it('問題ごと・日ごとに記録し、削除できる', async () => {
    const now = Date.UTC(2026, 10, 10, 0, 0, 0);
    await recordAnswer('54-01', true, now);
    await recordAnswer('54-01', false, now);
    await recordAnswer('54-02', true, now);
    const p = await getAllProgress();
    expect(p.get('54-01')).toMatchObject({ attempts: 2, correctCount: 1, history: '○×' });
    expect(await getAllDays()).toEqual([{ date: '2026-11-10', answered: 3, correct: 2 }]);
    await clearAllLocal();
    expect((await getAllProgress()).size).toBe(0);
  });
});
