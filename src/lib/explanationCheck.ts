// scripts（Node で直接実行）からも読み込むので、拡張子まで書く
import { bookOf } from './textbooks.ts';
import type { Explanation, Question, TextbookRef } from './types';

/**
 * 解説（SPEC §6.7.5）と教科書の参照（§14）の形式チェック。問題なければ空配列。
 * scripts/validate.ts と scripts/build-data.ts から使う（アプリの画面からは使わない）。
 */

const SOURCE_TYPES = ['law', 'gov', 'academic', 'edu', 'site'];
const LEVELS = ['high', 'medium', 'low'];
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const hasTag = (v: string) => /<[a-z/]/i.test(v);

export function checkExplanation(q: Question): string[] {
  const ex = q.explanation as Partial<Explanation> | null;
  if (ex === null) return [];
  if (typeof ex !== 'object') return ['explanation が不正'];
  const errs: string[] = [];
  const texts: string[] = [];

  if (!isText(ex.summary)) errs.push('summary が空');
  else texts.push(ex.summary);

  if (!Array.isArray(ex.perChoice) || ex.perChoice.length !== 4 || !ex.perChoice.every(isText)) errs.push('perChoice が4つではない（空を含む）');
  else texts.push(...ex.perChoice);

  if (ex.perStatement !== null) {
    if (!Array.isArray(ex.perStatement) || !ex.perStatement.every(isText)) errs.push('perStatement が不正');
    else if (ex.perStatement.length !== (q.statements?.length ?? 0)) errs.push('perStatement の数が記述（a〜）の数と違う');
    else texts.push(...ex.perStatement);
  }

  if (!Array.isArray(ex.traps) || !ex.traps.every(isText)) errs.push('traps が不正');
  else {
    // 強調する語句は、問題の選択肢・記述にそのまま出てくる語句にする（出てこない語句は強調されない）
    const body = [...q.choices, ...(q.statements ?? []).map((s) => s.text)].join('\n');
    for (const t of ex.traps) if (!body.includes(t)) errs.push(`traps の語句が選択肢・記述にない: ${t}`);
  }

  if (ex.keyPoint !== null) {
    if (!isText(ex.keyPoint)) errs.push('keyPoint が不正');
    else texts.push(ex.keyPoint);
  }

  if (!Array.isArray(ex.sources)) errs.push('sources が配列ではない');
  else {
    for (const s of ex.sources) {
      if (!isText(s?.title)) errs.push('sources の title が空');
      if (!isText(s?.url) || !/^https:\/\/[^\s]+$/.test(s.url)) errs.push(`sources の url が https ではない: ${String(s?.url)}`);
      if (!SOURCE_TYPES.includes(s?.type)) errs.push(`sources の type が不正: ${String(s?.type)}`);
      // 解説サイトは結論の照合にだけ使い、根拠にはしない（§6.7.1）
      if (s?.type === 'site') errs.push('sources に解説サイト（site）がある');
    }
  }

  if (!Number.isInteger(ex.crossChecked) || (ex.crossChecked ?? -1) < 0) errs.push('crossChecked が0以上の整数ではない');
  if (!LEVELS.includes(ex.confidence ?? '')) errs.push('confidence が不正');
  if (ex.status !== 'draft' && ex.status !== 'published') errs.push('status が不正');
  if (ex.asOf !== null && !/^20\d\d-(0[1-9]|1[0-2])$/.test(String(ex.asOf))) errs.push('asOf が YYYY-MM ではない');
  if (ex.caution !== null) {
    if (!isText(ex.caution)) errs.push('caution が不正');
    else {
      texts.push(ex.caution);
      if (ex.asOf === null) errs.push('caution があるのに asOf（確認した年月）がない');
    }
  }

  // 一次情報の根拠がないまま high にしない（§6.7.1）
  if (ex.confidence === 'high' && Array.isArray(ex.sources)) {
    if (ex.sources.length === 0) errs.push('confidence が high なのに sources がない');
    else if (q.fieldId === 'law' && !ex.sources.some((s) => s.type === 'law' || s.type === 'gov'))
      errs.push('法規・制度の問題は、法令か官公庁の根拠がないと high にできない');
  }

  if (texts.some(hasTag)) errs.push('HTML タグのような文字列がある（SPEC §8.4）');
  return errs;
}

export function checkTextbookRefs(q: Question): string[] {
  const refs = q.textbookRefs as Partial<TextbookRef>[] | undefined;
  if (refs === undefined) return [];
  if (!Array.isArray(refs) || refs.length === 0) return ['textbookRefs が空（該当なしのときは省略する）'];
  const errs: string[] = [];
  for (const r of refs) {
    if (!isText(r.bookId) || !bookOf(r.bookId)) errs.push(`textbookRefs の bookId が教科書の一覧にない: ${String(r.bookId)}`);
    if (!isText(r.chapter)) errs.push('textbookRefs の chapter が空');
    if (typeof r.section !== 'string') errs.push('textbookRefs の section が文字列ではない');
    if (!isText(r.title)) errs.push('textbookRefs の title が空');
    // 見出しより長い文章（教科書の本文）を入れない
    else if (r.title.length > 40) errs.push('textbookRefs の title が長すぎる（節の見出しだけを入れる）');
    if (!Number.isInteger(r.page) || (r.page ?? 0) < 1 || (r.page ?? 0) > 999) errs.push('textbookRefs の page が不正');
    if (r.via !== 'index' && r.via !== 'toc') errs.push('textbookRefs の via が index / toc ではない');
    if (!LEVELS.includes(r.confidence ?? '')) errs.push('textbookRefs の confidence が不正');
    // 索引になく目次から推定した参照は、確信度を low にする
    if (r.via === 'toc' && r.confidence !== 'low') errs.push('textbookRefs: 目次から推定した参照（via: toc）は confidence を low にする');
    if ([r.chapter, r.section, r.title].some((v) => typeof v === 'string' && hasTag(v))) errs.push('textbookRefs に HTML タグのような文字列がある');
  }
  return errs;
}
