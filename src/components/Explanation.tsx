import { RichText, safeHttpsUrl } from '../lib/markup';
import { bookOf, textbookLine } from '../lib/textbooks';
import type { Question, SourceType, TextbookRef } from '../lib/types';

const SOURCE_TYPE: Record<SourceType, string> = {
  law: '法令',
  gov: '公的機関',
  academic: '学会・専門機関',
  edu: '教育機関',
  site: '解説サイト',
};

/** 「2026-11」→「2026年11月」 */
function asOfLabel(asOf: string): string {
  const [y, m] = asOf.split('-');
  return `${y}年${Number(m)}月`;
}

/**
 * 教科書の参照先（SPEC §14）。教科書の本文は出さず、どこを開けばよいかだけを1行で示す。
 * ページは版によってずれるので「第2版の場合」のように版を添える。
 */
function TextbookRefs({ refs }: { refs: readonly TextbookRef[] }) {
  const lines = refs.flatMap((r) => {
    const line = textbookLine(r);
    return line ? [{ line, r }] : [];
  });
  if (lines.length === 0) return null;
  return (
    <ul className="textbook-refs" data-testid="textbook-refs">
      {lines.map(({ line, r }, i) => (
        <li key={i}>
          <span className="textbook-label">教科書</span>
          <span>
            {line}
            <span className="muted">
              （{bookOf(r.bookId)?.edition}の場合{r.via === 'toc' ? '。目次からの推定' : ''}）
            </span>
            <span className="textbook-title">「{r.title}」</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 解説（SPEC §6.7.6）。スマホで読みやすいよう、最初に要点（なぜその答えか・ここだけ覚える・自分が選んだ選択肢の誤り）だけを出し、
 * 選択肢ごとの説明と根拠の資料は折りたたむ。
 */
export function Explanation({ q, chosen = null }: { q: Question; chosen?: number | null }) {
  const ex = q.explanation;
  const refs = q.textbookRefs ?? [];
  if (!ex || ex.status !== 'published') {
    return (
      <div className="explanation-pending">
        <p className="card muted">解説準備中</p>
        {refs.length > 0 && <TextbookRefs refs={refs} />}
      </div>
    );
  }
  const answers = [q.answer, ...(q.altAnswers ?? [])];
  const chosenNote = chosen !== null && !q.scoringExcluded && !answers.includes(chosen) ? ex.perChoice[chosen - 1] : undefined;
  return (
    <div className="explanation" data-testid="explanation">
      {ex.confidence === 'low' && <p className="small low-confidence">この解説は確認中です</p>}
      <h2 className="ex-title">解説</h2>
      <p className="ex-summary">
        <RichText text={ex.summary} traps={ex.traps} />
      </p>
      {chosenNote && (
        <p className="ex-chosen" data-testid="ex-chosen">
          <span className="ex-chosen-label">あなたが選んだ ({chosen})</span>
          <RichText text={chosenNote} traps={ex.traps} />
        </p>
      )}
      {ex.keyPoint && (
        <p className="keypoint">
          <span className="keypoint-label">ここだけ覚える</span>
          <RichText text={ex.keyPoint} traps={ex.traps} />
        </p>
      )}
      {ex.caution && (
        <p className="caution ex-caution" role="note" data-testid="ex-caution">
          <span className="ex-caution-label">注意{ex.asOf ? `（${asOfLabel(ex.asOf)}に確認）` : ''}</span>
          {ex.caution}
        </p>
      )}
      {refs.length > 0 && <TextbookRefs refs={refs} />}

      <details className="ex-fold" data-testid="ex-detail">
        <summary>{ex.perStatement ? '記述・選択肢ごとの説明' : '選択肢ごとの説明'}</summary>
        {ex.perStatement && q.statements && (
          <ol className="per-choice">
            {ex.perStatement.map((t, i) => (
              <li key={i}>
                <span className="pc-no">{q.statements?.[i]?.label ?? ''}</span>
                <span>
                  <RichText text={t} traps={ex.traps} />
                </span>
              </li>
            ))}
          </ol>
        )}
        <ol className="per-choice">
          {ex.perChoice.map((t, i) => (
            <li key={i} className={answers.includes(i + 1) ? 'is-answer' : ''}>
              <span className="pc-no">
                ({i + 1}){answers.includes(i + 1) ? ' 正答' : ''}
              </span>
              <span>
                <RichText text={t} traps={ex.traps} />
              </span>
            </li>
          ))}
        </ol>
      </details>

      {ex.sources.length > 0 && (
        <details className="ex-fold sources">
          <summary>根拠の資料（{ex.sources.length}件）</summary>
          <ul>
            {ex.sources.map((s, i) => {
              const url = safeHttpsUrl(s.url);
              return (
                <li key={i}>
                  <span className="badge">{SOURCE_TYPE[s.type]}</span>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              );
            })}
          </ul>
          {ex.asOf && <p className="small muted">{asOfLabel(ex.asOf)} 時点で確認</p>}
        </details>
      )}
      <div className="report">
        <button type="button" className="btn btn-ghost" disabled aria-describedby="report-note">
          解説が分かりにくい／間違っているかも
        </button>
        <p id="report-note" className="small muted">
          報告はログインすると使えます（準備中）
        </p>
      </div>
    </div>
  );
}
