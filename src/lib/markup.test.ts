import { describe, expect, it } from 'vitest';
import { parseMarkup, plainText, safeHttpsUrl, splitByTraps } from './markup';

describe('parseMarkup', () => {
  it('下線記法を分割する', () => {
    expect(parseMarkup('次のうち、[[u:誤っているもの]]はどれか。')).toEqual([
      { kind: 'text', text: '次のうち、' },
      { kind: 'underline', text: '誤っているもの' },
      { kind: 'text', text: 'はどれか。' },
    ]);
  });
  it('閉じていない記法やHTMLは文字列のまま扱う', () => {
    expect(parseMarkup('<b>x</b> [[u:abc')).toEqual([{ kind: 'text', text: '<b>x</b> [[u:abc' }]);
  });
  it('plainText は記法を取り除く', () => {
    expect(plainText('a[[u:b]]c')).toBe('abc');
  });
});

describe('splitByTraps', () => {
  it('長い語句を優先して強調する', () => {
    expect(splitByTraps('30日以内に届け出る', ['30日', '30日以内'])).toEqual([
      { text: '30日以内', trap: true },
      { text: 'に届け出る', trap: false },
    ]);
  });
  it('語句がなければそのまま', () => {
    expect(splitByTraps('abc', [])).toEqual([{ text: 'abc', trap: false }]);
  });
});

describe('safeHttpsUrl', () => {
  it('https だけ許可する', () => {
    expect(safeHttpsUrl('https://elaws.e-gov.go.jp/')).toBe('https://elaws.e-gov.go.jp/');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('http://example.com')).toBeNull();
    expect(safeHttpsUrl('not a url')).toBeNull();
  });
});
