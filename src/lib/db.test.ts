import { afterEach, describe, expect, it } from 'vitest';
import {
  addSessionRecord,
  applyAnswer,
  clearAllLocal,
  emptyProgress,
  getAllDays,
  getAllProgress,
  getOutbox,
  guestProgressCount,
  importGuestIntoUser,
  jstDate,
  outboxSize,
  recordAnswer,
  setChecked,
  setLocalDb,
  settleOutbox,
} from './db';

afterEach(async () => {
  await clearAllLocal('guest');
  await clearAllLocal('user');
  setLocalDb('guest');
});

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

describe('ログイン中の未送信分（outbox）', () => {
  const now = Date.UTC(2026, 10, 10, 0, 0, 0);

  it('ゲストのときは outbox に入れない', async () => {
    await recordAnswer('54-01', true, now);
    expect(outboxSize(await getOutbox())).toBe(0);
  });

  it('解答・チェック・セットの結果を「増えた分」で貯める', async () => {
    setLocalDb('user');
    await recordAnswer('54-01', true, now);
    await recordAnswer('54-01', false, now);
    await setChecked('54-02', true);
    await addSessionRecord({ mode: 'practice', total: 2, correct: 1, endedAt: now });
    const out = await getOutbox();
    expect(out.progress['54-01']).toMatchObject({ attempts: 2, correct: 1 });
    expect(out.progress['54-02']).toMatchObject({ attempts: 0, correct: 0 });
    expect(out.days['2026-11-10']).toMatchObject({ answered: 2, correct: 1 });
    expect(out.days['2026-11-10']?.sessions).toHaveLength(1);
    // ゲストの記録には混ざらない
    expect(await guestProgressCount()).toBe(0);
  });

  it('送信できた分だけ引き、送信中に増えた分は残す', async () => {
    setLocalDb('user');
    await recordAnswer('54-01', true, now);
    await recordAnswer('54-02', true, now);
    const sent = await getOutbox();
    // 送信中に 54-01 をもう1回解いた
    await recordAnswer('54-01', false, now);
    await settleOutbox(sent);
    const out = await getOutbox();
    expect(out.progress['54-02']).toBeUndefined();
    expect(out.progress['54-01']).toMatchObject({ attempts: 1, correct: 0 });
    expect(out.days['2026-11-10']).toMatchObject({ answered: 1, correct: 0 });
    // 残りも送れたら空になる
    await settleOutbox(await getOutbox());
    expect(outboxSize(await getOutbox())).toBe(0);
  });

  it('セットの結果は1日50件まで', async () => {
    setLocalDb('user');
    for (let i = 0; i < 52; i++) await addSessionRecord({ mode: 'practice', total: 1, correct: 1, endedAt: now + i });
    expect((await getOutbox()).days['2026-11-10']?.sessions).toHaveLength(50);
  });
});

describe('ゲストの記録の引き継ぎ', () => {
  it('アカウントの記録に足し込み、ゲストの記録は消す。日別は今日・前日の分だけ', async () => {
    const now = Date.UTC(2026, 10, 10, 3, 0, 0); // 日本時間 11/10 12:00
    const old = now - 5 * 86_400_000;
    // ゲストの記録：5日前に 54-01 を間違え、今日 54-02 を正解。54-03 にチェック
    await recordAnswer('54-01', false, old);
    await recordAnswer('54-02', true, now);
    await setChecked('54-03', true);
    // アカウント側には 54-01 を1回正解した記録がある（もっと前）
    setLocalDb('user');
    await recordAnswer('54-01', true, old - 86_400_000);
    await settleOutbox(await getOutbox());

    expect(await importGuestIntoUser(now)).toBe(3);

    const p = await getAllProgress();
    expect(p.get('54-01')).toMatchObject({ attempts: 2, correctCount: 1, history: '○×', lastCorrect: false });
    expect(p.get('54-02')).toMatchObject({ attempts: 1, correctCount: 1, history: '○' });
    expect(p.get('54-03')).toMatchObject({ attempts: 0, checked: true });
    const out = await getOutbox();
    expect(out.progress['54-01']).toMatchObject({ attempts: 1, correct: 0 });
    expect(out.progress['54-02']).toMatchObject({ attempts: 1, correct: 1 });
    expect(out.progress['54-03']).toMatchObject({ attempts: 0, correct: 0 });
    // 日別：今日の分だけ引き継ぐ（5日前の分はルールで書けない）
    expect(Object.keys(out.days)).toEqual(['2026-11-10']);
    expect((await getAllDays()).find((d) => d.date === '2026-11-10')).toMatchObject({ answered: 1, correct: 1 });
    expect(await guestProgressCount()).toBe(0);
  });
});
