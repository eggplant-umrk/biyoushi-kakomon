import { useEffect, useState } from 'react';
import { ErrorBox, Skeleton } from '../components/common';
import { loadQuestions, loadExams } from '../lib/data';
import { getAllProgress, saveSession } from '../lib/db';
import { FIELDS } from '../lib/fields';
import { navigate } from '../lib/router';
import {
  FILTER_LABELS,
  selectQuestions,
  type CountOpt,
  type FilterOpt,
  type OrderOpt,
  type SetupOptions,
} from '../lib/select';
import { getSettings, updateSettings } from '../lib/settings';
import type { ExamMeta, FieldId } from '../lib/types';

const COUNTS: CountOpt[] = [10, 20, 30, 'all'];

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function SetupScreen() {
  const [exams, setExams] = useState<ExamMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opt, setOpt] = useState<SetupOptions | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadExams()
      .then((list) => {
        const sorted = [...list].sort((a, b) => b.examNo - a.examNo);
        setExams(sorted);
        const nos = sorted.map((e) => e.examNo);
        const last = getSettings().lastSetup;
        // 前回の条件を記憶（SPEC §3.1）。今は無い回は外す
        const keep = last?.exams.filter((n) => nos.includes(n)) ?? [];
        setOpt(
          last && keep.length > 0
            ? { ...last, exams: keep }
            : { exams: nos.slice(0, 1), fields: FIELDS.map((f) => f.id), count: 10, order: 'number', filter: 'all' },
        );
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function start() {
    if (!opt) return;
    setBusy(true);
    setMessage(null);
    try {
      const [all, progress] = await Promise.all([loadQuestions(opt.exams), getAllProgress()]);
      const picked = selectQuestions(all, progress, opt);
      if (picked.length === 0) {
        setMessage('条件に合う問題がありません。条件を変えてください。');
        return;
      }
      updateSettings({ lastSetup: opt });
      await saveSession({
        id: crypto.randomUUID(),
        mode: 'practice',
        questionIds: picked.map((q) => q.id),
        answers: picked.map(() => null),
        index: 0,
        startedAt: Date.now(),
      });
      navigate('/quiz');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="screen">
        <h1 className="screen-title">出題条件</h1>
        <ErrorBox>問題データを読み込めませんでした：{error}</ErrorBox>
      </div>
    );
  }

  if (!exams || !opt) {
    return (
      <div className="screen">
        <h1 className="screen-title">出題条件</h1>
        <Skeleton lines={6} />
      </div>
    );
  }

  const set = (p: Partial<SetupOptions>) => setOpt({ ...opt, ...p });
  const canStart = opt.exams.length > 0 && opt.fields.length > 0 && !busy;

  return (
    <div className="screen has-bottom-bar">
      <h1 className="screen-title">出題条件</h1>

      <fieldset className="card">
        <legend className="card-title">回（複数選択）</legend>
        <div className="chips">
          {exams.map((e) => (
            <label key={e.examNo} className="chip">
              <input
                type="checkbox"
                checked={opt.exams.includes(e.examNo)}
                onChange={() => set({ exams: toggle(opt.exams, e.examNo) })}
              />
              <span>第{e.examNo}回</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">分野（複数選択）</legend>
        <div className="chip-actions">
          <button type="button" className="link-btn" onClick={() => set({ fields: FIELDS.map((f) => f.id) })}>
            すべて選択
          </button>
          <button type="button" className="link-btn" onClick={() => set({ fields: [] })}>
            すべて解除
          </button>
        </div>
        <div className="chips">
          {FIELDS.map((f) => (
            <label key={f.id} className="chip">
              <input
                type="checkbox"
                checked={opt.fields.includes(f.id)}
                onChange={() => set({ fields: toggle<FieldId>(opt.fields, f.id) })}
              />
              <span>{f.short}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">出題数</legend>
        <div className="segmented">
          {COUNTS.map((c) => (
            <label key={String(c)} className="seg">
              <input type="radio" name="count" checked={opt.count === c} onChange={() => set({ count: c })} />
              <span>{c === 'all' ? '全部' : `${c}問`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">順番</legend>
        <div className="segmented">
          {(
            [
              ['number', '番号順'],
              ['random', 'ランダム'],
            ] as [OrderOpt, string][]
          ).map(([v, label]) => (
            <label key={v} className="seg">
              <input
                type="radio"
                name="order"
                checked={opt.order === v}
                disabled={opt.filter === 'lowRate'}
                onChange={() => set({ order: v })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="card">
        <legend className="card-title">絞り込み</legend>
        <div className="radio-list">
          {(Object.keys(FILTER_LABELS) as FilterOpt[]).map((f) => (
            <label key={f} className="radio-row">
              <input type="radio" name="filter" checked={opt.filter === f} onChange={() => set({ filter: f })} />
              <span>{FILTER_LABELS[f]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {message && (
        <p className="card warn" role="status">
          {message}
        </p>
      )}

      <div className="bottom-bar with-tabs">
        <button type="button" className="btn btn-primary" disabled={!canStart} onClick={() => void start()}>
          {busy ? '準備中…' : 'この条件で始める'}
        </button>
      </div>
    </div>
  );
}
