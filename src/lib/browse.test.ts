import { expect, test } from 'vitest';
import { activeFilterCount, EMPTY_FILTER, matchesFilter } from './browse';
import type { BrowseItem } from './searchIndex';

const item = (o: Partial<BrowseItem> = {}): BrowseItem => ({ id: '54-01', e: 54, n: 1, f: 'law', s: '', c: 'high', ...o });
const ctx = { marks: new Set(['54-01']), memos: new Set<string>(), wrong: new Set(['53-02']) };

test('閲覧モードの絞り込み：回・分野・要復習・間違えた問題・メモ・確信度', () => {
  expect(matchesFilter(item(), EMPTY_FILTER, ctx)).toBe(true);
  expect(matchesFilter(item(), { ...EMPTY_FILTER, exams: [53] }, ctx)).toBe(false);
  expect(matchesFilter(item(), { ...EMPTY_FILTER, field: 'skin' }, ctx)).toBe(false);
  expect(matchesFilter(item(), { ...EMPTY_FILTER, reviewOnly: true }, ctx)).toBe(true);
  expect(matchesFilter(item({ id: '54-02' }), { ...EMPTY_FILTER, reviewOnly: true }, ctx)).toBe(false);
  expect(matchesFilter(item({ id: '53-02', e: 53 }), { ...EMPTY_FILTER, wrongOnly: true }, ctx)).toBe(true);
  expect(matchesFilter(item(), { ...EMPTY_FILTER, wrongOnly: true }, ctx)).toBe(false);
  expect(matchesFilter(item(), { ...EMPTY_FILTER, memoOnly: true }, ctx)).toBe(false);
  expect(matchesFilter(item({ c: 'low' }), { ...EMPTY_FILTER, confidence: 'low' }, ctx)).toBe(true);
  expect(matchesFilter(item({ c: null }), { ...EMPTY_FILTER, confidence: 'high' }, ctx)).toBe(false);
});

test('使っている絞り込みの数（検索語は数えない）', () => {
  expect(activeFilterCount({ ...EMPTY_FILTER, query: 'x' })).toBe(0);
  expect(activeFilterCount({ ...EMPTY_FILTER, exams: [54, 53], reviewOnly: true, confidence: 'low' })).toBe(3);
});
