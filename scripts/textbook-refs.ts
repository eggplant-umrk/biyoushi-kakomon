/**
 * 教科書の参照（問題 → 教科書の節とページ）を付ける・確かめる道具（SPEC §14、手順は docs/textbook-howto.md）。
 *
 * 教科書の本文、目次・索引の全文は、リポジトリに入れない。この道具は、目次・索引を書き写した**一時ファイル**
 * （コミットしない場所に置き、作業が終わったら消す）を読んで、問題ごとの参照（節の見出しとページ）だけを
 * data-src/textbook-refs.json に書く。どの教科書も同じ手順・同じ仕組みで扱う（教科書の登録は data-src/textbooks.json）。
 *
 * 使い方:
 *   node scripts/textbook-refs.ts targets <bookId>
 *       その教科書が対象にする分野の問題を一覧にする（どの問題に参照を付けるかを決めるため）
 *   node scripts/textbook-refs.ts assign <bookId> --plan plan.json [--toc toc.json] [--index index.json]
 *       割り当て（plan.json）から参照を作り、data-src/textbook-refs.json のその教科書の分を置き換える
 *   node scripts/textbook-refs.ts verify [<bookId>] [--toc toc.json] [--index index.json] [--plan plan.json]
 *       参照を確かめる（ページが節の範囲に入っているか、索引にそのページが載っているか、など）
 *   node scripts/textbook-refs.ts stats
 *       教科書ごとの件数（参照あり・確信度の内訳・該当なし）
 *
 * 一時ファイルの形:
 *   toc.json   { "lastPage": 157, "sections": [{ "chapter": "第2編 第2章", "section": "第2節", "title": "…", "start": 64 }, …] }
 *              lastPage は本文の最後のページ（索引の前のページ）。節のない章は section を "" にする
 *   index.json { "国民年金": [64, 66], … }   索引の語とページ
 *   plan.json  { "54-08": [{ "term": "国民年金" }], "53-07": "none", "43-08": [{ "section": "第1編 第3章/第5節" }] }
 *              term＝索引の語（page を省くと、その語の最初のページ）。section＝目次の節（索引に語がないとき。確信度は low になる）
 *              "none"＝調べたが、対応する内容がない。confidence に "medium" を書くと、高を中に下げられる
 * 目次だけ・索引だけの教科書でも動く：目次がなければ節は決めず（索引の語とページだけの参照になる）、
 * 索引がなければ、すべて目次からの推定（確信度 low）になる。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bookOf, BOOKS, type Textbook } from '../src/lib/textbooks.ts';
import type { ExamFile, ExamMeta, Question, TextbookRef } from '../src/lib/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface TocSection {
  chapter: string;
  section: string;
  title: string;
  start: number;
}
export interface Toc {
  lastPage: number;
  sections: TocSection[];
}
export type IndexData = Record<string, number[]>;
export interface PlanItem {
  term?: string;
  page?: number;
  /** 目次の節。"章/節"（例: "第1編 第3章/第5節"）。節のない章は "章/" */
  section?: string;
  confidence?: 'high' | 'medium' | 'low';
}
export type Plan = Record<string, 'none' | PlanItem[]>;

/** data-src/textbook-refs.json の形。refs＝問題ごとの参照、none＝教科書ごとの「調べたが該当なし」の問題 */
export interface RefsFile {
  refs: Record<string, TextbookRef[]>;
  none: Record<string, string[]>;
}

export const REFS_PATH = join(root, 'data-src', 'textbook-refs.json');

export function loadRefsFile(path = REFS_PATH): RefsFile {
  if (!existsSync(path)) return { refs: {}, none: {} };
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<RefsFile>;
  return { refs: raw.refs ?? {}, none: raw.none ?? {} };
}

const sectionKey = (s: { chapter: string; section: string }) => `${s.chapter}/${s.section}`;
const byQid = (a: string, b: string) => {
  const [ea, na] = a.split('-').map(Number);
  const [eb, nb] = b.split('-').map(Number);
  return (eb ?? 0) - (ea ?? 0) || (na ?? 0) - (nb ?? 0);
};

/** 目次の節ごとのページ範囲（開始ページ〜次の節の開始ページの前。最後の節は lastPage まで） */
export function sectionRanges(toc: Toc): (TocSection & { end: number })[] {
  const sorted = [...toc.sections].sort((a, b) => a.start - b.start);
  return sorted.map((s, i) => ({ ...s, end: (sorted[i + 1]?.start ?? toc.lastPage + 1) - 1 }));
}

export function sectionOfPage(toc: Toc, page: number): (TocSection & { end: number }) | undefined {
  return sectionRanges(toc).find((s) => page >= s.start && page <= s.end);
}

/** 目次・索引の一時ファイルの形を確かめる。問題なければ空配列 */
export function checkToc(toc: Toc): string[] {
  const errs: string[] = [];
  if (!Number.isInteger(toc.lastPage) || toc.lastPage < 1) errs.push('目次: lastPage（本文の最後のページ）がない');
  if (!Array.isArray(toc.sections) || toc.sections.length === 0) return [...errs, '目次: sections が空'];
  const keys = new Set<string>();
  let prev = 0;
  for (const s of toc.sections) {
    if (!s.chapter?.trim() || !s.title?.trim() || typeof s.section !== 'string') errs.push(`目次: 章・見出しが空の節がある（${JSON.stringify(s)}）`);
    if (!Number.isInteger(s.start) || s.start < 1) errs.push(`目次: 開始ページが不正（${sectionKey(s)}）`);
    if (s.start < prev) errs.push(`目次: 開始ページが前の節より小さい（${sectionKey(s)} p.${s.start}）。書き写しの誤りの可能性`);
    prev = s.start;
    if (keys.has(sectionKey(s))) errs.push(`目次: 同じ章・節が2回ある（${sectionKey(s)}）`);
    keys.add(sectionKey(s));
    if (s.start > toc.lastPage) errs.push(`目次: 開始ページが lastPage より大きい（${sectionKey(s)}）`);
  }
  return errs;
}

export function checkIndex(index: IndexData, toc?: Toc): string[] {
  const errs: string[] = [];
  for (const [term, pages] of Object.entries(index)) {
    if (!Array.isArray(pages) || pages.length === 0 || pages.some((p) => !Number.isInteger(p) || p < 1)) errs.push(`索引: 「${term}」のページが不正`);
    else if (toc && pages.some((p) => p > toc.lastPage)) errs.push(`索引: 「${term}」のページが本文の最後（p.${toc.lastPage}）を超えている。書き写しの誤りの可能性`);
  }
  return errs;
}

/** 回の実施年月（YYYY-MM）。exams.json の「令和8年度」と月から求める（1〜3月は翌年） */
export function examYearMonth(meta: ExamMeta): string {
  const m = /令和(\d+|元)年度/.exec(meta.year);
  if (!m) throw new Error(`年度を読めません: ${meta.year}`);
  const fiscal = 2018 + (m[1] === '元' ? 1 : Number(m[1]));
  const year = meta.month <= 3 ? fiscal + 1 : fiscal;
  return `${year}-${String(meta.month).padStart(2, '0')}`;
}

/** その回が、教科書の初版より前に実施されたか（問題が、この教科書より前の内容に基づいている） */
export function isBeforeFirstEdition(book: Textbook, examYm: string): boolean {
  return examYm < book.firstEditionDate.slice(0, 7);
}

export interface AssignResult {
  refs: Record<string, TextbookRef[]>;
  none: string[];
  errors: string[];
}

/**
 * 割り当てから参照を作る。
 *   - 索引の語から：その語のページ（page を省けば最初のページ）を使い、ページから節を目次で決める。確信度は high
 *     （plan で medium に下げられる。教科書の初版より前の回は、高にせず medium にする）
 *   - 目次の節から（索引に語がない）：節の開始ページを使い、確信度は low
 */
export function assign(
  book: Textbook,
  plan: Plan,
  opts: { toc?: Toc; index?: IndexData; examYm: (qid: string) => string | undefined; fieldOf: (qid: string) => string | undefined },
): AssignResult {
  const { toc, index } = opts;
  const out: AssignResult = { refs: {}, none: [], errors: [] };
  for (const [qid, entry] of Object.entries(plan)) {
    const field = opts.fieldOf(qid);
    if (!field) {
      out.errors.push(`${qid}: 問題データにない`);
      continue;
    }
    if (!book.fields.includes(field as Textbook['fields'][number])) {
      out.errors.push(`${qid}: この教科書の対象の分野ではない（${field}）`);
      continue;
    }
    if (entry === 'none') {
      out.none.push(qid);
      continue;
    }
    const refs: TextbookRef[] = [];
    for (const item of entry) {
      if (item.term !== undefined) {
        if (!index) {
          out.errors.push(`${qid}: 索引のファイルがないのに、索引の語（${item.term}）が指定されている`);
          continue;
        }
        const pages = index[item.term];
        if (!pages) {
          out.errors.push(`${qid}: 索引に「${item.term}」がない`);
          continue;
        }
        const page = item.page ?? pages[0]!;
        if (!pages.includes(page)) {
          out.errors.push(`${qid}: 索引の「${item.term}」に p.${page} は載っていない（${pages.join(', ')}）`);
          continue;
        }
        const sec = toc ? sectionOfPage(toc, page) : undefined;
        if (toc && !sec) {
          out.errors.push(`${qid}: p.${page} が、目次のどの節の範囲にも入らない`);
          continue;
        }
        let confidence: TextbookRef['confidence'] = item.confidence ?? 'high';
        const ym = opts.examYm(qid);
        if (confidence === 'high' && ym && isBeforeFirstEdition(book, ym)) confidence = 'medium';
        // 目次がない教科書は節を決められないので、索引の語を見出しの代わりにする
        refs.push({ bookId: book.bookId, chapter: sec?.chapter ?? '', section: sec?.section ?? '', title: sec?.title ?? item.term, page, via: 'index', confidence });
      } else if (item.section !== undefined) {
        if (!toc) {
          out.errors.push(`${qid}: 目次のファイルがないのに、節（${item.section}）が指定されている`);
          continue;
        }
        const sec = sectionRanges(toc).find((s) => sectionKey(s) === item.section);
        if (!sec) {
          out.errors.push(`${qid}: 目次に「${item.section}」がない（"章/節" の形で書く）`);
          continue;
        }
        refs.push({ bookId: book.bookId, chapter: sec.chapter, section: sec.section, title: sec.title, page: sec.start, via: 'toc', confidence: 'low' });
      } else out.errors.push(`${qid}: term（索引の語）か section（目次の節）のどちらかが必要`);
    }
    if (refs.length) out.refs[qid] = refs;
  }
  return out;
}

/** 参照を data-src/textbook-refs.json の形に入れる：その教科書の分だけを置き換え、ほかの教科書の参照は残す */
export function mergeIntoRefsFile(file: RefsFile, bookId: string, result: AssignResult): RefsFile {
  const refs: Record<string, TextbookRef[]> = {};
  const ids = new Set([...Object.keys(file.refs), ...Object.keys(result.refs)]);
  for (const qid of [...ids].sort(byQid)) {
    const others = (file.refs[qid] ?? []).filter((r) => r.bookId !== bookId);
    const merged = [...others, ...(result.refs[qid] ?? [])];
    if (merged.length) refs[qid] = merged;
  }
  const none = { ...file.none };
  if (result.none.length) none[bookId] = [...result.none].sort(byQid);
  else delete none[bookId];
  return { refs, none };
}

export interface VerifyOptions {
  toc?: Toc;
  index?: IndexData;
  plan?: Plan;
  /** 目次のファイルがないときに、目次から推定した参照を「確かめられない」というエラーにする（索引だけを渡して確かめるとき） */
  requireToc?: boolean;
  examYm: (qid: string) => string | undefined;
  fieldOf: (qid: string) => string | undefined;
}

/** 参照を確かめる。問題なければ空配列。目次・索引・割り当てのファイルがあれば、それとも突き合わせる */
export function verify(file: RefsFile, book: Textbook, opts: VerifyOptions): string[] {
  const errs: string[] = [];
  const { toc, index, plan } = opts;
  const ranges = toc ? sectionRanges(toc) : [];
  const indexPages = index ? new Set(Object.values(index).flat()) : undefined;
  for (const [qid, all] of Object.entries(file.refs)) {
    const refs = all.filter((r) => r.bookId === book.bookId);
    if (refs.length === 0) continue;
    const field = opts.fieldOf(qid);
    if (!field) errs.push(`${qid}: 問題データにない`);
    else if (!book.fields.includes(field as Textbook['fields'][number])) errs.push(`${qid}: この教科書の対象の分野ではない（${field}）`);
    if ((file.none[book.bookId] ?? []).includes(qid)) errs.push(`${qid}: 参照があるのに「該当なし」にも入っている`);
    const seen = new Set<string>();
    refs.forEach((r, i) => {
      const at = `${qid}[${i}] p.${r.page}`;
      const dup = `${r.chapter}/${r.section}/${r.page}`;
      if (seen.has(dup)) errs.push(`${at}: 同じ参照が2つある`);
      seen.add(dup);
      if (r.via === 'toc' && r.confidence !== 'low') errs.push(`${at}: 目次から推定した参照なのに、確信度が low ではない`);
      const ym = opts.examYm(qid);
      if (r.confidence === 'high' && ym && isBeforeFirstEdition(book, ym)) errs.push(`${at}: 教科書の初版（${book.firstEditionDate}）より前の回（${ym}）なのに、確信度が high`);
      if (toc) {
        if (r.chapter === '') errs.push(`${at}: 目次があるのに、章が空`);
        else {
          const sec = ranges.find((s) => s.chapter === r.chapter && s.section === r.section);
          if (!sec) errs.push(`${at}: 目次に「${r.chapter} ${r.section}」がない`);
          else {
            if (sec.title !== r.title) errs.push(`${at}: 節の見出しが目次と違う（参照: ${r.title}／目次: ${sec.title}）`);
            if (r.page < sec.start || r.page > sec.end) errs.push(`${at}: ページが節の範囲（p.${sec.start}〜${sec.end}）に入っていない`);
            if (r.via === 'toc' && r.page !== sec.start) errs.push(`${at}: 目次から推定した参照のページが、節の開始ページ（p.${sec.start}）ではない`);
          }
        }
      } else if (r.via === 'toc' && opts.requireToc) errs.push(`${at}: 目次のファイルがないので、目次から推定した参照を確かめられない`);
      if (r.via === 'index') {
        if (indexPages && !indexPages.has(r.page)) errs.push(`${at}: 索引のどの語にも、このページが載っていない`);
        if (index && plan) {
          const entry = plan[qid];
          const terms = Array.isArray(entry) ? entry.filter((p) => p.term !== undefined).map((p) => p.term!) : [];
          if (!terms.some((t) => (index[t] ?? []).includes(r.page))) errs.push(`${at}: 割り当てた索引の語（${terms.join('、') || 'なし'}）に、このページが載っていない`);
        }
      }
    });
  }
  for (const qid of file.none[book.bookId] ?? []) {
    const field = opts.fieldOf(qid);
    if (!field) errs.push(`${qid}（該当なし）: 問題データにない`);
    else if (!book.fields.includes(field as Textbook['fields'][number])) errs.push(`${qid}（該当なし）: この教科書の対象の分野ではない`);
  }
  return errs;
}

export function stats(file: RefsFile, bookId: string) {
  const refs = Object.values(file.refs)
    .flat()
    .filter((r) => r.bookId === bookId);
  const questions = Object.entries(file.refs).filter(([, rs]) => rs.some((r) => r.bookId === bookId)).length;
  const count = (f: (r: TextbookRef) => boolean) => refs.filter(f).length;
  return {
    questions,
    refs: refs.length,
    high: count((r) => r.confidence === 'high'),
    medium: count((r) => r.confidence === 'medium'),
    low: count((r) => r.confidence === 'low'),
    viaIndex: count((r) => r.via === 'index'),
    viaToc: count((r) => r.via === 'toc'),
    none: (file.none[bookId] ?? []).length,
  };
}

// ---- コマンド ----------------------------------------------------------------

function loadQuestions(): { questions: Map<string, Question>; ym: Map<number, string> } {
  const dataDir = join(root, 'public', 'data');
  const metas = JSON.parse(readFileSync(join(dataDir, 'exams.json'), 'utf8')) as ExamMeta[];
  const questions = new Map<string, Question>();
  const ym = new Map<number, string>();
  for (const meta of metas) {
    ym.set(meta.examNo, examYearMonth(meta));
    const file = JSON.parse(readFileSync(join(dataDir, `exam-${meta.examNo}.json`), 'utf8')) as ExamFile;
    for (const q of file.questions) questions.set(q.id, q);
  }
  return { questions, ym };
}

function readJson<T>(path: string | undefined): T | undefined {
  return path ? (JSON.parse(readFileSync(path, 'utf8')) as T) : undefined;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const positional = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1] ?? '').startsWith('--'));
  const { questions, ym } = loadQuestions();
  const ctx = {
    examYm: (qid: string) => ym.get(Number(qid.split('-')[0])),
    fieldOf: (qid: string) => questions.get(qid)?.fieldId,
  };
  const needBook = (): Textbook => {
    const book = bookOf(positional[0] ?? '');
    if (!book) throw new Error(`教科書が登録されていません: ${positional[0] ?? '（指定なし）'}。登録は data-src/textbooks.json（登録済み: ${BOOKS.map((b) => b.bookId).join(', ')}）`);
    return book;
  };
  const toc = readJson<Toc>(flag('toc'));
  const index = readJson<IndexData>(flag('index'));
  const plan = readJson<Plan>(flag('plan'));
  const inputErrors = [...(toc ? checkToc(toc) : []), ...(index ? checkIndex(index, toc) : [])];
  if (inputErrors.length) {
    for (const e of inputErrors) console.error(`  - ${e}`);
    return 1;
  }

  if (cmd === 'targets') {
    const book = needBook();
    const file = loadRefsFile();
    const list = [...questions.values()].filter((q) => book.fields.includes(q.fieldId)).sort((a, b) => byQid(a.id, b.id));
    for (const q of list) {
      const state = (file.refs[q.id] ?? []).some((r) => r.bookId === book.bookId) ? '参照あり' : (file.none[book.bookId] ?? []).includes(q.id) ? '該当なし' : '未確認';
      console.log(`${q.id}\t${ctx.examYm(q.id)}\t${state}\t${q.stem.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
    console.log(`${book.title} ${book.edition}：対象の分野（${book.fields.join(', ')}）の問題 ${list.length}問。写真は textbook-src/${book.photoDir}/`);
    return 0;
  }

  if (cmd === 'assign') {
    const book = needBook();
    if (!plan) throw new Error('--plan が必要です');
    if (!toc && !index) throw new Error('--toc か --index の少なくとも一方が必要です');
    const result = assign(book, plan, { toc, index, ...ctx });
    if (result.errors.length) {
      console.error(`割り当てのエラー ${result.errors.length}件（何も書き込んでいません）`);
      for (const e of result.errors) console.error(`  - ${e}`);
      return 1;
    }
    const merged = mergeIntoRefsFile(loadRefsFile(), book.bookId, result);
    const errs = verify(merged, book, { toc, index, plan, ...ctx });
    if (errs.length) {
      console.error(`検証エラー ${errs.length}件（何も書き込んでいません）`);
      for (const e of errs) console.error(`  - ${e}`);
      return 1;
    }
    writeFileSync(REFS_PATH, JSON.stringify(merged, null, 2) + '\n');
    console.log(`${book.title} ${book.edition}: ${JSON.stringify(stats(merged, book.bookId))}`);
    console.log('data-src/textbook-refs.json を書きました。node scripts/build-data.ts で問題データに反映してください');
    return 0;
  }

  if (cmd === 'verify') {
    const file = loadRefsFile();
    const books = positional[0] ? [needBook()] : [...BOOKS];
    let bad = 0;
    for (const book of books) {
      const one = positional[0] !== undefined;
      const errs = verify(file, book, { toc: one ? toc : undefined, index: one ? index : undefined, plan: one ? plan : undefined, requireToc: one && !toc && (index !== undefined || plan !== undefined), ...ctx });
      const what = [positional[0] && toc ? '節のページ範囲' : null, positional[0] && index ? '索引のページ' : null].filter(Boolean).join('・') || '形式・分野・確信度の決まりだけ（目次・索引のファイルなし）';
      console.log(`${book.title} ${book.edition}（${what}）: ${errs.length ? `エラー ${errs.length}件` : 'OK'} ${JSON.stringify(stats(file, book.bookId))}`);
      for (const e of errs) console.error(`  - ${e}`);
      bad += errs.length;
    }
    const unknown = Object.entries(file.refs).flatMap(([qid, rs]) => rs.filter((r) => !bookOf(r.bookId)).map((r) => `${qid}: 登録されていない教科書 ${r.bookId}`));
    for (const e of unknown) console.error(`  - ${e}`);
    return bad + unknown.length ? 1 : 0;
  }

  if (cmd === 'stats') {
    const file = loadRefsFile();
    for (const book of BOOKS) {
      const photos = join(root, 'textbook-src', book.photoDir);
      const n = existsSync(photos) ? readdirSync(photos).length : 0;
      console.log(`${book.bookId}\t${book.title} ${book.edition}\t${JSON.stringify(stats(file, book.bookId))}\t写真 ${n}枚（textbook-src/${book.photoDir}/）`);
    }
    return 0;
  }

  console.error('使い方: node scripts/textbook-refs.ts targets|assign|verify|stats …（このファイルの先頭の説明を参照）');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
