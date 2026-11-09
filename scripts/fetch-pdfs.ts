/**
 * 公式の「過去の筆記試験問題」ページから、第41〜54回の美容師（新試験）の PDF を raw/pdf/ に保存する（SPEC §6.1 手順1）。
 *
 * - リンクの文字「第N回美容師筆記試験」で判別する。第41〜43回は「（新試験）」付きのものだけを使い、
 *   「（旧試験）」と理容師の PDF は使わない。
 * - 相手のサーバーに負荷をかけないよう、1件ずつ、間に数秒あけて取得する。取得済みのファイルは再取得しない。
 *
 * 使い方: node scripts/fetch-pdfs.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = 'https://www.rbc.or.jp/exam/past_question/';
const UA = 'biyoushi-kakomon-fetch/1.0 (personal study app; non-commercial)';
const FIRST = 41;
const LAST = 54;
const WAIT_MS = 5000;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'raw', 'pdf');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, '');
}

export function findTargets(html: string): Map<number, string> {
  const found = new Map<number, string>();
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = m[1] ?? '';
    const label = stripTags(m[2] ?? '');
    const lm = /^第(\d+)回美容師筆記試験(（新試験）|（旧試験）)?$/.exec(label);
    if (!lm) continue;
    const no = Number(lm[1]);
    if (no < FIRST || no > LAST) continue;
    if (lm[2] === '（旧試験）') continue;
    if (no <= 43 && lm[2] !== '（新試験）') continue;
    found.set(no, new URL(href, PAGE).href);
  }
  return found;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const res = await fetch(PAGE, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`一覧ページの取得に失敗: ${res.status}`);
  const targets = findTargets(await res.text());

  const missing: number[] = [];
  for (let n = FIRST; n <= LAST; n++) if (!targets.has(n)) missing.push(n);
  if (missing.length) throw new Error(`PDF のリンクが見つからない回: ${missing.join(', ')}`);

  const manifest: Record<string, string> = {};
  let first = true;
  for (let n = LAST; n >= FIRST; n--) {
    const url = targets.get(n) as string;
    manifest[n] = url;
    const file = join(outDir, `${n}.pdf`);
    if (existsSync(file)) {
      console.log(`第${n}回: 取得済み（スキップ）`);
      continue;
    }
    if (!first) await sleep(WAIT_MS);
    first = false;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`第${n}回の取得に失敗: ${r.status} ${url}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error(`第${n}回: PDF ではありません ${url}`);
    writeFileSync(file, buf);
    console.log(`第${n}回: ${url} → raw/pdf/${n}.pdf（${Math.round(buf.length / 1024)}KB）`);
  }
  writeFileSync(join(outDir, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
}

await main();
