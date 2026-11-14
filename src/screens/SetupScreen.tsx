import { useEffect, useState } from 'react';
import { ErrorBox, Skeleton } from '../components/common';
import { Icon } from '../components/Icon';
import { loadExams } from '../lib/data';
import { FIELDS } from '../lib/fields';
import { startQuiz } from '../lib/quickstart';
import {
  FILTER_LABELS,
  type CountOpt,
  type FilterOpt,
  type OrderOpt,
  type SetupOptions,
} from '../lib/select';
import { getSettings } from '../lib/settings';
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

  async function start(o: SetupOptions | null = opt) {
    if (!o) return;
    setBusy(true);
    setMessage(null);
    try {
      if ((await startQuiz(o, { remember: true })) === 'empty') setMessage('条件に合う問題がありません。条件を変えてください。');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="screen">
        <h1 className="screen-title">解く</h1>
        <ErrorBox>問題データを読み込めませんでした：{error}</ErrorBox>
      </div>
    );
  }

  if (!exams || !opt) {
    return (
      <div className="screen">
        <h1 className="screen-title">解く</h1>
        <Skeleton lines={6} label="問題の一覧を読み込んでいます…" />
      </div>
    );
  }

  const set = (p: Partial<SetupOptions>) => setOpt({ ...opt, ...p });
  const canStart = opt.exams.length > 0 && opt.fields.length > 0 && !busy;
  const last = getSettings().lastSetup;
  const examLabel = (o: SetupOptions) =>
    o.exams.length === exams.length ? 'すべての回' : o.exams.length === 1 ? `第${o.exams[0]}回` : `${o.exams.length}回分`;
  const fieldLabel = (o: SetupOptions) => (o.fields.length === FIELDS.length ? '全分野' : `${o.fields.length}分野`);
  const countLabel = (o: SetupOptions) => (o.count === 'all' ? '全部' : `${o.count}問`);
  const summaryOf = (o: SetupOptions) => `${examLabel(o)}・${fieldLabel(o)}・${countLabel(o)}・${FILTER_LABELS[o.filter]}`;

  return (
    <div className="screen has-bottom-bar setup">
      <h1 className="screen-title">解く</h1>

      {last && last.exams.some((n) => exams.some((e) => e.examNo === n)) && (
        <button type="button" className="hero" disabled={busy} onClick={() => void start({ ...last, exams: last.exams.filter((n) => exams.some((e) => e.examNo === n)) })}>
          <span className="hero-icon">
            <Icon name="redo" />
          </span>
          <span className="hero-body">
            <span className="hero-kicker">前回の条件で始める</span>
            <span className="hero-main small">{summaryOf(last)}</span>
          </span>
          <Icon name="forward" className="hero-arrow" />
        </button>
      )}

      <h2 className="section-title">条件を選んで始める</h2>

      <fieldset className="card">
        <legend className="card-title">回（複数選択）</legend>
        <div className="chip-actions">
          <button type="button" className="link-btn" onClick={() => set({ exams: exams.slice(0, 1).map((e) => e.examNo) })}>
            最新の回だけ
          </button>
          <button type="button" className="link-btn" onClick={() => set({ exams: exams.map((e) => e.examNo) })}>
            すべての回
          </button>
        </div>
        <div className="chips chips-grid">
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
        <p className="bottom-bar-note small" aria-live="polite">
          {opt.exams.length === 0 ? '回を1つ以上選んでください' : opt.fields.length === 0 ? '分野を1つ以上選んでください' : summaryOf(opt)}
        </p>
        <button type="button" className="btn btn-primary" disabled={!canStart} onClick={() => void start()}>
          {busy ? '準備中…' : 'この条件で始める'}
        </button>
      </div>
    </div>
  );
}
