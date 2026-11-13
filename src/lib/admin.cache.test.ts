import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firestore を読む関数（cloud.ts）を差し替えて、呼ばれた回数を数える
const adminLoadUsers = vi.fn();
const adminLoadProgress = vi.fn();
vi.mock('./cloud', () => ({ adminLoadUsers, adminLoadProgress }));

const { clearAdminCache, loadAdminProgress, loadAdminUsers } = await import('./admin');

const user = (uid: string, lastActiveAt: number) => ({
  uid,
  displayName: uid,
  lastActiveAt,
  answered: 0,
  correct: 0,
  byField: {},
  days: [],
});

describe('管理画面の読み取りのキャッシュ', () => {
  beforeEach(() => {
    clearAdminCache();
    adminLoadUsers.mockReset().mockResolvedValue([user('a', 1), user('b', 2)]);
    adminLoadProgress.mockReset().mockResolvedValue([]);
  });

  it('一覧は1回だけ読み、画面を行き来しても読み直さない', async () => {
    const first = await loadAdminUsers();
    const second = await loadAdminUsers();
    await loadAdminUsers();
    expect(adminLoadUsers).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.users.map((u) => u.uid)).toEqual(['b', 'a']); // 最終学習日の新しい順
  });

  it('同時に開いても1回しか読まない', async () => {
    await Promise.all([loadAdminUsers(), loadAdminUsers(), loadAdminProgress('a'), loadAdminProgress('a')]);
    expect(adminLoadUsers).toHaveBeenCalledTimes(1);
    expect(adminLoadProgress).toHaveBeenCalledTimes(1);
  });

  it('問題ごとの記録は、利用者ごとに1回だけ読む', async () => {
    await loadAdminProgress('a');
    await loadAdminProgress('a');
    await loadAdminProgress('b');
    expect(adminLoadProgress.mock.calls).toEqual([['a'], ['b']]);
  });

  it('「最新の状態に更新」のあとは読み直す', async () => {
    await loadAdminUsers();
    await loadAdminProgress('a');
    clearAdminCache();
    await loadAdminUsers();
    await loadAdminProgress('a');
    expect(adminLoadUsers).toHaveBeenCalledTimes(2);
    expect(adminLoadProgress).toHaveBeenCalledTimes(2);
  });

  it('読み込みに失敗したら、次はやり直す', async () => {
    adminLoadUsers.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(loadAdminUsers()).rejects.toThrow();
    await expect(loadAdminUsers()).resolves.toMatchObject({ users: expect.any(Array) });
    expect(adminLoadUsers).toHaveBeenCalledTimes(2);

    adminLoadProgress.mockRejectedValueOnce(new Error('unavailable'));
    await expect(loadAdminProgress('a')).rejects.toThrow();
    await expect(loadAdminProgress('a')).resolves.toEqual([]);
  });
});
