import { loadQuestions } from './data';
import { getAllProgress, saveSession, type ProgressRec } from './db';
import { FIELDS } from './fields';
import { navigate } from './router';
import { selectQuestions, type SetupOptions } from './select';
import { updateSettings } from './settings';
import type { FieldId } from './types';

/**
 * 出題条件から問題を選んで、出題を始める。合う問題がなければ 'empty' を返す（画面は変えない）。
 * remember: 出題条件の画面から始めたときは、条件を「前回の条件」として覚える。
 */
export async function startQuiz(opt: SetupOptions, { remember = false } = {}): Promise<'started' | 'empty'> {
  const [all, progress] = await Promise.all([loadQuestions(opt.exams), getAllProgress()]);
  const picked = selectQuestions(all, progress, opt);
  if (picked.length === 0) return 'empty';
  if (remember) updateSettings({ lastSetup: opt });
  await saveSession({
    id: crypto.randomUUID(),
    mode: 'practice',
    questionIds: picked.map((q) => q.id),
    answers: picked.map(() => null),
    index: 0,
    startedAt: Date.now(),
  });
  navigate('/quiz');
  return 'started';
}

const ALL_FIELDS: FieldId[] = FIELDS.map((f) => f.id);
/** 弱点と判断するのに必要な、分野ごとの最低の解答数 */
export const WEAK_MIN_ANSWERED = 5;

export interface TodayPlan {
  kind: 'wrong' | 'unanswered' | 'random';
  /** ボタンの文言 */
  label: string;
  /** ボタンの下の説明 */
  detail: string;
  opt: SetupOptions;
}

export interface WeakPlan {
  fieldId: FieldId;
  answered: number;
  correct: number;
  opt: SetupOptions;
}

/**
 * ホームの「今日やること」：前回間違えた問題があればその解き直し、なければ未解答の問題から10問、
 * 全部解いていれば全体からランダムに10問。
 */
export function todayPlan(progress: ReadonlyMap<string, ProgressRec>, examNos: readonly number[], totalQuestions: number): TodayPlan {
  const base = { exams: [...examNos], fields: ALL_FIELDS };
  const wrong = [...progress.values()].filter((p) => p.lastCorrect === false).length;
  if (wrong > 0) {
    const n = Math.min(wrong, 20);
    return {
      kind: 'wrong',
      label: `前回間違えた問題を解き直す（${n}問）`,
      detail: wrong > 20 ? `間違えたままの問題が ${wrong} 問あります。まず20問から。` : `間違えたままの問題が ${wrong} 問あります。`,
      opt: { ...base, count: wrong > 20 ? 20 : 'all', order: 'random', filter: 'wrong' },
    };
  }
  const answered = [...progress.values()].filter((p) => p.attempts > 0).length;
  if (answered < totalQuestions) {
    return {
      kind: 'unanswered',
      label: 'まだ解いていない問題から10問',
      detail: `全${totalQuestions}問のうち、${answered}問を解きました。`,
      opt: { ...base, count: 10, order: 'random', filter: 'unanswered' },
    };
  }
  return {
    kind: 'random',
    label: 'ランダムに10問',
    detail: `全${totalQuestions}問を一度は解きました。`,
    opt: { ...base, count: 10, order: 'random', filter: 'all' },
  };
}

/** ホームの「弱点」：解答数が WEAK_MIN_ANSWERED 以上の分野のうち、正答率がいちばん低い分野 */
export function weakPlan(
  byField: readonly { fieldId: FieldId; answered: number; correct: number }[],
  examNos: readonly number[],
): WeakPlan | null {
  const cands = byField.filter((f) => f.answered >= WEAK_MIN_ANSWERED);
  if (cands.length === 0) return null;
  const weakest = [...cands].sort((a, b) => a.correct / a.answered - b.correct / b.answered)[0]!;
  return {
    ...weakest,
    opt: { exams: [...examNos], fields: [weakest.fieldId], count: 10, order: 'random', filter: 'lowRate' },
  };
}
