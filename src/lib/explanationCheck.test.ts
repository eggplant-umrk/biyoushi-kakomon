import { describe, expect, it } from 'vitest';
import { checkExplanation, checkTextbookRefs } from './explanationCheck';
import { textbookLine } from './textbooks';
import type { Explanation, Question, TextbookRef } from './types';

const ex = (over: Partial<Explanation> = {}): Explanation => ({
  summary: '(3)が正しい。',
  perChoice: ['誤り。', '誤り。', '正しい。', '誤り。'],
  perStatement: null,
  traps: ['都道府県知事'],
  keyPoint: null,
  sources: [{ title: '美容師法 第3条', url: 'https://laws.e-gov.go.jp/law/332AC1000000163', type: 'law' }],
  crossChecked: 1,
  confidence: 'high',
  status: 'published',
  asOf: '2026-11',
  caution: null,
  ...over,
});

const question = (over: Partial<Question> = {}): Question => ({
  id: '54-01',
  examNo: 54,
  no: 1,
  fieldId: 'law',
  stem: '正しいものはどれか。',
  polarity: 'correct',
  statements: null,
  choices: ['都道府県知事が行う。', 'B', 'C', 'D'],
  answer: 3,
  images: [],
  explanation: ex(),
  caution: null,
  ocrChecked: true,
  ...over,
});

const ref = (over: Partial<TextbookRef> = {}): TextbookRef => ({
  bookId: 'unei-2ed-2024',
  chapter: '第2編 第2章',
  section: '第3節',
  title: '社会保険',
  page: 68,
  via: 'index',
  confidence: 'high',
  ...over,
});

describe('checkExplanation', () => {
  it('解説のない問題と、形の正しい解説は通る', () => {
    expect(checkExplanation(question({ explanation: null }))).toEqual([]);
    expect(checkExplanation(question())).toEqual([]);
  });

  it('perChoice は空でない4つ', () => {
    expect(checkExplanation(question({ explanation: ex({ perChoice: ['a', 'b', 'c'] }) }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: ex({ perChoice: ['a', 'b', 'c', ' '] }) }))).not.toEqual([]);
  });

  it('perStatement は記述（a〜）と同じ数', () => {
    const statements = [
      { label: 'a', text: 'A' },
      { label: 'b', text: 'B' },
    ];
    const base = { statements, choices: ['aとb', 'bとc', 'cとd', 'aとd'] };
    expect(checkExplanation(question({ ...base, explanation: ex({ traps: [], perStatement: ['正しい。', '誤り。'] }) }))).toEqual([]);
    expect(checkExplanation(question({ ...base, explanation: ex({ traps: [], perStatement: ['正しい。'] }) }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: ex({ perStatement: ['正しい。'] }) }))).not.toEqual([]);
  });

  it('traps は選択肢・記述にそのまま出てくる語句だけ', () => {
    expect(checkExplanation(question({ explanation: ex({ traps: ['厚生労働大臣'] }) }))).toEqual([
      'traps の語句が選択肢・記述にない: 厚生労働大臣',
    ]);
  });

  it('根拠は https の URL。解説サイトは根拠にしない', () => {
    const src = (url: string, type: 'law' | 'site' = 'law') => ex({ sources: [{ title: 't', url, type }] });
    expect(checkExplanation(question({ explanation: src('http://example.com/') }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: src('javascript:alert(1)') }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: src('https://example.com/', 'site') }))).not.toEqual([]);
  });

  it('一次情報の根拠がないまま high にできない', () => {
    expect(checkExplanation(question({ explanation: ex({ sources: [] }) }))).not.toEqual([]);
    const edu = ex({ sources: [{ title: 't', url: 'https://example.ac.jp/', type: 'edu' }] });
    expect(checkExplanation(question({ explanation: edu }))).not.toEqual([]); // 法規は法令か官公庁が必要
    expect(checkExplanation(question({ id: '54-41', no: 41, fieldId: 'theory', explanation: edu }))).toEqual([]);
    expect(checkExplanation(question({ explanation: { ...edu, confidence: 'medium' } }))).toEqual([]);
  });

  it('asOf は YYYY-MM。caution には asOf が必要', () => {
    expect(checkExplanation(question({ explanation: ex({ asOf: '2026/11' }) }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: ex({ asOf: null, caution: '出題時は○○、現在は△△' }) }))).not.toEqual([]);
    expect(checkExplanation(question({ explanation: ex({ caution: '出題時は○○、現在は△△' }) }))).toEqual([]);
  });

  it('HTML タグのような文字列は通さない', () => {
    expect(checkExplanation(question({ explanation: ex({ summary: '<b>正しい</b>' }) }))).not.toEqual([]);
  });
});

describe('checkTextbookRefs / textbookLine', () => {
  it('参照のない問題と、形の正しい参照は通る', () => {
    expect(checkTextbookRefs(question())).toEqual([]);
    expect(checkTextbookRefs(question({ textbookRefs: [ref()] }))).toEqual([]);
  });

  it('教科書の一覧にない bookId、不正なページ、空の配列は通さない', () => {
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ bookId: 'unei' })] }))).not.toEqual([]);
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ bookId: 'constructor' })] }))).not.toEqual([]);
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ page: 0 })] }))).not.toEqual([]);
    expect(checkTextbookRefs(question({ textbookRefs: [] }))).not.toEqual([]);
  });

  it('目次から推定した参照は、確信度が low でなければならない', () => {
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ via: 'toc' })] }))).not.toEqual([]);
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ via: 'toc', confidence: 'low' })] }))).toEqual([]);
  });

  it('見出しより長い文章（教科書の本文）は入れられない', () => {
    expect(checkTextbookRefs(question({ textbookRefs: [ref({ title: 'あ'.repeat(41) })] }))).not.toEqual([]);
  });

  it('画面に出す1行を作る', () => {
    expect(textbookLine(ref())).toBe('運営管理 第2版 第2編2章3節 p.68');
    expect(textbookLine(ref({ chapter: '第1章', section: '' }))).toBe('運営管理 第2版 第1章 p.68');
    expect(textbookLine(ref({ bookId: 'unknown' }))).toBeNull();
  });
});
