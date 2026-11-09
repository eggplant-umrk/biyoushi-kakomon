import { RichText, safeHttpsUrl } from '../lib/markup';
import type { Question, SourceType } from '../lib/types';

const SOURCE_TYPE: Record<SourceType, string> = {
  law: '法令',
  gov: '公的機関',
  academic: '学会・専門機関',
  edu: '教育機関',
  site: '解説サイト',
};

export function Explanation({ q }: { q: Question }) {
  const ex = q.explanation;
  if (!ex || ex.status !== 'published') {
    return <p className="card muted">解説準備中</p>;
  }
  return (
    <div className="explanation">
      {ex.confidence === 'low' && <p className="small low-confidence">この解説は確認中です</p>}
      <h2 className="ex-title">解説</h2>
      <p>
        <RichText text={ex.summary} traps={ex.traps} />
      </p>
      {ex.keyPoint && (
        <p className="keypoint">
          <span className="keypoint-label">ここだけ覚える</span>
          <RichText text={ex.keyPoint} traps={ex.traps} />
        </p>
      )}
      <ol className="per-choice">
        {ex.perChoice.map((t, i) => (
          <li key={i} className={i + 1 === q.answer ? 'is-answer' : ''}>
            <span className="pc-no">
              ({i + 1}){i + 1 === q.answer ? ' 正答' : ''}
            </span>
            <span>
              <RichText text={t} traps={ex.traps} />
            </span>
          </li>
        ))}
      </ol>
      {ex.sources.length > 0 && (
        <details className="sources">
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
          {ex.asOf && <p className="small muted">{ex.asOf} 時点で確認</p>}
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
