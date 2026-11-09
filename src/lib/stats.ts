import { FIELDS } from './fields';
import type { DayRec, ProgressRec } from './db';
import type { FieldId } from './types';

export interface FieldStat {
  fieldId: FieldId;
  answered: number;
  correct: number;
}

export interface Summary {
  today: number;
  answered: number;
  correct: number;
  byField: FieldStat[]; // 弱い順（未解答の分野は最後）
}

function fieldIdOfQid(qid: string): FieldId | null {
  const no = Number(qid.split('-')[1]);
  return FIELDS.find((f) => no >= f.from && no <= f.to)?.id ?? null;
}

export function summarize(progress: Iterable<ProgressRec>, days: readonly DayRec[], today: string): Summary {
  const by = new Map<FieldId, FieldStat>(FIELDS.map((f) => [f.id, { fieldId: f.id, answered: 0, correct: 0 }]));
  let answered = 0;
  let correct = 0;
  for (const p of progress) {
    answered += p.attempts;
    correct += p.correctCount;
    const fid = fieldIdOfQid(p.id);
    const s = fid ? by.get(fid) : undefined;
    if (s) {
      s.answered += p.attempts;
      s.correct += p.correctCount;
    }
  }
  const rate = (s: FieldStat) => (s.answered ? s.correct / s.answered : Number.POSITIVE_INFINITY);
  const byField = [...by.values()].sort((a, b) => rate(a) - rate(b));
  return {
    today: days.find((d) => d.date === today)?.answered ?? 0,
    answered,
    correct,
    byField,
  };
}

export function pct(correct: number, answered: number): string {
  return answered ? `${Math.round((correct / answered) * 100)}%` : '—';
}
