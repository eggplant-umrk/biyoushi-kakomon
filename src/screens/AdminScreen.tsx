import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, Skeleton } from '../components/common';
import {
  clearAdminCache,
  dailySeries,
  fieldRates,
  lastActiveLabel,
  loadAdminProgress,
  loadAdminUsers,
  recentAnswered,
  RECENT_DAYS,
  SERIES_DAYS,
  WEAK_QUIZ_MAX,
  WEAK_SHOWN,
  weakQuestions,
  type AdminUserData,
} from '../lib/admin';
import { useAuth } from '../lib/auth';
import { loadQuestionsByIds } from '../lib/data';
import { saveSession, type ProgressRec } from '../lib/db';
import { fieldById } from '../lib/fields';
import { plainText } from '../lib/markup';
import { navigate, useRouteParam } from '../lib/router';
import { pct } from '../lib/stats';
import type { Question } from '../lib/types';

/**
 * 管理画面（SPEC §7）。利用者の一覧と、利用者ごとの詳細。
 *
 * このタブは、管理者だけが読める admin/ping を読めた人にだけ表示している（SPEC §6.5）。
 * 表示の出し分けは見た目だけで、データを守っているのはセキュリティルール（SPEC §8.1）：
 * 管理者以外がこの画面のコードを動かしても、他人の記録の読み込みは拒否される。
 * ここでは読むだけで、利用者の記録には何も書き込まない（利用者の画面にも何も表示しない）。
 */
export function AdminScreen() {
  const selected = useRouteParam('u');
  const [users, setUsers] = useState<AdminUserData[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(false);
    loadAdminUsers()
      .then((r) => {
        if (!alive) return;
        setUsers(r.users);
        setFetchedAt(r.fetchedAt);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const refresh = useCallback(() => {
    clearAdminCache();
    setUsers(null);
    setReloadKey((k) => k + 1);
  }, []);

  if (error) {
    return (
      <div className="screen">
        <h1 className="screen-title">管理</h1>
        <ErrorBox>
          <p>利用者の記録を読み込めませんでした。通信の状態を確認して、もう一度お試しください。</p>
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            もう一度読み込む
          </button>
        </ErrorBox>
      </div>
    );
  }
  if (!users) {
    return (
      <div className="screen">
        <h1 className="screen-title">管理</h1>
        <Skeleton lines={6} />
      </div>
    );
  }

  const user = selected ? users.find((u) => u.uid === selected) : undefined;
  if (selected && user) return <UserDetail key={user.uid} user={user} reloadKey={reloadKey} />;
  return <UserList users={users} fetchedAt={fetchedAt} notFound={!!selected} onRefresh={refresh} />;
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function UserList({
  users,
  fetchedAt,
  notFound,
  onRefresh,
}: {
  users: AdminUserData[];
  fetchedAt: number;
  notFound: boolean;
  onRefresh: () => void;
}) {
  const { uid: myUid } = useAuth();
  const now = Date.now();
  const others = users.filter((u) => u.uid !== myUid).length;

  return (
    <div className="screen">
      <h1 className="screen-title">管理</h1>
      {notFound && (
        <p className="card muted" role="status">
          その利用者は見つかりませんでした（アカウントが削除された可能性があります）。
        </p>
      )}

      <div className="admin-head">
        <h2 className="card-title" data-testid="admin-user-count">
          利用者 {users.length}人
        </h2>
        <button type="button" className="link-btn" onClick={onRefresh}>
          最新の状態に更新
        </button>
      </div>
      <p className="small muted">{hhmm(fetchedAt)} 時点の記録です。新しい順（最終学習日）に並べています。</p>

      {users.length === 0 ? (
        <p className="card muted">まだ利用者がいません。だれかがGoogleでログインすると、ここに表示されます。</p>
      ) : (
        <ul className="admin-users">
          {users.map((u) => (
            <li key={u.uid}>
              <button
                type="button"
                className="card card-action admin-user"
                onClick={() => navigate('/admin', { query: { u: u.uid } })}
              >
                <span className="admin-user-name">
                  {u.displayName}
                  {u.uid === myUid && <span className="badge">自分</span>}
                </span>
                <span className="admin-user-stats">
                  <span>
                    <span className="admin-label">最終学習日</span>
                    {lastActiveLabel(u.answered > 0 ? u.lastActiveAt : 0, now)}
                  </span>
                  <span>
                    <span className="admin-label">直近{RECENT_DAYS}日</span>
                    {recentAnswered(u.days, now)}問
                  </span>
                  <span>
                    <span className="admin-label">累計</span>
                    {u.answered}問・正答率 {pct(u.correct, u.answered)}
                  </span>
                </span>
                <span className="card-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {users.length > 0 && others === 0 && (
        <p className="small muted">
          いまログインしたことがあるのは自分だけです。ほかの人がGoogleでログインして問題を解くと、ここに表示されます。
        </p>
      )}
    </div>
  );
}

function qidLabel(id: string): string {
  return `第${id.split('-')[0]}回 問${Number(id.split('-')[1])}`;
}

function UserDetail({ user, reloadKey }: { user: AdminUserData; reloadKey: number }) {
  const [weak, setWeak] = useState<ProgressRec[] | null>(null);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const now = Date.now();

  useEffect(() => {
    let alive = true;
    setError(false);
    void (async () => {
      try {
        const list = weakQuestions(await loadAdminProgress(user.uid), WEAK_QUIZ_MAX);
        const qs = await loadQuestionsByIds(list.map((p) => p.id));
        if (!alive) return;
        setQuestions(new Map(qs.map((q) => [q.id, q])));
        setWeak(list);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user.uid, reloadKey]);

  const series = dailySeries(user.days, now);
  const seriesTotal = series.reduce((s, d) => s + d.answered, 0);
  const seriesMax = Math.max(1, ...series.map((d) => d.answered));
  const fields = fieldRates(user.byField);
  // 問題データにない問題（データ更新で消えたもの）は出題できないので除く
  const quizIds = (weak ?? []).map((p) => p.id).filter((id) => questions.has(id));

  async function startStudy() {
    if (quizIds.length === 0) return;
    setStarting(true);
    // 勉強会用の出題。解答は管理者の記録にも、利用者の記録にも残さない
    await saveSession({
      id: crypto.randomUUID(),
      mode: 'study',
      questionIds: quizIds,
      answers: quizIds.map(() => null),
      index: 0,
      startedAt: Date.now(),
    });
    navigate('/quiz');
  }

  return (
    <div className="screen">
      <button type="button" className="link-btn admin-back" onClick={() => navigate('/admin')}>
        ← 利用者の一覧へ
      </button>
      <h1 className="screen-title" data-testid="admin-detail-name">
        {user.displayName}
      </h1>

      <section className="card" aria-labelledby="admin-summary">
        <h2 id="admin-summary" className="card-title">
          成績
        </h2>
        <dl className="stat-row">
          <div>
            <dt>累計</dt>
            <dd data-testid="admin-total">{user.answered}問</dd>
          </div>
          <div>
            <dt>正答率</dt>
            <dd>{pct(user.correct, user.answered)}</dd>
          </div>
          <div>
            <dt>直近{RECENT_DAYS}日</dt>
            <dd>{recentAnswered(user.days, now)}問</dd>
          </div>
        </dl>
        <p className="small muted">最終学習日：{lastActiveLabel(user.answered > 0 ? user.lastActiveAt : 0, now)}</p>
      </section>

      <section className="card" aria-labelledby="admin-fields">
        <h2 id="admin-fields" className="card-title">
          分野別の正答率（弱い順）
        </h2>
        <ul className="field-list" data-testid="admin-fields">
          {fields.map((f) => {
            const rate = f.answered ? f.correct / f.answered : 0;
            return (
              <li key={f.fieldId}>
                <span className="field-name">{fieldById(f.fieldId).short}</span>
                <span className="meter" aria-hidden="true">
                  <span className="meter-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
                </span>
                <span className="field-rate">
                  {pct(f.correct, f.answered)}
                  <span className="muted small"> ({f.answered})</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card" aria-labelledby="admin-days">
        <h2 id="admin-days" className="card-title">
          直近{SERIES_DAYS}日の学習量
        </h2>
        <p className="small muted" data-testid="admin-series-total">
          合計 {seriesTotal}問
        </p>
        <ol className="day-chart" aria-label={`直近${SERIES_DAYS}日の日別の解答数`}>
          {series.map((d) => (
            <li key={d.date} aria-label={`${Number(d.date.slice(5, 7))}月${Number(d.date.slice(8, 10))}日 ${d.answered}問`}>
              <span className="day-count" aria-hidden="true">
                {d.answered > 0 ? d.answered : ''}
              </span>
              <span className="day-bar" aria-hidden="true">
                <span className="day-bar-fill" style={{ height: `${Math.round((d.answered / seriesMax) * 100)}%` }} />
              </span>
              <span className="day-label" aria-hidden="true">
                {Number(d.date.slice(8, 10))}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="admin-weak">
        <h2 id="admin-weak" className="card-title">
          苦手問題
        </h2>
        <p className="small muted">直近の解答が不正解だった問題です。正答率の低い順に並べています。</p>
        {error ? (
          <p className="small error-text" role="alert">
            問題ごとの記録を読み込めませんでした。「利用者の一覧へ」戻って「最新の状態に更新」を押してください。
          </p>
        ) : weak === null ? (
          <Skeleton lines={4} />
        ) : weak.length === 0 ? (
          <p className="muted" data-testid="admin-weak-empty">
            まだありません（直近の解答が不正解の問題が、ここに出ます）。
          </p>
        ) : (
          <>
            <ol className="weak-list" data-testid="admin-weak-list">
              {weak.slice(0, WEAK_SHOWN).map((p) => {
                const q = questions.get(p.id);
                return (
                  <li key={p.id}>
                    <span className="weak-head">
                      <span className="wrong-id">
                        {qidLabel(p.id)}
                        {q && <span className="muted small"> {fieldById(q.fieldId).short}</span>}
                      </span>
                      <span className="weak-rate">
                        {p.correctCount}/{p.attempts}回 正解
                        <span className="history" aria-label={`正誤の履歴 ${p.history}`}>
                          {p.history}
                        </span>
                      </span>
                    </span>
                    {q && <span className="wrong-stem">{plainText(q.stem)}</span>}
                  </li>
                );
              })}
            </ol>
            {weak.length > WEAK_SHOWN && (
              <p className="small muted">ほかに {weak.length - WEAK_SHOWN}問あります（出題には含まれます）。</p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={starting || quizIds.length === 0}
              onClick={() => void startStudy()}
            >
              この人の苦手問題で出題（{quizIds.length}問）
            </button>
            <p className="small muted">
              あなたの端末で出題します。解答はあなたの記録にも、この人の記録にも残りません。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
