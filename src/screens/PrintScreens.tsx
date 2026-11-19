import { useEffect, useState } from 'react';
import { ErrorBox, Skeleton } from '../components/common';
import { Explanation } from '../components/Explanation';
import { Icon } from '../components/Icon';
import { RichText } from '../lib/markup';
import { asQuestion, PRINTS, printIdOf, type PrintFile } from '../lib/prints';
import { navigate } from '../lib/router';

const CHOICE_LABELS = ['(1)', '(2)', '(3)', '(4)'];

const cache = new Map<string, Promise<PrintFile>>();

/** プリントの本文を読み込む（同じプリントは1回だけ） */
function loadPrint(id: string): Promise<PrintFile> {
  if (!PRINTS.some((p) => p.id === id)) return Promise.reject(new Error('このプリントは見つかりませんでした。'));
  let p = cache.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/prints/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`プリントを読み込めませんでした（${r.status}）`);
      return r.json() as Promise<PrintFile>;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** 「第54回 問1」 */
function pastLabel(qid: string): string {
  const [exam, no] = qid.split('-');
  return `第${exam}回 問${Number(no)}`;
}

function usePrint(id: string): { file: PrintFile | null; error: string | null } {
  const [file, setFile] = useState<PrintFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadPrint(id)
      .then((f) => alive && setFile(f))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);
  return { file, error };
}

function Failed({ message }: { message: string }) {
  return (
    <div className="screen">
      <ErrorBox>
        {message}
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/read')}>
          「読む」へ戻る
        </button>
      </ErrorBox>
    </div>
  );
}

/** 類題プリントの問題の一覧（#/read?print=law-1） */
export function PrintList({ printId }: { printId: string }) {
  const { file, error } = usePrint(printId);
  if (error) return <Failed message={error} />;
  if (!file) {
    return (
      <div className="screen">
        <Skeleton lines={6} label="プリントを読み込んでいます…" />
      </div>
    );
  }
  return (
    <div className="screen read">
      <button type="button" className="link-btn admin-back" onClick={() => navigate('/read')}>
        ← 「読む」へ戻る
      </button>
      <h1 className="screen-title">{file.title}</h1>
      <p className="small muted">{file.note}</p>
      <ul className="print-list" data-testid="print-list">
        {file.questions.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              className="read-item"
              data-testid="print-item"
              onClick={() => navigate('/read', { query: { pq: q.id } })}
            >
              <span className="read-meta">
                <strong>問題{q.no}</strong>
                <span className="read-badges">{q.caution && <span className="mini warn">要確認</span>}</span>
              </span>
              <span className="read-stem">{q.stem.split('\n')[0]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 類題プリントの1問（#/read?pq=law-1-03）。解くボタン・要復習マーク・メモはない（記録の対象外） */
export function PrintDetail({ questionId }: { questionId: string }) {
  const printId = printIdOf(questionId);
  const { file, error } = usePrint(printId);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [questionId]);

  if (error) return <Failed message={error} />;
  if (!file) {
    return (
      <div className="screen">
        <Skeleton lines={8} label="問題を読み込んでいます…" />
      </div>
    );
  }
  const idx = file.questions.findIndex((x) => x.id === questionId);
  const pq = file.questions[idx];
  if (!pq) return <Failed message="この問題は見つかりませんでした。" />;
  const q = asQuestion(file, pq);
  const answers = [q.answer, ...(q.altAnswers ?? [])];
  const prev = file.questions[idx - 1]?.id;
  const next = file.questions[idx + 1]?.id;
  const go = (id: string | undefined) => id && navigate('/read', { query: { pq: id } });
  const back = () => navigate('/read', { query: { print: printId } });

  return (
    <div className="screen read-detail has-bottom-bar">
      <header className="quiz-header">
        <div className="quiz-topbar">
          <button type="button" className="icon-btn star back-to-list" onClick={back} aria-label="プリントの一覧へ戻る">
            <Icon name="list" />
            <span className="star-label">一覧</span>
          </button>
          <span className="read-detail-title" data-testid="print-detail-title">
            類題プリント 問題{pq.no}
          </span>
          <span className="spacer" />
        </div>
        <div className="quiz-meta">
          <span>{file.title}</span>
          <span className="history">
            {idx + 1}/{file.questions.length}
          </span>
        </div>
      </header>

      <section className="question" aria-label="問題文">
        <p className="stem">
          <RichText text={q.stem} />
        </p>
        {q.statements && (
          <ol className="statements">
            {q.statements.map((s) => (
              <li key={s.label}>
                <span className="st-label">{s.label}</span>
                <span>
                  <RichText text={s.text} traps={q.explanation?.traps ?? []} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {q.caution && (
          <p className="caution" role="note" data-testid="print-caution">
            <span aria-hidden="true">⚠ </span>
            {q.caution}
          </p>
        )}
      </section>

      <ul className="choices read-choices" aria-label="選択肢">
        {q.choices.map((c, i) => {
          const isAnswer = !q.scoringExcluded && answers.includes(i + 1);
          return (
            <li key={i} className={`choice ${isAnswer ? 'is-correct' : 'is-dim'}`}>
              <span className="choice-no">{CHOICE_LABELS[i]}</span>
              <span className="choice-text">
                <RichText text={c} traps={q.explanation?.traps ?? []} />
              </span>
              {isAnswer && <span className="choice-mark">○ 正答</span>}
            </li>
          );
        })}
      </ul>
      {q.scoringExcluded && <p className="verdict">いまの法令では、正答になる選択肢がない</p>}

      <section className="answer-block">
        <Explanation q={q} />
        {pq.related.length > 0 && (
          <div className="card print-related" data-testid="print-related">
            <h2 className="card-title">同じ内容が出た過去問</h2>
            <ul>
              {pq.related.map((id) => (
                <li key={id}>
                  <button type="button" className="link-btn" onClick={() => navigate('/read', { query: { q: id } })}>
                    {pastLabel(id)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="bottom-bar with-tabs read-bar">
        <div className="read-nav">
          <button type="button" className="icon-btn nav-btn" disabled={!prev} onClick={() => go(prev)} aria-label="前の問題">
            <Icon name="back" size={20} />
            <span className="star-label">前</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={back}>
            プリントの一覧
          </button>
          <button type="button" className="icon-btn nav-btn" disabled={!next} onClick={() => go(next)} aria-label="次の問題">
            <Icon name="forward" size={20} />
            <span className="star-label">次</span>
          </button>
        </div>
      </div>
    </div>
  );
}
