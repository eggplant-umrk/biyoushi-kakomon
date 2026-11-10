import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { ErrorBox, Lightbox, Skeleton } from '../components/common';
import { Explanation } from '../components/Explanation';
import { isCorrectChoice, loadQuestionsByIds } from '../lib/data';
import {
  clearSession,
  getAllProgress,
  getSession,
  recordAnswer,
  saveLastResult,
  saveSession,
  setChecked,
  type ProgressRec,
  type QuizSession,
} from '../lib/db';
import { noteAnswered, noteSetFinished, requestFlush } from '../lib/auth';
import { fieldById } from '../lib/fields';
import { RichText } from '../lib/markup';
import { navigate } from '../lib/router';
import { vibrate } from '../lib/settings';
import type { Question } from '../lib/types';

const NEXT_LOCK_MS = 300; // 解答直後に「次へ」を無効にする時間（SPEC §4.3）
const CHOICE_LABELS = ['(1)', '(2)', '(3)', '(4)'];

export function QuizScreen() {
  const [session, setSession] = useState<QuizSession | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [progress, setProgress] = useState<Map<string, ProgressRec>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const lockTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const s = await getSession();
        if (!s) {
          navigate('/home', { replace: true });
          return;
        }
        const [qs, p] = await Promise.all([loadQuestionsByIds(s.questionIds), getAllProgress()]);
        if (!alive) return;
        if (qs.length !== s.questionIds.length) {
          // 問題データが更新されて見つからない問題があれば、その問題を除いて続ける
          const ids = new Set(qs.map((q) => q.id));
          const keep = s.questionIds.map((id) => ids.has(id));
          s.questionIds = s.questionIds.filter((_, i) => keep[i]);
          s.answers = s.answers.filter((_, i) => keep[i]);
          s.index = Math.min(s.index, Math.max(0, s.questionIds.length - 1));
          await saveSession(s);
        }
        setProgress(p);
        setQuestions(qs);
        setSession(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
      window.clearTimeout(lockTimer.current);
      requestFlush(); // 途中で出題画面を離れたときも、ログイン中はそこまでの記録を送る
    };
  }, []);

  const q = session && questions ? questions[session.index] : undefined;
  const chosen = session ? (session.answers[session.index] ?? null) : null;
  const answered = chosen !== null;
  const isLast = session ? session.index >= session.questionIds.length - 1 : false;

  const choose = useCallback(
    async (choice: number) => {
      if (!session || !q || answered) return;
      const correct = isCorrectChoice(q, choice);
      const next: QuizSession = {
        ...session,
        answers: session.answers.map((a, i) => (i === session.index ? choice : a)),
      };
      setSession(next);
      setLocked(true);
      window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(() => setLocked(false), NEXT_LOCK_MS);
      if (!q.scoringExcluded) vibrate(correct ? 30 : [40, 60, 40]);
      await saveSession(next);
      // 採点対象外の問題（公式に正解なし）は記録しない
      if (q.scoringExcluded) return;
      const rec = await recordAnswer(q.id, correct);
      setProgress((m) => new Map(m).set(rec.id, rec));
      noteAnswered(); // ログイン中は10問ごとに Firestore へ送る
    },
    [session, q, answered],
  );

  const goNext = useCallback(async () => {
    if (!session || !questions || !answered || locked) return;
    if (!isLast) {
      const next = { ...session, index: session.index + 1 };
      setSession(next);
      window.scrollTo(0, 0);
      await saveSession(next);
      return;
    }
    // 採点対象外の問題は結果に含めない
    const scored = questions.map((qq, i) => ({ qq, i })).filter(({ qq }) => !qq.scoringExcluded);
    await saveLastResult({
      sessionId: session.id,
      questionIds: scored.map(({ qq }) => qq.id),
      answers: scored.map(({ i }) => session.answers[i] ?? null),
      correctFlags: scored.map(({ qq, i }) => isCorrectChoice(qq, session.answers[i] ?? null)),
      fieldIds: scored.map(({ qq }) => qq.fieldId),
      endedAt: Date.now(),
    });
    await clearSession();
    // ログイン中はセットの結果を記録して Firestore へ送る
    await noteSetFinished({
      mode: 'practice',
      total: scored.length,
      correct: scored.filter(({ qq, i }) => isCorrectChoice(qq, session.answers[i] ?? null)).length,
      endedAt: Date.now(),
    });
    navigate('/result');
  }, [session, questions, answered, locked, isLast]);

  async function toggleCheck() {
    if (!q) return;
    const cur = progress.get(q.id)?.checked ?? false;
    const rec = await setChecked(q.id, !cur);
    setProgress((m) => new Map(m).set(rec.id, rec));
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current;
    const t = e.changedTouches[0];
    touch.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 解答後の左スワイプで次の問題へ（SPEC §4.3）
    if (dx < -70 && Math.abs(dy) < 50) void goNext();
  }

  if (error) {
    return (
      <div className="screen">
        <ErrorBox>
          問題を読み込めませんでした：{error}
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/home')}>
            ホームへ戻る
          </button>
        </ErrorBox>
      </div>
    );
  }

  if (!session || !questions || !q) {
    return (
      <div className="screen">
        <Skeleton lines={8} />
      </div>
    );
  }

  const total = session.questionIds.length;
  const p = progress.get(q.id);
  const checked = p?.checked ?? false;
  const field = fieldById(q.fieldId);
  const correct = isCorrectChoice(q, chosen);

  return (
    <div className="screen quiz has-bottom-bar" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <header className="quiz-header">
        <div className="quiz-topbar">
          <button type="button" className="icon-btn" onClick={() => navigate('/home')} aria-label="中断してホームへ戻る">
            ←
          </button>
          <span className="quiz-count" data-testid="quiz-count">
            {session.index + 1}/{total}
          </span>
          <span
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={session.index + 1}
            aria-label="進捗"
          >
            <span className="progress-fill" style={{ width: `${((session.index + 1) / total) * 100}%` }} />
          </span>
          <button
            type="button"
            className={`icon-btn star ${checked ? 'on' : ''}`}
            aria-pressed={checked}
            aria-label={checked ? 'あとで見直すチェックを外す' : 'あとで見直すチェックを付ける'}
            onClick={() => void toggleCheck()}
          >
            {checked ? '★' : '☆'}
          </button>
        </div>
        <div className="quiz-meta">
          <span>
            第{q.examNo}回 問{q.no}
          </span>
          <span className="sep" aria-hidden="true">
            ｜
          </span>
          <span>{field.short}</span>
          {p && p.history && (
            <span className="history" aria-label={`過去の正誤 ${p.history}`}>
              {p.history}
            </span>
          )}
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
                  <RichText text={s.text} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {q.images.map((src, i) => {
          const url = `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;
          return (
            <button key={src} type="button" className="figure" onClick={() => setZoom(url)} aria-label="図を拡大する">
              <img src={url} alt={`問題の図${i + 1}`} loading="lazy" />
              <span className="small muted">タップで拡大</span>
            </button>
          );
        })}
        {q.caution && (
          <p className="caution" role="note">
            <span aria-hidden="true">⚠ </span>
            {q.caution}
          </p>
        )}
      </section>

      <ul className="choices" aria-label="選択肢">
        {q.choices.map((c, i) => {
          const n = i + 1;
          const isAnswer = n === q.answer || (q.altAnswers ?? []).includes(n);
          const isChosen = n === chosen;
          let state = '';
          let mark: string | null = null;
          if (answered && q.scoringExcluded) {
            state = isChosen ? 'is-chosen' : 'is-dim';
          } else if (answered) {
            if (isAnswer) {
              state = 'is-correct';
              mark = '○ 正答';
            } else if (isChosen) {
              state = 'is-wrong';
              mark = '× あなたの解答';
            } else state = 'is-dim';
          }
          return (
            <li key={i}>
              <button
                type="button"
                className={`choice ${state}`}
                disabled={answered}
                aria-label={`${CHOICE_LABELS[i] ?? ''} ${c}${mark ? `（${mark}）` : ''}`}
                onClick={() => void choose(n)}
              >
                <span className="choice-no">{CHOICE_LABELS[i]}</span>
                <span className="choice-text">
                  <RichText text={c} />
                </span>
                {mark && <span className="choice-mark">{mark}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <section className="answer-block" aria-live="polite">
          {q.scoringExcluded ? (
            <p className="verdict" data-testid="verdict">
              採点対象外（公式に正解となる選択肢なし）
            </p>
          ) : (
          <p className={`verdict ${correct ? 'ok' : 'ng'}`} data-testid="verdict">
            <span className="verdict-icon" aria-hidden="true">
              {correct ? '○' : '×'}
            </span>
            {correct
              ? '正解'
              : `不正解　正答は ${[q.answer, ...(q.altAnswers ?? [])].map((n) => CHOICE_LABELS[n - 1] ?? '').join('・')}`}
          </p>
          )}
          <Explanation q={q} />
        </section>
      )}

      {answered && (
        <div className="bottom-bar">
          <button
            type="button"
            className="btn btn-primary"
            disabled={locked}
            onClick={() => void goNext()}
            data-testid="next"
          >
            {isLast ? '結果を見る' : '次へ'}
          </button>
        </div>
      )}

      {zoom && <Lightbox src={zoom} alt="問題の図（拡大）" onClose={() => setZoom(null)} />}
    </div>
  );
}
