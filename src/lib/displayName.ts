/**
 * 表示名の整形（SPEC §8.4）。利用者が入力する文字列はこれだけ。
 * 制御文字を取り除き、前後の空白を落とし、30文字までに切る。保存の前にも表示の前にも通す。
 * セキュリティルール側でも同じ条件（1〜30文字、制御文字・見えない文字なし）を検査している。
 */
/** 見えない文字：ゼロ幅文字、文字の向きを変える文字、行・段落区切り、BOM（管理画面で名前を見分けられなくなるため） */
function isInvisible(c: number): boolean {
  return (
    c === 0x061c ||
    (c >= 0x200b && c <= 0x200f) ||
    c === 0x2028 ||
    c === 0x2029 ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2060 && c <= 0x2069) ||
    c === 0xfeff
  );
}
export const DISPLAY_NAME_MAX = 30;
export const DEFAULT_DISPLAY_NAME = 'ななし';

export function cleanDisplayName(input: string | null | undefined): string {
  const noControl = [...(input ?? '')]
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      // C0/C1 制御文字、DEL と、見えない文字（表示を乱す・名前を見分けられなくなるため）を除く
      return !(c <= 0x1f || (c >= 0x7f && c <= 0x9f) || isInvisible(c));
    })
    .join('')
    .trim();
  // ルールの size() と同じ数え方（コードポイント単位）で切る。絵文字の途中で切らない
  return [...noControl].slice(0, DISPLAY_NAME_MAX).join('').trim();
}
