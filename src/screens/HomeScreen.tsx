import { useEffect, useState } from 'react';
import { Footer, Skeleton } from '../components/common';
import { declineImport, importGuestRecords, useAuth } from '../lib/auth';
import { getAllDays, getAllProgress, getSession, jstDate, type QuizSession } from '../lib/db';
import { fieldById } from '../lib/fields';
import { navigate } from '../lib/router';
import { pct, summarize, type Summary } from '../lib/stats';

export function HomeScreen() {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [importing, setImporting] = useState(false);
  // ログイン中は、Firestore から記録を取り込むたびに読み直す
  const auth = useAuth();
  const { dataVersion } = auth;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [s, progress, days] = await Promise.all([getSession(), getAllProgress(), getAllDays()]);
      if (!alive) return;
      setSession(s ?? null);
      setSummary(summarize(progress.values(), days, jstDate(Date.now())));
    })();
    return () => {
      alive = false;
    };
  }, [dataVersion]);

  return (
    <div className="screen">
      <h1 className="screen-title">ホーム</h1>

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

      {session && (
        <button type="button" className="card card-action resume" onClick={() => navigate('/quiz')}>
          <span className="card-kicker">続きから</span>
          <span className="card-main">
            {Math.min(session.index + 1, session.questionIds.length)} / {session.questionIds.length} 問目から再開
          </span>
          <span className="card-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      <button type="button" className="card card-action" onClick={() => navigate('/setup')}>
        <span className="card-kicker">問題を解く</span>
        <span className="card-main">回・分野・出題数を選んで始める</span>
        <span className="card-arrow" aria-hidden="true">
          ›
        </span>
      </button>

      <section className="card" aria-labelledby="home-summary">
        <h2 id="home-summary" className="card-title">
          成績
        </h2>
        {!summary ? (
          <Skeleton lines={3} />
        ) : (
          <>
            <dl className="stat-row">
              <div>
                <dt>今日</dt>
                <dd data-testid="today-count">{summary.today}問</dd>
              </div>
              <div>
                <dt>累計</dt>
                <dd data-testid="total-count">{summary.answered}問</dd>
              </div>
              <div>
                <dt>正答率</dt>
                <dd>{pct(summary.correct, summary.answered)}</dd>
              </div>
            </dl>
            <h3 className="sub-title">分野別（弱い順）</h3>
            <ul className="field-list">
              {summary.byField.map((f) => {
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
          </>
        )}
      </section>
      <Footer />
    </div>
  );
}
