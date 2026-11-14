import { useEffect, useState } from 'react';
import { EmptyState, Skeleton } from '../components/common';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';
import { loadExams } from '../lib/data';
import { getAllDays, getAllProgress, jstDate, type DayRec } from '../lib/db';
import { fieldById } from '../lib/fields';
import { navigate } from '../lib/router';
import { byExam, pct, summarize, type ExamStat, type Summary } from '../lib/stats';

/** 正答率の横棒。色だけに頼らず、数値と解答数を文字でも出す */
function RateBar({ label, correct, answered, note }: { label: string; correct: number; answered: number; note?: string }) {
  const rate = answered ? correct / answered : 0;
  const level = !answered ? 'none' : rate >= 0.7 ? 'good' : rate >= 0.5 ? 'mid' : 'low';
  return (
    <li className={`rate-row level-${level}`}>
      <span className="rate-label">{label}</span>
      <span className="rate-track" aria-hidden="true">
        <span className="rate-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
        <span className="rate-pass" />
      </span>
      <span className="rate-value">
        {answered ? pct(correct, answered) : '未解答'}
        {note && <span className="rate-note">{note}</span>}
      </span>
    </li>
  );
}

export function StatsScreen() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exams, setExams] = useState<ExamStat[]>([]);
  const [days, setDays] = useState<DayRec[]>([]);
  // ログイン中は、Firestore から記録を取り込むたびに読み直す
  const { dataVersion } = useAuth();

  useEffect(() => {
    void (async () => {
      const [p, d, metas] = await Promise.all([getAllProgress(), getAllDays(), loadExams().catch(() => [])]);
      setSummary(summarize(p.values(), d, jstDate(Date.now())));
      setExams(byExam(p.values(), metas.map((m) => m.examNo)));
      // 直近14日の軸（解いていない日も0として並べる）
      const byDate = new Map(d.map((r) => [r.date, r]));
      const axis = Array.from({ length: 14 }, (_, i) => jstDate(Date.now() - (13 - i) * 86_400_000));
      setDays(axis.map((date) => byDate.get(date) ?? { date, answered: 0, correct: 0, sessions: [] }));
    })();
  }, [dataVersion]);

  if (!summary) {
    return (
      <div className="screen">
        <h1 className="screen-title">記録</h1>
        <Skeleton lines={8} label="記録を集計しています…" />
      </div>
    );
  }

  const maxDay = Math.max(1, ...days.map((d) => d.answered));
  const anyDay = days.some((d) => d.answered > 0);
  const seenExams = exams.filter((e) => e.seen > 0);
  const unseenExams = exams.filter((e) => e.seen === 0);
  const empty = summary.answered === 0;

  return (
    <div className="screen stats">
      <h1 className="screen-title">記録</h1>

      <dl className="stat-tiles">
        <div>
          <dt>累計</dt>
          <dd>{summary.answered}問</dd>
        </div>
        <div>
          <dt>正答率</dt>
          <dd>{pct(summary.correct, summary.answered)}</dd>
        </div>
        <div>
          <dt>今日</dt>
          <dd>{summary.today}問</dd>
        </div>
      </dl>

      {empty ? (
        <div className="card">
          <EmptyState
            icon="chart"
            title="まだ記録がありません。"
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('/home')}>
                ホームから解き始める
              </button>
            }
          >
            <p>問題を解くと、分野別・回別の正答率と、日ごとの解答数がグラフで出ます。</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <section className="card">
            <h2 className="card-title">分野別の正答率（弱い順）</h2>
            <p className="small muted chart-legend">
              <span className="legend-pass" aria-hidden="true" /> の線が合格の目安（60%）
            </p>
            <ul className="rate-list" data-testid="field-chart">
              {summary.byField.map((f) => (
                <RateBar key={f.fieldId} label={fieldById(f.fieldId).short} correct={f.correct} answered={f.answered} note={f.answered ? `${f.answered}問` : undefined} />
              ))}
            </ul>
          </section>

          <section className="card">
            <h2 className="card-title">回別の正答率</h2>
            <ul className="rate-list" data-testid="exam-chart">
              {seenExams.map((e) => (
                <RateBar key={e.examNo} label={`第${e.examNo}回`} correct={e.correct} answered={e.answered} note={`${e.seen}/55問`} />
              ))}
            </ul>
            {unseenExams.length > 0 && (
              <details className="ex-fold">
                <summary>まだ解いていない回（{unseenExams.length}回）</summary>
                <p className="small muted">{unseenExams.map((e) => `第${e.examNo}回`).join('・')}</p>
              </details>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2 className="card-title">最近の学習（日別）</h2>
        {!anyDay ? (
          <p className="small muted">解いた日ごとの問題数が、ここに棒グラフで出ます。</p>
        ) : (
          <ol
            className="day-columns"
            aria-label="日ごとの解答数（直近14日分）"
            data-testid="day-chart"
          >
            {days.map((d, i) => (
              <li
                key={d.date}
                data-testid={d.answered > 0 ? 'day-col' : undefined}
                aria-label={d.answered > 0 ? `${d.date}：${d.answered}問、正答率 ${pct(d.correct, d.answered)}` : `${d.date}：0問`}
              >
                <span className="day-num">{d.answered || ''}</span>
                <span className="day-col" aria-hidden="true">
                  {d.answered > 0 && (
                    <span className="day-col-fill" style={{ height: `${Math.max(6, (d.answered / maxDay) * 100)}%` }} />
                  )}
                </span>
                {/* 日付は、週の区切り（7日ごと）と今日だけ出す（14本だと文字が詰まるため） */}
                <span className="day-date">{i % 7 === 0 || i === days.length - 1 ? `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!empty && (
        <button type="button" className="row-link" onClick={() => navigate('/setup')}>
          <Icon name="list" size={20} />
          <span>回・分野を選んで解く</span>
          <Icon name="forward" size={18} className="row-link-arrow" />
        </button>
      )}
    </div>
  );
}
