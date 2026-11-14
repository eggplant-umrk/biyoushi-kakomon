import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EmptyState, ErrorBox, Skeleton } from '../components/common';
import { Explanation } from '../components/Explanation';
import { Icon } from '../components/Icon';
import { MemoSheet } from '../components/MemoSheet';
import { MarkButton, MemoButton, MemoView } from '../components/PersonalControls';
import {
  activeFilterCount,
  browseScrollY,
  EMPTY_FILTER,
  loadBrowse,
  loadSearch,
  matchesFilter,
  rememberBrowseScroll,
  setBrowseFilter,
  useBrowseFilter,
  type BrowseFilter,
} from '../lib/browse';
import { loadExam, loadExams } from '../lib/data';
import { getAllProgress } from '../lib/db';
import { FIELDS, fieldById } from '../lib/fields';
import { RichText } from '../lib/markup';
import { usePersonal } from '../lib/personal';
import { startQuestions } from '../lib/quickstart';
import { navigate, useRouteParam } from '../lib/router';
import { searchDocs, type BrowseItem, type SearchHit } from '../lib/searchIndex';
import type { ExamMeta, Question } from '../lib/types';

const FigureViewer = lazy(() => import('../components/FigureViewer').then((m) => ({ default: m.FigureViewer })));

const CHOICE_LABELS = ['(1)', '(2)', '(3)', '(4)'];
const CONFIDENCE: [BrowseFilter['confidence'], string][] = [
  ['all', 'すべて'],
  ['high', '高'],
  ['medium', '中'],
  ['low', '低'],
];

/**
 * 閲覧モード（読む。7a-2）。全14回・770問を、解答せずに問題と解説を読む。
 * #/read が一覧、#/read?q=54-01 がその問題。一覧は軽いデータ（browse.json）だけで出し、
 * 検索の索引（search.json）は検索語を入れたときに、問題の本文（回ごとのデータ）は問題を開いたときに読み込む。
 */
export function ReadScreen() {
  const qid = useRouteParam('q');
  return qid ? <ReadDetail key={qid} qid={qid} /> : <ReadList />;
}

// ---- 一覧 -------------------------------------------------------------------

/** 一致した語を強調する（React の要素として作る。HTML として解釈しない） */
function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const out: ReactNode[] = [];
  let last = 0;
  ranges.forEach(([s, e], i) => {
    if (s < last) return;
    if (s > last) out.push(text.slice(last, s));
    out.push(
      <mark key={i} className="hit">
        {text.slice(s, e)}
      </mark>,
    );
    last = e;
  });
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** 1行の高さ（rem）。仮想リストで、画面に見えている行だけを描くために使う */
const ROW_REM = 6.25;

function useWindowedRange(
  count: number,
  listRef: React.RefObject<HTMLElement | null>,
): { start: number; end: number; rowPx: number } {
  const [range, setRange] = useState({ start: 0, end: 30, rowPx: 100 });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = listRef.current;
      if (!el) return;
      const rowPx = ROW_REM * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const top = el.getBoundingClientRect().top; // 画面の上端からの位置
      const first = Math.max(0, Math.floor(-top / rowPx) - 8);
      const visible = Math.ceil(window.innerHeight / rowPx) + 16;
      const next = { start: Math.min(first, Math.max(0, count - 1)), end: Math.min(count, first + visible), rowPx };
      setRange((r) => (r.start === next.start && r.end === next.end && r.rowPx === next.rowPx ? r : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [count, listRef]);
  return range;
}

function ReadList() {
  const f = useBrowseFilter();
  const personal = usePersonal();
  const [items, setItems] = useState<BrowseItem[] | null>(null);
  const [exams, setExams] = useState<ExamMeta[]>([]);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [input, setInput] = useState(f.query);
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    Promise.all([loadBrowse(), loadExams(), getAllProgress()])
      .then(([b, e, p]) => {
        setItems(b);
        setExams([...e].sort((a, c) => c.examNo - a.examNo));
        setWrong(new Set([...p.values()].filter((x) => x.lastCorrect === false).map((x) => x.id)));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // 検索語は、打つのを止めてから 250ms 後に反映する
  useEffect(() => {
    const t = window.setTimeout(() => setBrowseFilter({ query: input }), 250);
    return () => window.clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!f.query.trim()) {
      setHits(null);
      return;
    }
    let alive = true;
    setSearching(true);
    loadSearch()
      .then((docs) => {
        if (alive) setHits(searchDocs(docs, f.query, 770));
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setSearching(false));
    return () => {
      alive = false;
    };
  }, [f.query]);

  const ctx = useMemo(
    () => ({ marks: personal?.marks ?? new Set<string>(), memos: new Set(personal?.memos.keys() ?? []), wrong }),
    [personal, wrong],
  );
  const rows = useMemo(() => {
    if (!items) return [];
    const byId = new Map(items.map((i) => [i.id, i]));
    if (f.query.trim() && !hits) return [];
    if (hits) {
      return hits.flatMap((h) => {
        const it = byId.get(h.id);
        return it && matchesFilter(it, f, ctx) ? [{ item: it, hit: h }] : [];
      });
    }
    return items.filter((it) => matchesFilter(it, f, ctx)).map((item) => ({ item, hit: null as SearchHit | null }));
  }, [items, hits, f, ctx]);

  const { start, end, rowPx } = useWindowedRange(rows.length, listRef);

  // 問題を開いて戻ってきたら、前のスクロール位置に戻す
  useEffect(() => {
    if (items && browseScrollY > 0) window.scrollTo(0, browseScrollY);
  }, [items]);

  const nFilters = activeFilterCount(f);
  const open = (id: string) => {
    rememberBrowseScroll(window.scrollY);
    navigate('/read', { query: { q: id } });
  };

  return (
    <div className="screen read">
      <h1 className="screen-title">読む</h1>
      <div className="read-tools">
        <label className="search-box">
          <Icon name="search" size={20} />
          <span className="sr-only">問題文・選択肢・解説を検索</span>
          <input
            type="search"
            value={input}
            placeholder="キーワードで検索"
            enterKeyHint="search"
            maxLength={60}
            onChange={(e) => setInput(e.target.value)}
          />
          {input && (
            <button
              type="button"
              className="search-clear"
              aria-label="検索語を消す"
              onClick={() => {
                // 消すときは待たずにすぐ反映する（すぐ別の画面へ移っても、消えた状態を残す）
                setInput('');
                setBrowseFilter({ query: '' });
              }}
            >
              <Icon name="close" size={18} />
            </button>
          )}
        </label>
        <button
          type="button"
          className={`btn btn-ghost filter-toggle ${nFilters ? 'has' : ''}`}
          aria-expanded={showFilters}
          aria-controls="read-filters"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Icon name="filter" size={20} />
          絞り込み{nFilters ? `（${nFilters}）` : ''}
        </button>
      </div>

      {showFilters && (
        <section id="read-filters" className="card read-filters" aria-label="絞り込み">
          <div className="filter-row">
            <span className="filter-label">回</span>
            <div className="chips chips-grid">
              <label className="chip">
                <input type="checkbox" checked={f.exams.length === 0} onChange={() => setBrowseFilter({ exams: [] })} />
                <span>すべて</span>
              </label>
              {exams.map((e) => (
                <label key={e.examNo} className="chip">
                  <input
                    type="checkbox"
                    checked={f.exams.includes(e.examNo)}
                    onChange={() =>
                      setBrowseFilter({
                        exams: f.exams.includes(e.examNo)
                          ? f.exams.filter((x) => x !== e.examNo)
                          : [...f.exams, e.examNo],
                      })
                    }
                  />
                  <span>第{e.examNo}回</span>
                </label>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-label">分野</span>
            <div className="chips">
              <label className="chip">
                <input
                  type="radio"
                  name="read-field"
                  checked={f.field === null}
                  onChange={() => setBrowseFilter({ field: null })}
                />
                <span>すべて</span>
              </label>
              {FIELDS.map((fd) => (
                <label key={fd.id} className="chip">
                  <input
                    type="radio"
                    name="read-field"
                    checked={f.field === fd.id}
                    onChange={() => setBrowseFilter({ field: fd.id })}
                  />
                  <span>{fd.short}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-label">自分の記録</span>
            <div className="chips">
              <label className="chip">
                <input
                  type="checkbox"
                  checked={f.reviewOnly}
                  onChange={() => setBrowseFilter({ reviewOnly: !f.reviewOnly })}
                />
                <span>要復習のみ</span>
              </label>
              <label className="chip">
                <input
                  type="checkbox"
                  checked={f.wrongOnly}
                  onChange={() => setBrowseFilter({ wrongOnly: !f.wrongOnly })}
                />
                <span>間違えた問題のみ</span>
              </label>
              <label className="chip">
                <input
                  type="checkbox"
                  checked={f.memoOnly}
                  onChange={() => setBrowseFilter({ memoOnly: !f.memoOnly })}
                />
                <span>メモありのみ</span>
              </label>
            </div>
          </div>
          <div className="filter-row">
            <span className="filter-label">解説の確信度</span>
            <div className="chips">
              {CONFIDENCE.map(([v, label]) => (
                <label key={v} className="chip">
                  <input
                    type="radio"
                    name="read-conf"
                    checked={f.confidence === v}
                    onChange={() => setBrowseFilter({ confidence: v })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="small muted">「低」は、根拠を確認中の解説です。</p>
          </div>
          <div className="filter-actions">
            {nFilters > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setBrowseFilter({ ...EMPTY_FILTER, query: f.query })}
              >
                すべて外す
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowFilters(false)}
              data-testid="filter-apply"
            >
              {items ? `${rows.length}問を見る` : '閉じる'}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <ErrorBox>問題の一覧を読み込めませんでした：{error}</ErrorBox>
      ) : !items ? (
        <Skeleton lines={8} label="問題の一覧を読み込んでいます…" />
      ) : (
        <>
          <p className="read-count small muted" aria-live="polite" data-testid="read-count">
            {searching || (f.query.trim() && !hits)
              ? '検索しています…'
              : f.query.trim()
                ? `「${f.query.trim()}」に一致：${rows.length}問`
                : `${rows.length}問`}
          </p>
          {rows.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="search"
                title={f.query.trim() ? '一致する問題がありません' : '条件に合う問題がありません'}
              >
                <p>
                  {f.query.trim()
                    ? '言葉を短くするか、別の言い方で探してください。'
                    : '絞り込みを外すと、ほかの問題も表示されます。'}
                </p>
              </EmptyState>
            </div>
          ) : (
            <ol
              ref={listRef}
              className="read-list"
              aria-label="問題の一覧"
              style={{ height: `${rows.length * rowPx}px` }}
            >
              {rows.slice(start, end).map(({ item, hit }, k) => {
                const i = start + k;
                const marked = ctx.marks.has(item.id);
                const hasMemo = ctx.memos.has(item.id);
                const wasWrong = wrong.has(item.id);
                return (
                  <li key={item.id} className="read-row" style={{ top: `${i * rowPx}px`, height: `${rowPx}px` }}>
                    <button type="button" className="read-item" onClick={() => open(item.id)} data-testid="read-item">
                      <span className="read-meta">
                        <strong>
                          第{item.e}回 問{item.n}
                        </strong>
                        {/* 印は回・問のすぐ後に置き、幅が足りないときは分野名のほうを「…」で省く */}
                        <span className="read-badges">
                          {marked && (
                            <span className="mini mark">
                              <Icon name="star" size={13} filled />
                              要復習
                            </span>
                          )}
                          {hasMemo && (
                            <span className="mini memo" data-testid="memo-badge">
                              <Icon name="note" size={13} />
                              メモ
                            </span>
                          )}
                          {wasWrong && <span className="mini ng">×前回</span>}
                          {item.c === 'low' && <span className="mini warn">確認中</span>}
                          {item.img && <span className="mini">図</span>}
                          {hit && <span className="badge">{hit.part}</span>}
                        </span>
                        <span className="read-field muted">{fieldById(item.f as never).short}</span>
                      </span>
                      <span className="read-stem">
                        {hit ? <Highlight text={hit.snippet} ranges={hit.ranges} /> : item.s}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

// ---- 1問を読む -------------------------------------------------------------

function ReadDetail({ qid }: { qid: string }) {
  const [q, setQ] = useState<Question | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [memoOpen, setMemoOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const personal = usePersonal();
  const f = useBrowseFilter();

  useEffect(() => {
    window.scrollTo(0, 0);
    const examNo = Number(qid.split('-')[0]);
    loadExam(examNo)
      .then((qs) => {
        const hit = qs.find((x) => x.id === qid);
        if (hit) setQ(hit);
        else setError('この問題は見つかりませんでした。');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // 前後の問題（いまの絞り込みの並び。検索語があるときは回・番号の順）
    void Promise.all([loadBrowse(), getAllProgress()]).then(([items, p]) => {
      const wrong = new Set([...p.values()].filter((x) => x.lastCorrect === false).map((x) => x.id));
      const ctx = { marks: personal?.marks ?? new Set<string>(), memos: new Set(personal?.memos.keys() ?? []), wrong };
      setOrder(items.filter((it) => f.query.trim() || matchesFilter(it, f, ctx)).map((it) => it.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qid]);

  const back = () => navigate('/read');
  if (error) {
    return (
      <div className="screen">
        <ErrorBox>
          {error}
          <button type="button" className="btn btn-secondary" onClick={back}>
            一覧へ戻る
          </button>
        </ErrorBox>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="screen">
        <Skeleton lines={8} label="問題を読み込んでいます…" />
      </div>
    );
  }

  const answers = [q.answer, ...(q.altAnswers ?? [])];
  const marked = personal?.marks.has(q.id) ?? false;
  const memo = personal?.memos.get(q.id);
  const pos = order.indexOf(q.id);
  const prevId = pos > 0 ? order[pos - 1] : undefined;
  const nextId = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : undefined;
  const go = (id: string | undefined) => id && navigate('/read', { query: { q: id } });

  return (
    <div className="screen read-detail has-bottom-bar">
      <header className="quiz-header">
        <div className="quiz-topbar">
          <button type="button" className="icon-btn star back-to-list" onClick={back} aria-label="一覧へ戻る">
            <Icon name="list" />
            <span className="star-label">一覧</span>
          </button>
          <span className="read-detail-title">
            第{q.examNo}回 問{q.no}
          </span>
          <span className="spacer" />
          <MemoButton memo={memo} onOpen={() => setMemoOpen(true)} />
          <MarkButton qid={q.id} on={marked} />
        </div>
        <div className="quiz-meta">
          <span>{fieldById(q.fieldId).name}</span>
          {pos >= 0 && (
            <span className="history">
              <span className="history-label">一覧の</span>
              {pos + 1}/{order.length}
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
                  <RichText text={s.text} traps={q.explanation?.traps ?? []} />
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
              <span className="figure-hint small">
                <Icon name="expand" size={16} />
                タップで拡大
              </span>
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
      {q.scoringExcluded && <p className="verdict">採点対象外（公式に正解となる選択肢なし）</p>}

      <section className="answer-block">
        <Explanation q={q} />
        {memo && <MemoView memo={memo} onEdit={() => setMemoOpen(true)} />}
      </section>

      <div className="bottom-bar with-tabs read-bar">
        <div className="read-nav">
          <button
            type="button"
            className="icon-btn nav-btn"
            disabled={!prevId}
            onClick={() => go(prevId)}
            aria-label="前の問題"
          >
            <Icon name="back" size={20} />
            <span className="star-label">前</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-icon"
            onClick={() => void startQuestions([q.id])}
            data-testid="solve-this"
          >
            <Icon name="play" size={20} />
            この問題を解く
          </button>
          <button
            type="button"
            className="icon-btn nav-btn"
            disabled={!nextId}
            onClick={() => go(nextId)}
            aria-label="次の問題"
          >
            <Icon name="forward" size={20} />
            <span className="star-label">次</span>
          </button>
        </div>
      </div>

      {memoOpen && (
        <MemoSheet qid={q.id} title={`第${q.examNo}回 問${q.no}`} memo={memo} onClose={() => setMemoOpen(false)} />
      )}
      {zoom && (
        <Suspense fallback={null}>
          <FigureViewer src={zoom} alt="問題の図（拡大）" onClose={() => setZoom(null)} />
        </Suspense>
      )}
    </div>
  );
}
