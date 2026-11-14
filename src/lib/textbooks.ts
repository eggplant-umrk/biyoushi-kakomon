import type { TextbookRef } from './types';

/**
 * 教科書の一覧（SPEC §14）。
 *
 * 教科書の本文・目次・索引は持たない。持つのは、問題ごとの参照先（節の見出しとページ）だけ。
 * ページは版によってずれるので、bookId に版と発行年を含め、画面では「第2版の場合」と添える。
 */
export interface Textbook {
  title: string;
  edition: string;
  publisher: string;
  /** 発行年（西暦） */
  year: number;
}

export const BOOKS: Readonly<Record<string, Textbook>> = {
  // 2024年4月1日 第2版第1刷
  'unei-2ed-2024': { title: '運営管理', edition: '第2版', publisher: '日本理容美容教育センター', year: 2024 },
};

export function bookOf(bookId: string): Textbook | undefined {
  return Object.hasOwn(BOOKS, bookId) ? BOOKS[bookId] : undefined;
}

/** 「運営管理 第2版 第2編2章3節 p.68」のような1行。教科書が一覧にないときは null */
export function textbookLine(ref: TextbookRef): string | null {
  const book = bookOf(ref.bookId);
  if (!book) return null;
  // 「第2編 第2章」「第3節」→「第2編2章3節」（短く表示する）
  const place = `${ref.chapter}${ref.section}`
    .replace(/\s+/g, '')
    .replace(/(?<=[編章])第(?=[0-9０-９]+[章節])/g, '');
  return `${book.title} ${book.edition} ${place} p.${ref.page}`;
}
