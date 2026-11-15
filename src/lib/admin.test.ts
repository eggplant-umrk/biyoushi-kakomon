import { describe, expect, it } from 'vitest';
import {
  activityAlerts,
  ALERT_ANSWERS_PER_DAY,
  dailySeries,
  fieldRates,
  lastActiveLabel,
  lastDates,
  recentAnswered,
  shortUid,
  sortUsers,
  weakQuestions,
  type AdminUserData,
} from './admin';
import type { ProgressRec } from './db';

// 日本時間 2026-11-13 12:00
const NOW = Date.UTC(2026, 10, 13, 3, 0, 0);
const DAY = 86_400_000;

/** history は古い順の正誤（例: '○×'）。解いた回数・正解数・直近の正誤は history から決める */
const prog = (id: string, history: string, lastAnsweredAt = 0): ProgressRec => ({
  id,
  attempts: history.length,
  correctCount: [...history].filter((c) => c === '○').length,
  history,
  lastAnsweredAt,
  checked: false,
  lastCorrect: history ? history.endsWith('○') : null,
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

const member = (uid: string, lastActiveAt: number, o: Partial<AdminUserData> = {}): AdminUserData => ({
  uid,
  displayName: uid,
  lastActiveAt,
  createdAt: NOW - 30 * DAY,
  syncSeq: 0,
  answered: 0,
  correct: 0,
  byField: {},
  days: [],
  ...o,
});

describe('sortUsers', () => {
  it('最終学習日の新しい順に並べる', () => {
    expect(sortUsers([member('a', 1), member('b', 3), member('c', 2)], NOW).map((x) => x.uid)).toEqual(['b', 'c', 'a']);
  });
  it('更新回数が異常に多い人を先に並べる', () => {
    const odd = member('z', 0, { syncSeq: 5000, answered: 10 });
    expect(sortUsers([member('a', 2), odd, member('b', 3)], NOW).map((x) => x.uid)).toEqual(['z', 'b', 'a']);
  });
});

describe('activityAlerts（更新回数が異常に多い利用者）', () => {
  it('ふつうの使い方では出ない（10問ごとに送信、毎日100問を30日）', () => {
    const days = [{ date: '2026-11-13', answered: 100, correct: 60 }];
    expect(activityAlerts(member('a', NOW, { answered: 3000, syncSeq: 400, days }), NOW)).toEqual([]);
    // 1問ずつ送っても（送信回数＝解答数）出ない
    expect(activityAlerts(member('a', NOW, { answered: 500, syncSeq: 520 }), NOW)).toEqual([]);
    // 作ったばかりの人
    expect(activityAlerts(member('a', NOW, { createdAt: NOW, answered: 0, syncSeq: 0 }), NOW)).toEqual([]);
  });
  it('解答の伴わない送信が多い', () => {
    expect(activityAlerts(member('a', NOW, { answered: 10, syncSeq: 5000 }), NOW)).toEqual(['sends']);
  });
  it('1日の解答数が多すぎる（日別の記録、または作ってからの平均）', () => {
    const days = [{ date: '2026-11-13', answered: ALERT_ANSWERS_PER_DAY + 1, correct: 0 }];
    expect(activityAlerts(member('a', NOW, { answered: 2000, syncSeq: 100, days }), NOW)).toEqual(['answers']);
    expect(activityAlerts(member('a', NOW, { createdAt: NOW - DAY, answered: 50000, syncSeq: 1000 }), NOW)).toEqual(['answers']);
  });
  it('uid の先頭6文字', () => {
    expect(shortUid('abcdefghij')).toBe('abcdef');
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
  it('直近の解答が不正解の問題を、正答率の低い順に並べる', () => {
    const list = weakQuestions(
      [
        prog('54-01', '×'), // 1回だけ解いて不正解 → 対象（0%）
        prog('54-02', '○○'), // 間違えたことがない → 対象外
        prog('54-03', '○○××'), // 50%
        prog('54-04', '××'), // 0%
        prog('54-05', '×××××'), // 0%・回数が多い → 先
        prog('54-06', '○××'), // 33%
        prog('54-07', '××○'), // 間違えたことはあるが、直近は正解 → 対象外
        prog('54-08', '○'), // 1回だけ解いて正解 → 対象外
        prog('54-09', ''), // 解いていない（チェックだけ付けた） → 対象外
      ],
      10,
    );
    expect(list.map((p) => p.id)).toEqual(['54-05', '54-04', '54-01', '54-06', '54-03']);
  });

  it('同じ正答率・回数なら、最近解いた順に並べる', () => {
    expect(weakQuestions([prog('54-01', '×', 100), prog('54-02', '×', 300), prog('54-03', '×', 200)], 10).map((p) => p.id)).toEqual([
      '54-02',
      '54-03',
      '54-01',
    ]);
  });

  it('上限の数で切る', () => {
    const many = Array.from({ length: 30 }, (_, i) => prog(`54-${String(i + 1).padStart(2, '0')}`, '××'));
    expect(weakQuestions(many, 20)).toHaveLength(20);
    expect(weakQuestions([], 20)).toEqual([]);
  });
});
