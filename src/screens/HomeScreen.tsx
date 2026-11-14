import { useEffect, useState } from 'react';
import { Footer, Skeleton } from '../components/common';
import { Icon } from '../components/Icon';
import { declineImport, importGuestRecords, useAuth } from '../lib/auth';
import { loadExams } from '../lib/data';
import { getAllDays, getAllProgress, getSession, jstDate, type QuizSession } from '../lib/db';
import { fieldById } from '../lib/fields';
import { startQuiz, todayPlan, weakPlan, WEAK_MIN_ANSWERED, type TodayPlan, type WeakPlan } from '../lib/quickstart';
import { navigate } from '../lib/router';
import { pct, summarize, type Summary } from '../lib/stats';

/** 1日の目安（ホームの「今日やること」のメーター） */
const DAILY_GOAL = 10;

interface HomeData {
  session: QuizSession | null;
  summary: Summary;
  today: TodayPlan;
  weak: WeakPlan | null;
}

export function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // ログイン中は、Firestore から記録を取り込むたびに読み直す
  const auth = useAuth();
  const { dataVersion } = auth;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, progress, days, exams] = await Promise.all([getSession(), getAllProgress(), getAllDays(), loadExams().catch(() => [])]);
      if (!alive) return;
      const summary = summarize(progress.values(), days, jstDate(Date.now()));
      const examNos = [...exams].map((e) => e.examNo).sort((a, b) => b - a);
      const total = exams.reduce((n, e) => n + e.questionCount, 0);
      setData({ session: s ?? null, summary, today: todayPlan(progress, examNos, total), weak: weakPlan(summary.byField, examNos) });
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  async function run(key: string, fn: () => Promise<'started' | 'empty'>) {
    setBusy(key);
    setMessage(null);
    try {
      if ((await fn()) === 'empty') setMessage('条件に合う問題がありませんでした。「解く」から条件を選んでください。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const session = data?.session;
  const summary = data?.summary;

  return (
    <div className="screen home">
      <header className="home-head">
        <h1 className="screen-title">ホーム</h1>
        <p className="small muted">{new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}</p>
      </header>

      {auth.status === 'signedIn' && auth.importCount > 0 && (
        // ゲストの記録をログイン後に引き継ぐか確認する（SPEC §6.2）
        <section className="card" aria-labelledby="import-title">
          <h2 id="import-title" className="card-title">
            ログイン前の記録を引き継ぎますか？
          </h2>
          <p className="small">
            この端末に、ログインせずに解いた記録が {auth.importCount} 問分あります。引き継ぐと、アカウントの記録に足してクラウドに保存します。
          </p>
          <div className="stack">
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing}
              onClick={() => {
                setImporting(true);
                void importGuestRecords().finally(() => setImporting(false));
              }}
            >
              {importing ? '引き継ぎ中…' : '引き継ぐ'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={importing} onClick={declineImport}>
              引き継がない
            </button>
          </div>
        </section>
      )}

      {!data ? (
        <Skeleton lines={5} label="記録を読み込んでいます…" />
      ) : (
        <>
          {session && (
            <button type="button" className="hero resume" onClick={() => navigate('/quiz')}>
              <span className="hero-icon">
                <Icon name="play" filled />
              </span>
              <span className="hero-body">
                <span className="hero-kicker">続きから</span>
                <span className="hero-main">
                  {Math.min(session.index + 1, session.questionIds.length)} / {session.questionIds.length} 問目から再開
                </span>
              </span>
              <Icon name="forward" className="hero-arrow" />
            </button>
          )}

          <section className="card today" aria-labelledby="today-title">
            <div className="card-head">
              <h2 id="today-title" className="card-title">
                <Icon name="calendar" size={20} />
                今日やること
              </h2>
              <span className="today-count">
                今日 <strong data-testid="today-count">{data.summary.today}問</strong>
              </span>
            </div>
            <div
              className="goal"
              role="meter"
              aria-label={`今日の解答数（目安 ${DAILY_GOAL}問）`}
              aria-valuemin={0}
              aria-valuemax={DAILY_GOAL}
              aria-valuenow={Math.min(data.summary.today, DAILY_GOAL)}
            >
              <span className="goal-fill" style={{ width: `${Math.min(100, (data.summary.today / DAILY_GOAL) * 100)}%` }} />
            </div>
            <p className="small muted goal-note">
              {data.summary.today >= DAILY_GOAL ? '今日の目安（10問）を達成しました。' : `目安は1日${DAILY_GOAL}問。${data.today.detail}`}
            </p>
            <button
              type="button"
              className={`btn ${session ? 'btn-secondary' : 'btn-primary'} btn-icon`}
              disabled={busy !== null}
              onClick={() => void run('today', () => startQuiz(data.today.opt))}
            >
              <Icon name={data.today.kind === 'wrong' ? 'redo' : 'play'} size={20} />
              {busy === 'today' ? '準備中…' : data.today.label}
            </button>
          </section>

          <section className="card weak" aria-labelledby="weak-title">
            <div className="card-head">
              <h2 id="weak-title" className="card-title">
                <Icon name="target" size={20} />
                弱点
              </h2>
            </div>
            {data.weak ? (
              <>
                <p className="weak-field">
                  <span className="weak-name">{fieldById(data.weak.fieldId).name}</span>
                  <span className="weak-rate">
                    正答率 <strong>{pct(data.weak.correct, data.weak.answered)}</strong>
                    <span className="muted small">（{data.weak.answered}問）</span>
                  </span>
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  disabled={busy !== null}
                  onClick={() => void run('weak', () => startQuiz(data.weak!.opt))}
                >
                  <Icon name="target" size={20} />
                  {busy === 'weak' ? '準備中…' : 'この分野を10問（正答率の低い順）'}
                </button>
              </>
            ) : (
              <p className="small muted">
                分野ごとに{WEAK_MIN_ANSWERED}問以上解くと、いちばん正答率の低い分野がここに出ます。
              </p>
            )}
          </section>

          {message && (
            <p className="card warn" role="status">
              {message}
            </p>
          )}

          <button type="button" className="row-link" onClick={() => navigate('/setup')}>
            <Icon name="list" size={20} />
            <span>回・分野・出題数を選んで解く</span>
            <Icon name="forward" size={18} className="row-link-arrow" />
          </button>

          <section className="card" aria-labelledby="home-summary">
            <div className="card-head">
              <h2 id="home-summary" className="card-title">
                <Icon name="chart" size={20} />
                これまでの成績
              </h2>
              <button type="button" className="link-btn" onClick={() => navigate('/stats')}>
                記録を見る
              </button>
            </div>
            <dl className="stat-row">
              <div>
                <dt>累計</dt>
                <dd data-testid="total-count">{summary!.answered}問</dd>
              </div>
              <div>
                <dt>正答率</dt>
                <dd>{pct(summary!.correct, summary!.answered)}</dd>
              </div>
              <div>
                <dt>解いた分野</dt>
                <dd>
                  {summary!.byField.filter((f) => f.answered > 0).length}
                  <span className="small muted">/8</span>
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
      <Footer />
    </div>
  );
}
