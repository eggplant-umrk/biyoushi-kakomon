import { describe, expect, it } from 'vitest';
import type { Textbook } from '../src/lib/textbooks.ts';
import {
  assign,
  checkIndex,
  checkToc,
  examYearMonth,
  isBeforeFirstEdition,
  mergeIntoRefsFile,
  sectionOfPage,
  sectionRanges,
  stats,
  verify,
  type IndexData,
  type Plan,
  type RefsFile,
  type Toc,
} from './textbook-refs.ts';

/**
 * 教科書の参照を付ける・確かめる道具のテスト。
 * 実在の教科書の目次・索引は使わない（リポジトリに入れないため）。架空の教科書で、仕組みだけを確かめる。
 */
const BOOK: Textbook = {
  bookId: 'sample-1ed-2023',
  title: '架空の教科書',
  edition: '初版',
  year: 2023,
  firstEditionDate: '2023-04-01',
  publisher: '架空の出版社',
  photoDir: 'sample',
  fields: ['law'],
  subject: 'テスト用',
};

const TOC: Toc = {
  lastPage: 39,
  sections: [
    { chapter: '第1編 第1章', section: '第1節', title: 'お金の話', start: 8 },
    { chapter: '第1編 第1章', section: '第2節', title: '税の話', start: 12 },
    { chapter: '第2編 第1章', section: '第1節', title: '年金の話', start: 20 },
    { chapter: '第2編 第1章', section: '第2節', title: '保険の話', start: 30 },
  ],
};

const INDEX: IndexData = { 年金: [20, 22], 保険: [9, 30], 税金: [12, 14] };

// 第54回（2026年9月）は初版より後、第41回（2020年3月）は初版より前
const ctx = {
  examYm: (qid: string) => (qid.startsWith('41-') ? '2020-03' : '2026-09'),
  fieldOf: (qid: string) => (/^(41|54)-(0[1-9]|10)$/.test(qid) ? 'law' : /^(41|54)-\d\d$/.test(qid) ? 'theory' : undefined),
};

describe('目次・索引の一時ファイル', () => {
  it('節のページ範囲は、次の節の開始ページの前まで。最後の節は本文の最後まで', () => {
    expect(sectionRanges(TOC).map((s) => [s.start, s.end])).toEqual([
      [8, 11],
      [12, 19],
      [20, 29],
      [30, 39],
    ]);
    expect(sectionOfPage(TOC, 22)?.title).toBe('年金の話');
    expect(sectionOfPage(TOC, 7)).toBeUndefined();
    expect(sectionOfPage(TOC, 40)).toBeUndefined();
  });

  it('書き写しの誤りらしいものを見つける', () => {
    expect(checkToc(TOC)).toEqual([]);
    expect(checkToc({ ...TOC, sections: [...TOC.sections, { chapter: '第2編 第1章', section: '第3節', title: '戻った', start: 5 }] })).not.toEqual([]);
    expect(checkToc({ ...TOC, sections: [...TOC.sections, TOC.sections[0]!] })).not.toEqual([]);
    expect(checkToc({ lastPage: 0, sections: [] })).not.toEqual([]);
    expect(checkIndex(INDEX, TOC)).toEqual([]);
    expect(checkIndex({ 年金: [200] }, TOC)).not.toEqual([]);
    expect(checkIndex({ 年金: [] }, TOC)).not.toEqual([]);
  });
});

describe('回の実施年月と、教科書の初版', () => {
  it('年度と月から実施年月を求める（1〜3月は翌年）', () => {
    expect(examYearMonth({ examNo: 54, year: '令和8年度', month: 9, questionCount: 55 })).toBe('2026-09');
    expect(examYearMonth({ examNo: 47, year: '令和4年度', month: 3, questionCount: 55 })).toBe('2023-03');
    expect(examYearMonth({ examNo: 41, year: '令和元年度', month: 3, questionCount: 55 })).toBe('2020-03');
  });

  it('初版より前の回かどうか', () => {
    expect(isBeforeFirstEdition(BOOK, '2023-03')).toBe(true);
    expect(isBeforeFirstEdition(BOOK, '2023-09')).toBe(false);
  });
});

describe('assign（割り当てから参照を作る）', () => {
  it('索引の語から：語のページを使い、節は目次で決める。確信度は high', () => {
    const r = assign(BOOK, { '54-08': [{ term: '年金' }] }, { toc: TOC, index: INDEX, ...ctx });
    expect(r.errors).toEqual([]);
    expect(r.refs['54-08']).toEqual([
      { bookId: BOOK.bookId, chapter: '第2編 第1章', section: '第1節', title: '年金の話', page: 20, via: 'index', confidence: 'high' },
    ]);
  });

  it('語のページが複数あるときは、ページを指定できる。索引にないページは使えない', () => {
    const ok = assign(BOOK, { '54-09': [{ term: '保険', page: 30 }] }, { toc: TOC, index: INDEX, ...ctx });
    expect(ok.refs['54-09']?.[0]).toMatchObject({ page: 30, title: '保険の話' });
    const ng = assign(BOOK, { '54-09': [{ term: '保険', page: 31 }] }, { toc: TOC, index: INDEX, ...ctx });
    expect(ng.errors).toHaveLength(1);
    expect(assign(BOOK, { '54-09': [{ term: '存在しない語' }] }, { toc: TOC, index: INDEX, ...ctx }).errors).toHaveLength(1);
  });

  it('索引に語がないときは目次の節から：節の開始ページ、確信度は low', () => {
    const r = assign(BOOK, { '54-08': [{ section: '第1編 第1章/第2節' }] }, { toc: TOC, index: INDEX, ...ctx });
    expect(r.refs['54-08']).toEqual([
      { bookId: BOOK.bookId, chapter: '第1編 第1章', section: '第2節', title: '税の話', page: 12, via: 'toc', confidence: 'low' },
    ]);
    expect(assign(BOOK, { '54-08': [{ section: '第9編/第9節' }] }, { toc: TOC, ...ctx }).errors).toHaveLength(1);
  });

  it('教科書の初版より前の回は、高にしない。割り当てで中に下げることもできる', () => {
    const r = assign(BOOK, { '41-08': [{ term: '年金' }], '54-08': [{ term: '年金', confidence: 'medium' }] }, { toc: TOC, index: INDEX, ...ctx });
    expect(r.refs['41-08']?.[0]?.confidence).toBe('medium');
    expect(r.refs['54-08']?.[0]?.confidence).toBe('medium');
  });

  it('1つの問題に複数の参照、該当なし、対象外の分野', () => {
    const plan: Plan = { '54-09': [{ term: '年金' }, { term: '保険', page: 30 }], '54-07': 'none', '54-41': [{ term: '年金' }], '99-01': 'none' };
    const r = assign(BOOK, plan, { toc: TOC, index: INDEX, ...ctx });
    expect(r.refs['54-09']).toHaveLength(2);
    expect(r.none).toEqual(['54-07']);
    expect(r.errors).toHaveLength(2); // 対象外の分野（54-41）、問題データにない（99-01）
  });

  it('目次だけの教科書：索引の語は使えず、すべて目次からの推定（low）になる', () => {
    const r = assign(BOOK, { '54-08': [{ section: '第2編 第1章/第1節' }] }, { toc: TOC, ...ctx });
    expect(r.refs['54-08']?.[0]).toMatchObject({ via: 'toc', confidence: 'low', page: 20 });
    expect(assign(BOOK, { '54-08': [{ term: '年金' }] }, { toc: TOC, ...ctx }).errors).toHaveLength(1);
  });

  it('索引だけの教科書：節は決めず、索引の語とページだけの参照になる', () => {
    const r = assign(BOOK, { '54-08': [{ term: '年金' }] }, { index: INDEX, ...ctx });
    expect(r.refs['54-08']).toEqual([{ bookId: BOOK.bookId, chapter: '', section: '', title: '年金', page: 20, via: 'index', confidence: 'high' }]);
    expect(assign(BOOK, { '54-08': [{ section: '第2編 第1章/第1節' }] }, { index: INDEX, ...ctx }).errors).toHaveLength(1);
  });
});

describe('mergeIntoRefsFile（教科書ごとに置き換える）', () => {
  it('その教科書の分だけを置き換え、ほかの教科書の参照は残す', () => {
    const other = { bookId: 'other-book', chapter: '第1章', section: '', title: '別の教科書', page: 3, via: 'index' as const, confidence: 'high' as const };
    const before: RefsFile = { refs: { '54-08': [other, { ...other, bookId: BOOK.bookId, page: 99 }] }, none: { 'other-book': ['54-01'], [BOOK.bookId]: ['54-02'] } };
    const result = assign(BOOK, { '54-08': [{ term: '年金' }], '54-07': 'none' }, { toc: TOC, index: INDEX, ...ctx });
    const after = mergeIntoRefsFile(before, BOOK.bookId, result);
    expect(after.refs['54-08']?.map((r) => [r.bookId, r.page])).toEqual([
      ['other-book', 3],
      [BOOK.bookId, 20],
    ]);
    expect(after.none).toEqual({ 'other-book': ['54-01'], [BOOK.bookId]: ['54-07'] });
  });
});

describe('verify（参照を確かめる）', () => {
  const plan: Plan = { '54-08': [{ term: '年金' }], '54-09': [{ section: '第1編 第1章/第2節' }], '54-07': 'none' };
  const file = mergeIntoRefsFile({ refs: {}, none: {} }, BOOK.bookId, assign(BOOK, plan, { toc: TOC, index: INDEX, ...ctx }));
  const opts = { toc: TOC, index: INDEX, plan, ...ctx };
  const tweak = (fn: (f: RefsFile) => void): RefsFile => {
    const copy = JSON.parse(JSON.stringify(file)) as RefsFile;
    fn(copy);
    return copy;
  };

  it('作ったままの参照は通る', () => {
    expect(verify(file, BOOK, opts)).toEqual([]);
    expect(stats(file, BOOK.bookId)).toMatchObject({ questions: 2, refs: 2, high: 1, low: 1, viaIndex: 1, viaToc: 1, none: 1 });
  });

  it('ページが節の範囲に入っていなければエラー', () => {
    const errs = verify(tweak((f) => (f.refs['54-08']![0]!.page = 31)), BOOK, opts);
    expect(errs.some((e) => e.includes('節の範囲'))).toBe(true);
  });

  it('索引から引いた参照のページが、索引に載っていなければエラー', () => {
    // p.21 は「年金の話」の節の範囲内だが、索引のどの語にも載っていない
    const errs = verify(tweak((f) => (f.refs['54-08']![0]!.page = 21)), BOOK, opts);
    expect(errs.some((e) => e.includes('索引'))).toBe(true);
  });

  it('索引には載っているが、割り当てた語のページではなければエラー', () => {
    // p.30 は索引の「保険」にはあるが、この問題に割り当てた「年金」にはない
    const bad = tweak((f) => Object.assign(f.refs['54-08']![0]!, { page: 30, section: '第2節', title: '保険の話' }));
    expect(verify(bad, BOOK, opts).some((e) => e.includes('割り当てた索引の語'))).toBe(true);
  });

  it('節の見出しが目次と違う、目次にない節、はエラー', () => {
    expect(verify(tweak((f) => (f.refs['54-08']![0]!.title = '年金のはなし')), BOOK, opts)).not.toEqual([]);
    expect(verify(tweak((f) => (f.refs['54-08']![0]!.section = '第9節')), BOOK, opts)).not.toEqual([]);
  });

  it('目次から推定した参照は、節の開始ページ・確信度 low でなければエラー', () => {
    expect(verify(tweak((f) => (f.refs['54-09']![0]!.page = 13)), BOOK, opts)).not.toEqual([]);
    expect(verify(tweak((f) => (f.refs['54-09']![0]!.confidence = 'medium')), BOOK, opts)).not.toEqual([]);
  });

  it('初版より前の回が高、対象外の分野、参照と該当なしの両方にある、同じ参照が2つ、はエラー', () => {
    expect(verify(tweak((f) => (f.refs['41-08'] = [{ ...f.refs['54-08']![0]! }])), BOOK, opts)).not.toEqual([]);
    expect(verify(tweak((f) => (f.refs['54-41'] = [{ ...f.refs['54-08']![0]! }])), BOOK, opts)).not.toEqual([]);
    expect(verify(tweak((f) => f.none[BOOK.bookId]!.push('54-08')), BOOK, opts)).not.toEqual([]);
    expect(verify(tweak((f) => f.refs['54-08']!.push({ ...f.refs['54-08']![0]! })), BOOK, opts)).not.toEqual([]);
  });

  it('目次・索引のファイルがなくても、決まり（確信度・分野）は確かめられる', () => {
    expect(verify(file, BOOK, ctx)).toEqual([]);
    // 索引だけを渡して確かめるときは、目次からの推定は確かめられないと知らせる
    expect(verify(file, BOOK, { index: INDEX, requireToc: true, ...ctx }).some((e) => e.includes('目次のファイルがない'))).toBe(true);
    const indexOnly = mergeIntoRefsFile({ refs: {}, none: {} }, BOOK.bookId, assign(BOOK, { '54-08': [{ term: '年金' }] }, { index: INDEX, ...ctx }));
    expect(verify(indexOnly, BOOK, ctx)).toEqual([]);
    expect(verify(indexOnly, BOOK, { index: INDEX, ...ctx })).toEqual([]);
  });
});
