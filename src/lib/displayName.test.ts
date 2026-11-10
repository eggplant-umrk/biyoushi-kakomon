import { describe, expect, it } from 'vitest';
import { cleanDisplayName } from './displayName';

describe('cleanDisplayName', () => {
  it('制御文字・改行・双方向制御文字を取り除く', () => {
    expect(cleanDisplayName('a\u0000b\nc\td\u007f')).toBe('abcd');
    expect(cleanDisplayName('abc‮def')).toBe('abcdef');
  });
  it('前後の空白を落とす', () => {
    expect(cleanDisplayName('  山田 花子　')).toBe('山田 花子');
  });
  it('30文字までに切る（絵文字を途中で切らない）', () => {
    expect([...cleanDisplayName('あ'.repeat(40))]).toHaveLength(30);
    const emoji = cleanDisplayName('😀'.repeat(40));
    expect([...emoji]).toHaveLength(30);
    expect(emoji).toBe('😀'.repeat(30));
  });
  it('空・null は空文字になる', () => {
    expect(cleanDisplayName(null)).toBe('');
    expect(cleanDisplayName('\n\t ')).toBe('');
  });
  it('HTML はそのまま文字として残す（表示は React がエスケープする）', () => {
    expect(cleanDisplayName('<b>x</b>')).toBe('<b>x</b>');
  });
});
