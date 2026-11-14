// 教科書の登録は data-src/textbooks.json にある（教科書を足すときは、この設定に1件足すだけ。コードは変えない）。
// scripts（Node で直接実行）からも読み込むので、JSON であることを明示する
import registry from '../../data-src/textbooks.json' with { type: 'json' };
import type { FieldId, TextbookRef } from './types';

/**
 * 教科書の一覧（SPEC §14）。
 *
 * 教科書の本文・目次・索引は持たない。持つのは、教科書の書名などの登録（data-src/textbooks.json）と、
 * 問題ごとの参照先（節の見出しとページ。data-src/textbook-refs.json）だけ。
 * ページは版によってずれるので、bookId に版と発行年を含め、画面では「第2版の場合」と添える。
 */
export interface Textbook {
  /** 教科書と版を表すID（例: unei-2ed-2024）。問題の参照（textbookRefs）がこの値を持つ */
  bookId: string;
  title: string;
  edition: string;
  /** この版の発行年（西暦） */
  year: number;
  /** 初版の発行日（YYYY-MM-DD）。これより前に実施された回の問題は、参照の確信度を高にしない */
  firstEditionDate: string;
  publisher: string;
  /** 写真を置くフォルダ名（textbook-src/ の下。コミットしない） */
  photoDir: string;
  /** この教科書が対象にする分野（問題の fieldId）。ここにない分野の問題には参照を付けられない */
  fields: FieldId[];
  /** 対象の科目の説明（人が読むためのもの） */
  subject: string;
}

export const BOOKS: readonly Textbook[] = registry as Textbook[];

export function bookOf(bookId: string): Textbook | undefined {
  return BOOKS.find((b) => b.bookId === bookId);
}

/** 「運営管理 第2版 第2編2章3節 p.68」のような1行。教科書が一覧にないときは null */
export function textbookLine(ref: TextbookRef): string | null {
  const book = bookOf(ref.bookId);
  if (!book) return null;
  // 「第2編 第2章」「第3節」→「第2編2章3節」（短く表示する）
  const place = `${ref.chapter}${ref.section}`
    .replace(/\s+/g, '')
    .replace(/(?<=[編章])第(?=[0-9０-９]+[章節])/g, '');
  // 目次のない教科書の参照は、章・節がない（ページだけ）
  return [book.title, book.edition, place, `p.${ref.page}`].filter(Boolean).join(' ');
}
