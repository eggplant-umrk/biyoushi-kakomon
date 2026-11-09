import { useEffect, useState } from 'react';
import { Skeleton } from '../components/common';
import { loadQuestionsByIds } from '../lib/data';
import { getLastResult, saveSession, type QuizResult } from '../lib/db';
import { fieldById } from '../lib/fields';
import { plainText } from '../lib/markup';
import { navigate } from '../lib/router';
import { pct } from '../lib/stats';
import type { Question } from '../lib/types';

export function ResultScreen() {
  const [result, setResult] = useState<QuizResult | null | undefined>(undefined);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());

  useEffect(() => {
    void (async () => {
      const r = (await getLastResult()) ?? null;
      setResult(r);
      if (r) {
        const qs = await loadQuestionsByIds(r.questionIds);
        setQuestions(new Map(qs.map((q) => [q.id, q])));
      }
    })();
  }, []);

  if (result === undefined) {
    return (
      <div className="screen">
        <Skeleton lines={5} />
      </div>
    );
  }
  if (result === null) {
    return (
      <div className="screen">
        <h1 className="screen-title">結果</h1>
        <p className="card muted">まだ結果がありません。</p>
      </div>
    );
  }

  const total = result.questionIds.length;
  const ok = result.correctFlags.filter(Boolean).length;
  const wrongIds = result.questionIds.filter((_, i) => !result.correctFlags[i]);

  async function retryWrong() {
    await saveSession({
      id: crypto.randomUUID(),
      mode: 'practice',
      questionIds: wrongIds,
      answers: wrongIds.map(() => null),
      index: 0,
      startedAt: Date.now(),
    });
    navigate('/quiz');
  }

  return (
    <div className="screen">
      <h1 className="screen-title">結果</h1>
      <section className="card score-card">
        <p className="score" data-testid="score">
          <span className="score-big">{ok}</span> / {total} 問正解
        </p>
        <p className="muted">正答率 {pct(ok, total)}</p>
      </section>

      <section className="card">
        <h2 className="card-title">間違えた問題（{wrongIds.length}問）</h2>
        {wrongIds.length === 0 ? (
          <p className="muted">全問正解です。</p>
        ) : (
          <ul className="wrong-list">
            {wrongIds.map((id) => {
              const q = questions.get(id);
              return (
                <li key={id}>
                  <span className="wrong-id">
                    第{id.split('-')[0]}回 問{Number(id.split('-')[1])}
                    {q && <span className="muted small"> {fieldById(q.fieldId).short}</span>}
                  </span>
                  {q && <span className="wrong-stem">{plainText(q.stem)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="stack">
        {wrongIds.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={() => void retryWrong()}>
            間違えた問題を解き直す
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/setup')}>
          条件を変えて解く
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/home')}>
          ホームへ
        </button>
      </div>
    </div>
  );
}
