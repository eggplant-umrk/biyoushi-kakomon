import { describe, expect, test } from 'vitest';
import { normalizeForSearch, parseQuery, searchDocs, stripMarkup, toBrowseItem, toSearchDoc, type SearchDoc } from './searchIndex';

const q = {
  id: '54-01',
  examNo: 54,
  no: 1,
  fieldId: 'law',
  stem: '美容師法に関する次の記述のうち、[[u:誤っているもの]]はどれか。',
  choices: ['美容所の開設には届出が必要である。', 'ア', 'イ', 'ウ'],
  statements: null,
  images: [],
  explanation: {
    status: 'published',
    confidence: 'low' as const,
    summary: '開設の届出は保健所に出す。',
    keyPoint: 'カット',
    perChoice: ['正しい', '誤り', '誤り', '誤り'],
    perStatement: null,
  },
};

describe('索引を作る', () => {
  test('記法を取り除く', () => {
    expect(stripMarkup('A[[u:下線]]B')).toBe('A下線B');
  });
  test('一覧：問題文の冒頭・回・番号・分野・確信度', () => {
    expect(toBrowseItem(q)).toEqual({ id: '54-01', e: 54, n: 1, f: 'law', s: '美容師法に関する次の記述のうち、誤っているものはどれか。', c: 'low' });
    expect(toBrowseItem({ ...q, images: ['x.png'], explanation: null })).toMatchObject({ c: null, img: 1 });
  });
  test('索引：問題文・選択肢・解説', () => {
    const d = toSearchDoc(q);
    expect(d.q[0]).toContain('誤っているもの');
    expect(d.q[1]).toBe('(1) 美容所の開設には届出が必要である。');
    expect(d.x).toContain('開設の届出は保健所に出す。');
  });
});

describe('検索', () => {
  const docs: SearchDoc[] = [toSearchDoc(q), { id: '53-02', q: ['パーマネントウェーブ用剤', '(1) a'], x: ['チオグリコール酸'] }];
  test('全角・半角、カタカナ・ひらがな、大文字・小文字の違いを無視する', () => {
    expect(normalizeForSearch('ＡＢｃ　カット').norm).toBe('abc かっと');
    expect(parseQuery('  カット   届出 ')).toEqual(['かっと', '届出']);
  });
  test('すべての語を含む問題だけ。問題文・選択肢での一致を上に', () => {
    expect(searchDocs(docs, '届出').map((h) => h.id)).toEqual(['54-01']);
    expect(searchDocs(docs, '届出 チオ')).toEqual([]);
    expect(searchDocs(docs, 'ちおぐりこーる')[0]).toMatchObject({ id: '53-02', part: '解説' });
  });
  test('一致した語の位置を、切り出しの中で返す', () => {
    const [hit] = searchDocs(docs, '届出');
    expect(hit).toBeDefined();
    const [s, e] = hit!.ranges[0]!;
    expect(hit!.snippet.slice(s, e)).toBe('届出');
  });
  test('空の検索語では何も返さない。語は5つまで', () => {
    expect(searchDocs(docs, '   ')).toEqual([]);
    expect(parseQuery('a b c d e f g')).toHaveLength(5);
  });
});
