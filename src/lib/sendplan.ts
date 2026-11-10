import type { Outbox } from './db';

/**
 * 1回の送信（writeBatch 1回）で Firestore に足せる解答数の上限（SPEC §8.1）。
 * セキュリティルールでも、1回の送信で増やせる解答数を 55 まで（1回分の試験の問題数）に制限している。
 */
export const MAX_ANSWERS_PER_SEND = 55;
/**
 * 1回の送信で書く progress の件数の上限。
 * ルールは progress・days の1件ごとに getAfter を1回使い、1回の書き込み要求あたり20回までしか使えない。
 * また1回の要求で評価できる式は1000個まで。日別の記録（最大2件）と users の更新を合わせて収まる数にする
 */
export const MAX_DOCS_PER_SEND = 10;

/**
 * 未送信分（outbox）から、1回の送信で送る分を取り出す。
 *
 * - progress の解答数（attempts）の合計は MAX_ANSWERS_PER_SEND まで。超える分は次の送信に回す
 * - 1問だけで上限を超える場合（オフラインで同じ問題を何十回も解いたなど）は、その問題を上限まで分けて送る。
 *   それ以外は問題を途中で分けない（Firestore の attempts が history の長さより少なくなるとルールで拒否されるため）
 * - correct は、その回に送る attempts を超えない（ルール：correct の増加 ≤ answered の増加）
 * - 日別の記録（days）は日付ごとに answered を MAX_ANSWERS_PER_SEND まで。sessions は全部送る
 */
export function takeChunk(out: Outbox, limit = MAX_ANSWERS_PER_SEND): Outbox {
  const chunk: Outbox = { progress: {}, days: {} };
  let budget = limit;
  let docs = 0;
  for (const [qid, d] of Object.entries(out.progress)) {
    if (docs >= MAX_DOCS_PER_SEND) break;
    if (d.attempts <= 0) {
      // チェック（★）だけを変えた問題。解答数は増えない
      chunk.progress[qid] = { attempts: 0, correct: 0, rev: d.rev };
      docs++;
      continue;
    }
    if (d.attempts > budget) {
      // 上限を超える1問は、送信の先頭でだけ分けて送る
      if (budget !== limit) continue;
      chunk.progress[qid] = { attempts: budget, correct: Math.min(d.correct, budget), rev: d.rev };
      budget = 0;
      docs++;
      continue;
    }
    chunk.progress[qid] = { attempts: d.attempts, correct: Math.min(d.correct, d.attempts), rev: d.rev };
    budget -= d.attempts;
    docs++;
  }
  for (const [date, d] of Object.entries(out.days)) {
    const answered = Math.min(Math.max(d.answered, 0), limit);
    chunk.days[date] = {
      answered,
      correct: Math.min(Math.max(d.correct, 0), answered),
      sessions: [...d.sessions],
    };
  }
  return chunk;
}

/** 送る分の解答数の合計（Firestore の totals に足す数） */
export function chunkTotals(chunk: Outbox): { answered: number; correct: number } {
  let answered = 0;
  let correct = 0;
  for (const d of Object.values(chunk.progress)) {
    answered += d.attempts;
    correct += d.correct;
  }
  return { answered, correct };
}
