import { useSyncExternalStore } from 'react';
import type { BrowseItem, Confidence, SearchDoc } from './searchIndex';
import type { FieldId } from './types';

const base = import.meta.env.BASE_URL;

let browseP: Promise<BrowseItem[]> | null = null;
let searchP: Promise<SearchDoc[]> | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} の読み込みに失敗しました（${res.status}）`);
  return (await res.json()) as T;
}

/** 閲覧モードの一覧（全770問の冒頭だけ。約18KB） */
export function loadBrowse(): Promise<BrowseItem[]> {
  browseP ??= getJson<BrowseItem[]>('data/browse.json').catch((e: unknown) => {
    browseP = null;
    throw e;
  });
  return browseP;
}

/** 検索の索引（問題文・選択肢・解説。約300KB）。検索語を入れたときに初めて読み込む */
export function loadSearch(): Promise<SearchDoc[]> {
  searchP ??= getJson<SearchDoc[]>('data/search.json').catch((e: unknown) => {
    searchP = null;
    throw e;
  });
  return searchP;
}

/** 閲覧モードの絞り込み。問題を開いて戻ったときも残す（このタブの間だけ） */
export interface BrowseFilter {
  query: string;
  /** 空＝すべての回 */
  exams: number[];
  /** null＝すべての分野 */
  field: FieldId | null;
  reviewOnly: boolean;
  wrongOnly: boolean;
  memoOnly: boolean;
  confidence: Confidence | 'all';
}

export const EMPTY_FILTER: BrowseFilter = {
  query: '',
  exams: [],
  field: null,
  reviewOnly: false,
  wrongOnly: false,
  memoOnly: false,
  confidence: 'all',
};

let filter: BrowseFilter = EMPTY_FILTER;
/** 一覧のスクロール位置（問題を開いて戻ったときに戻す） */
export let browseScrollY = 0;
const listeners = new Set<() => void>();

export function setBrowseFilter(patch: Partial<BrowseFilter>): void {
  filter = { ...filter, ...patch };
  listeners.forEach((l) => l());
}
export function rememberBrowseScroll(y: number): void {
  browseScrollY = y;
}

export function useBrowseFilter(): BrowseFilter {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => filter,
    () => filter,
  );
}

export function activeFilterCount(f: BrowseFilter): number {
  return (
    (f.exams.length ? 1 : 0) +
    (f.field ? 1 : 0) +
    (f.reviewOnly ? 1 : 0) +
    (f.wrongOnly ? 1 : 0) +
    (f.memoOnly ? 1 : 0) +
    (f.confidence !== 'all' ? 1 : 0)
  );
}

/** 絞り込み（検索語以外）に合う問題か */
export function matchesFilter(
  item: BrowseItem,
  f: BrowseFilter,
  ctx: { marks: ReadonlySet<string>; memos: ReadonlySet<string>; wrong: ReadonlySet<string> },
): boolean {
  if (f.exams.length && !f.exams.includes(item.e)) return false;
  if (f.field && item.f !== f.field) return false;
  if (f.reviewOnly && !ctx.marks.has(item.id)) return false;
  if (f.wrongOnly && !ctx.wrong.has(item.id)) return false;
  if (f.memoOnly && !ctx.memos.has(item.id)) return false;
  if (f.confidence !== 'all' && item.c !== f.confidence) return false;
  return true;
}
