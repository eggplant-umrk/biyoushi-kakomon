import { Fragment, type ReactNode } from 'react';

/**
 * 問題文の独自記法を React 要素に変換する（SPEC §8.4：innerHTML を使わない）。
 * 対応記法：[[u:下線にする語句]]
 * 閉じていない記法などは、そのまま文字列として表示する。
 */
export type Segment = { kind: 'text'; text: string } | { kind: 'underline'; text: string };

const UNDERLINE = /\[\[u:([^\]]*)\]\]/g;

export function parseMarkup(src: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of src.matchAll(UNDERLINE)) {
    const idx = m.index;
    if (idx > last) out.push({ kind: 'text', text: src.slice(last, idx) });
    out.push({ kind: 'underline', text: m[1] ?? '' });
    last = idx + m[0].length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}

/** 表示用：記法を取り除いた素の文字列（一覧表示などに使う） */
export function plainText(src: string): string {
  return parseMarkup(src)
    .map((s) => s.text)
    .join('');
}

/** 文字列中の traps（ひっかけ語句）を見つけて分割する。長い語句を優先する */
export function splitByTraps(text: string, traps: readonly string[]): { text: string; trap: boolean }[] {
  const words = [...new Set(traps.filter((t) => t.length > 0))].sort((a, b) => b.length - a.length);
  if (words.length === 0) return [{ text, trap: false }];
  const out: { text: string; trap: boolean }[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    const hit = words.find((w) => text.startsWith(w, i));
    if (hit) {
      if (buf) out.push({ text: buf, trap: false });
      buf = '';
      out.push({ text: hit, trap: true });
      i += hit.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push({ text: buf, trap: false });
  return out;
}

export function RichText({ text, traps = [] }: { text: string; traps?: readonly string[] }): ReactNode {
  return (
    <>
      {parseMarkup(text).map((seg, i) => {
        const inner = splitByTraps(seg.text, traps).map((p, j) =>
          p.trap ? (
            <mark key={j} className="trap">
              {p.text}
            </mark>
          ) : (
            <Fragment key={j}>{p.text}</Fragment>
          ),
        );
        return seg.kind === 'underline' ? (
          <u key={i} className="ul">
            {inner}
          </u>
        ) : (
          <Fragment key={i}>{inner}</Fragment>
        );
      })}
    </>
  );
}

/** 外部リンクは https: のものだけ許可する（javascript: などを防ぐ） */
export function safeHttpsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
