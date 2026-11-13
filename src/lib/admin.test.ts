import { describe, expect, it } from 'vitest';
import { dailySeries, fieldRates, lastActiveLabel, lastDates, recentAnswered, sortUsers, weakQuestions, type AdminUserData } from './admin';
import type { ProgressRec } from './db';

// 日本時間 2026-11-13 12:00
const NOW = Date.UTC(2026, 10, 13, 3, 0, 0);
const DAY = 86_400_000;

const prog = (id: string, attempts: number, correctCount: number, lastAnsweredAt = 0): ProgressRec => ({
  id,
  attempts,
  correctCount,
  history: '',
  lastAnsweredAt,
  checked: false,
  lastCorrect: null,
});

describe('lastDates / recentAnswered / dailySeries', () => {
  it('今日を含む直近の日付を古い順に並べる（日本時間）', () => {
    expect(lastDates(NOW, 3)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
    // 日本時間の 0 時をまたぐ直前（UTC 14:59）はまだ前日
    expect(lastDates(Date.UTC(2026, 10, 12, 14, 59), 1)).toEqual(['2026-11-12']);
    expect(lastDates(Date.UTC(2026, 10, 12, 15, 0), 1)).toEqual(['2026-11-13']);
  });

  it('直近7日の解答数は、今日を含む7日分だけを足す', () => {
    const days = [
      { date: '2026-11-13', answered: 5, correct: 3 },
      { date: '2026-11-07', answered: 10, correct: 1 }, // 7日目（含む）
      { date: '2026-11-06', answered: 100, correct: 1 }, // 8日前（含まない）
    ];
    expect(recentAnswered(days, NOW)).toBe(15);
    expect(recentAnswered([], NOW)).toBe(0);
  });

  it('14日分の系列は、記録のない日を 0 で埋める', () => {
    const s = dailySeries([{ date: '2026-11-12', answered: 4, correct: 2 }], NOW);
    expect(s).toHaveLength(14);
    expect(s[0]?.date).toBe('2026-10-31');
    expect(s[12]).toEqual({ date: '2026-11-12', answered: 4, correct: 2 });
    expect(s[13]).toEqual({ date: '2026-11-13', answered: 0, correct: 0 });
  });
});

describe('lastActiveLabel', () => {
  it('今日・昨日・n日前で表示する', () => {
    expect(lastActiveLabel(NOW, NOW)).toBe('今日（11/13）');
    expect(lastActiveLabel(NOW - DAY, NOW)).toBe('昨日（11/12）');
    expect(lastActiveLabel(NOW - 3 * DAY, NOW)).toBe('3日前（11/10）');
    expect(lastActiveLabel(0, NOW)).toBe('—');
  });
});

describe('sortUsers', () => {
  it('最終学習日の新しい順に並べる', () => {
    const u = (uid: string, lastActiveAt: number): AdminUserData => ({
      uid,
      displayName: uid,
      lastActiveAt,
      answered: 0,
      correct: 0,
      byField: {},
      days: [],
    });
    expect(sortUsers([u('a', 1), u('b', 3), u('c', 2)]).map((x) => x.uid)).toEqual(['b', 'c', 'a']);
  });
});

describe('fieldRates', () => {
  it('正答率の低い順に並べ、解いていない分野は最後にする', () => {
    const r = fieldRates({ law: { answered: 10, correct: 8 }, skin: { answered: 4, correct: 1 } });
    expect(r).toHaveLength(8);
    expect(r.slice(0, 2).map((f) => f.fieldId)).toEqual(['skin', 'law']);
    expect(r.slice(2).every((f) => f.answered === 0)).toBe(true);
  });
});

describe('weakQuestions', () => {
  it('2回以上解いて間違いのある問題を、正答率の低い順に並べる', () => {
    const list = weakQuestions(
      [
        prog('54-01', 1, 0), // 1回だけ → 対象外
        prog('54-02', 2, 2), // 全問正解 → 対象外
        prog('54-03', 4, 2), // 50%
        prog('54-04', 2, 0), // 0%
        prog('54-05', 5, 0), // 0%・回数が多い → 先
        prog('54-06', 3, 1), // 33%
      ],
      10,
    );
    expect(list.map((p) => p.id)).toEqual(['54-05', '54-04', '54-06', '54-03']);
  });

  it('上限の数で切る', () => {
    const many = Array.from({ length: 30 }, (_, i) => prog(`54-${String(i + 1).padStart(2, '0')}`, 2, 0));
    expect(weakQuestions(many, 20)).toHaveLength(20);
    expect(weakQuestions([], 20)).toEqual([]);
  });
});
