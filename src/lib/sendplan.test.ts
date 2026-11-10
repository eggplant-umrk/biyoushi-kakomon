import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAllLocal,
  getInflight,
  getOutbox,
  outboxSize,
  recordAnswer,
  setInflight,
  setLocalDb,
  settleInflight,
  type Outbox,
} from './db';
import { chunkTotals, MAX_ANSWERS_PER_SEND, takeChunk } from './sendplan';

const prog = (attempts: number, correct: number, rev = 1) => ({ attempts, correct, rev });

describe('takeChunk（1回の送信で送る分）', () => {
  it('全部で55問以内なら全部送る', () => {
    const out: Outbox = {
      progress: { '54-01': prog(3, 2), '54-02': prog(1, 0) },
      days: { '2026-11-10': { answered: 4, correct: 2, sessions: [] } },
    };
    const c = takeChunk(out);
    expect(c).toEqual(out);
    expect(chunkTotals(c)).toEqual({ answered: 4, correct: 2 });
  });

  it('解答数の合計が55を超える分は次の送信に回す（問題は途中で分けない）', () => {
    const progress: Outbox['progress'] = {};
    for (let i = 1; i <= 30; i++) progress[`54-${String(i).padStart(2, '0')}`] = prog(2, 1);
    const c = takeChunk({ progress, days: {} });
    expect(chunkTotals(c).answered).toBe(54); // 2問ずつ27問まで。28問目は入らない
    expect(Object.keys(c.progress)).toHaveLength(27);
    expect(Object.values(c.progress).every((p) => p.attempts === 2)).toBe(true);
  });

  it('1問だけで55を超える場合は、送信の先頭で55まで分けて送る', () => {
    const c = takeChunk({ progress: { '54-01': prog(70, 60) }, days: {} });
    expect(c.progress['54-01']).toEqual({ attempts: 55, correct: 55, rev: 1 });
    // 先頭でなければ分けずに次へ回す
    const c2 = takeChunk({ progress: { '54-02': prog(1, 1), '54-01': prog(70, 60) }, days: {} });
    expect(Object.keys(c2.progress)).toEqual(['54-02']);
  });

  it('チェックだけ変えた問題（解答数 0）は上限に関係なく送る', () => {
    const c = takeChunk({ progress: { '54-01': prog(55, 0), '54-02': prog(0, 0, 3) }, days: {} });
    expect(c.progress['54-02']).toEqual({ attempts: 0, correct: 0, rev: 3 });
    expect(chunkTotals(c).answered).toBe(MAX_ANSWERS_PER_SEND);
  });

  it('correct は送る解答数を超えない', () => {
    const c = takeChunk({ progress: {}, days: { '2026-11-10': { answered: 80, correct: 70, sessions: [] } } });
    expect(c.days['2026-11-10']).toMatchObject({ answered: 55, correct: 55 });
  });
});

describe('送信中の分（inflight）', () => {
  afterEach(async () => {
    await clearAllLocal('user');
    setLocalDb('guest');
  });

  it('届いた分だけ outbox から引き、送りきれなかった分と送信中に増えた分は残す', async () => {
    setLocalDb('user');
    const now = Date.UTC(2026, 10, 10, 0, 0, 0);
    for (let i = 0; i < 60; i++) await recordAnswer('54-01', i % 2 === 0, now);
    const sent = takeChunk(await getOutbox());
    expect(sent.progress['54-01']).toMatchObject({ attempts: 55 });
    await setInflight({ uid: 'u1', seq: 1, sent, attempted: true });
    // 送信中にもう1問解いた
    await recordAnswer('54-02', true, now);
    await settleInflight();
    expect(await getInflight()).toBeUndefined();
    const out = await getOutbox();
    expect(out.progress['54-01']).toMatchObject({ attempts: 5 });
    expect(out.progress['54-02']).toMatchObject({ attempts: 1, correct: 1 });
    expect(out.days['2026-11-10']).toMatchObject({ answered: 6 });
  });

  it('同じ送信を2回確定しても二重に引かない', async () => {
    setLocalDb('user');
    const now = Date.UTC(2026, 10, 10, 0, 0, 0);
    await recordAnswer('54-01', true, now);
    await setInflight({ uid: 'u1', seq: 1, sent: takeChunk(await getOutbox()), attempted: true });
    await recordAnswer('54-01', true, now);
    await settleInflight();
    await settleInflight(); // 2回目は何もしない
    const out = await getOutbox();
    expect(out.progress['54-01']).toMatchObject({ attempts: 1, correct: 1 });
    expect(outboxSize(out)).toBe(2);
  });
});
