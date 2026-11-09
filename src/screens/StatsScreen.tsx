import { useEffect, useState } from 'react';
import { Skeleton } from '../components/common';
import { getAllDays, getAllProgress, jstDate, type DayRec } from '../lib/db';
import { fieldById } from '../lib/fields';
import { pct, summarize, type Summary } from '../lib/stats';

export function StatsScreen() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [days, setDays] = useState<DayRec[]>([]);

  useEffect(() => {
    void (async () => {
      const [p, d] = await Promise.all([getAllProgress(), getAllDays()]);
      setSummary(summarize(p.values(), d, jstDate(Date.now())));
      setDays([...d].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14));
    })();
  }, []);

  return (
    <div className="screen">
      <h1 className="screen-title">記録</h1>
      {!summary ? (
        <Skeleton lines={8} />
      ) : (
        <>
          <section className="card">
            <h2 className="card-title">分野別の正答率（弱い順）</h2>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">分野</th>
                  <th scope="col">解答</th>
                  <th scope="col">正答率</th>
                </tr>
              </thead>
              <tbody>
                {summary.byField.map((f) => (
                  <tr key={f.fieldId}>
                    <th scope="row">{fieldById(f.fieldId).name}</th>
                    <td>{f.answered}</td>
                    <td>{pct(f.correct, f.answered)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2 className="card-title">最近の学習（日別）</h2>
            {days.length === 0 ? (
              <p className="muted">まだ記録がありません。</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">日付</th>
                    <th scope="col">解答</th>
                    <th scope="col">正答率</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{d.date}</th>
                      <td>{d.answered}</td>
                      <td>{pct(d.correct, d.answered)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <p className="small muted">回別の成績・学習カレンダーは今後追加します。</p>
        </>
      )}
    </div>
  );
}
