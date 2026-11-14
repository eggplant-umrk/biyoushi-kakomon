/**
 * 閲覧モードの一覧（browse.json）と検索の索引（search.json）。7a-2（SPEC §14 #60）。
 * ビルド時（scripts/build-data.ts）に問題データから作り、画面では必要になったときに初めて読み込む：
 * - 一覧：閲覧モードを開いたとき（問題文の冒頭・回・分野・確信度だけの軽いデータ）
 * - 索引：検索語を入れたとき（問題文・選択肢・記述・解説の素の文字列）
 * どちらも Service Worker が前もって保存するので、オフラインでも使える。
 * このファイルは、ビルドの道具（Node）からも読むので、ほかの src のファイルを import しない。
 */

export type Confidence = 'high' | 'medium' | 'low';

export interface BrowseItem {
  id: string;
  /** 回 */
  e: number;
  /** 問題番号 */
  n: number;
  /** 分野 */
  f: string;
  /** 問題文の冒頭（素の文字列） */
  s: string;
  /** 解説の確信度（解説がなければ null） */
  c: Confidence | null;
  /** 図がある */
  img?: 1;
}

export interface SearchDoc {
  id: string;
  /** 問題文・記述（a〜e）・選択肢（1〜4） */
  q: string[];
  /** 解説（要約・ここだけ覚える・選択肢ごと・記述ごと） */
  x: string[];
}

interface QuestionLike {
  id: string;
  examNo: number;
  no: number;
  fieldId: string;
  stem: string;
  choices: string[];
  statements?: { label: string; text: string }[] | null;
  images: string[];
  explanation?: {
    status?: string;
    confidence: Confidence;
    summary: string;
    keyPoint?: string | null;
    perChoice: string[];
    perStatement?: string[] | null;
  } | null;
}

const UNDERLINE = /\[\[u:([^\]]*)\]\]/g;
/** 問題文の独自記法（[[u:…]]）を取り除いた素の文字列 */
export function stripMarkup(s: string): string {
  return s.replace(UNDERLINE, '$1');
}

const STEM_LEN = 70;

export function toBrowseItem(q: QuestionLike): BrowseItem {
  const stem = stripMarkup(q.stem).replace(/\s+/g, ' ').trim();
  const ex = q.explanation && q.explanation.status !== 'draft' ? q.explanation : null;
  return {
    id: q.id,
    e: q.examNo,
    n: q.no,
    f: q.fieldId,
    s: stem.length > STEM_LEN ? `${stem.slice(0, STEM_LEN)}…` : stem,
    c: ex ? ex.confidence : null,
    ...(q.images.length ? { img: 1 as const } : {}),
  };
}

export function toSearchDoc(q: QuestionLike): SearchDoc {
  const ex = q.explanation && q.explanation.status !== 'draft' ? q.explanation : null;
  return {
    id: q.id,
    q: [
      stripMarkup(q.stem),
      ...(q.statements ?? []).map((s) => `${s.label} ${stripMarkup(s.text)}`),
      ...q.choices.map((c, i) => `(${i + 1}) ${stripMarkup(c)}`),
    ],
    x: ex ? [ex.summary, ex.keyPoint ?? '', ...ex.perChoice, ...(ex.perStatement ?? [])].filter(Boolean) : [],
  };
}

// ---- 検索（画面側） -----------------------------------------------------------

/**
 * 比べるための形にそろえる：全角・半角（NFKC）、大文字・小文字、カタカナ・ひらがなの違いを無視する。
 * 1文字ずつ変換し、元の文字列の位置（map）も返す（強調表示の位置を元の文字列で求めるため）
 */
const KATA = /[ァ-ヶ]/g;
const toHira = (k: string) => String.fromCharCode(k.charCodeAt(0) - 0x60);

export function normalizeForSearch(src: string): { norm: string; map: number[] | null } {
  // 速い道：まとめて変換して長さが変わらなければ、位置はそのまま（map は null＝元と同じ位置）
  const whole = src.normalize('NFKC').toLowerCase().replace(KATA, toHira);
  if (whole.length === src.length) return { norm: whole, map: null };
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!.normalize('NFKC').toLowerCase().replace(KATA, toHira);
    for (let j = 0; j < c.length; j++) {
      norm += c[j];
      map.push(i);
    }
  }
  return { norm, map };
}

/** 検索語を、空白で区切った語の並びにする（すべての語を含むものを探す） */
export function parseQuery(query: string): string[] {
  return [
    ...new Set(
      normalizeForSearch(query.trim())
        .norm.split(/\s+/)
        .filter((t) => t.length > 0),
    ),
  ].slice(0, 5);
}

export type HitPart = '問題文' | '選択肢' | '解説';

export interface SearchHit {
  id: string;
  score: number;
  part: HitPart;
  /** 一致した部分の前後を切り出した文字列 */
  snippet: string;
  /** snippet の中で一致した位置 [start, end) */
  ranges: [number, number][];
}

function rangesIn({ norm, map }: { norm: string; map: number[] | null }, terms: readonly string[]): [number, number][] {
  const at = (k: number) => (map ? map[k]! : k);
  const out: [number, number][] = [];
  for (const t of terms) {
    let from = 0;
    for (;;) {
      const i = norm.indexOf(t, from);
      if (i < 0) break;
      out.push([at(i), at(i + t.length - 1) + 1]);
      from = i + t.length;
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

const SNIPPET_BEFORE = 18;
const SNIPPET_LEN = 70;

function snippetOf(text: string, ranges: [number, number][]): { snippet: string; ranges: [number, number][] } {
  const first = ranges[0]?.[0] ?? 0;
  const last = ranges.reduce((m, r) => Math.max(m, r[1]), first);
  // 一致した語がすべて入るなら、まとめて見えるように切り出す（なぜ出たかが分かるように）
  const start =
    last - first <= SNIPPET_LEN - 4
      ? Math.max(0, first - Math.min(SNIPPET_BEFORE, Math.floor((SNIPPET_LEN - (last - first)) / 2)))
      : Math.max(0, first - SNIPPET_BEFORE);
  const end = Math.min(text.length, start + SNIPPET_LEN);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  const shift = head.length - start;
  return {
    snippet: `${head}${text.slice(start, end)}${tail}`,
    ranges: ranges
      .filter(([s, e]) => s >= start && e <= end)
      .map(([s, e]) => [s + shift, e + shift] as [number, number]),
  };
}

/**
 * 検索する。すべての語を、問題文・選択肢・解説のどこかに含む問題を返す（問題文・選択肢での一致を上に）。
 * 一致した語の位置を、結果の切り出しの中で返す
 */
interface Prepared {
  parts: { part: HitPart; text: string; weight: number; n: { norm: string; map: number[] | null } }[];
  all: string;
}
/** 比べるための形は、問題ごとに一度だけ作って覚えておく（2回目からの検索を速くする） */
const prepared = new WeakMap<SearchDoc, Prepared>();
function prepare(d: SearchDoc): Prepared {
  let p = prepared.get(d);
  if (!p) {
    const parts = [
      ...d.q.map((text, i) => ({
        part: (i === 0 || /^[a-e] /.test(text) ? '問題文' : '選択肢') as HitPart,
        text,
        weight: 3,
      })),
      ...d.x.map((text) => ({ part: '解説' as HitPart, text, weight: 1 })),
    ].map((x) => ({ ...x, n: normalizeForSearch(x.text) }));
    p = { parts, all: parts.map((x) => x.n.norm).join('\n') };
    prepared.set(d, p);
  }
  return p;
}

export function searchDocs(docs: readonly SearchDoc[], query: string, limit = 200): SearchHit[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const d of docs) {
    const { parts, all } = prepare(d);
    if (!terms.every((t) => all.includes(t))) continue;
    let best: { part: HitPart; text: string; ranges: [number, number][]; weight: number } | null = null;
    let score = 0;
    for (const p of parts) {
      const r = rangesIn(p.n, terms);
      if (!r.length) continue;
      score += r.length * p.weight;
      // 切り出す部分は、違う語をいちばん多く含む部分（同じなら、問題文・選択肢を優先）
      const kinds = (x: [number, number][], text: string) =>
        new Set(x.map(([s0, e0]) => normalizeForSearch(text.slice(s0, e0)).norm)).size;
      const k = kinds(r, p.text);
      const bk = best ? kinds(best.ranges, best.text) : -1;
      if (
        !best ||
        k > bk ||
        (k === bk && (p.weight > best.weight || (p.weight === best.weight && r.length > best.ranges.length)))
      )
        best = { ...p, ranges: r };
    }
    if (!best) continue;
    hits.push({ id: d.id, score, part: best.part, ...snippetOf(best.text, best.ranges) });
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
