import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDist, DUMMY_ADMIN_EMAIL, emailVariants, MARKERS, scanDist, selfTest } from './check-dist.ts';

/**
 * ビルド結果の検査（scripts/check-dist.ts）のテスト。
 * 管理者メールの代わりにテスト専用のダミーの値を使い、ビルド結果に仕込んだら必ず失敗することを確かめる。
 * Windows（Git Bash）でも CI（Ubuntu）でも同じ結果になること（以前の grep 版は Windows で見逃していた。SPEC §14）。
 */
const here = dirname(fileURLToPath(import.meta.url));
const ENV = { ADMIN_EMAIL: DUMMY_ADMIN_EMAIL, REQUIRE_ADMIN_EMAIL: '1' };
const JS = join('assets', 'index-abc123.js');
let dist = '';

/** 本物に近い形の、きれいなビルド結果を作る（日本語・バイナリ・入れ子のフォルダを含む） */
function makeDist(): string {
  const d = mkdtempSync(join(tmpdir(), 'check-dist-test-'));
  mkdirSync(join(d, 'assets'));
  mkdirSync(join(d, 'data'));
  mkdirSync(join(d, 'images', '54'), { recursive: true });
  writeFileSync(join(d, 'index.html'), '<!doctype html><html lang="ja"><title>美容師国家試験 過去問トレーナー</title></html>');
  writeFileSync(join(d, JS), 'const a="この条件で始める";export{a};\n');
  writeFileSync(join(d, 'data', 'exam-54.json'), JSON.stringify({ stem: '美容師法に関する次の記述のうち、正しいものはどれか。' }));
  // UTF-8 として正しくないバイト列を含むバイナリ（画像の代わり）
  writeFileSync(join(d, 'images', '54', '54-50.webp'), Buffer.from([0x52, 0x49, 0x46, 0x46, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0xa0, 0xa1]));
  return d;
}

/** ファイルの末尾に書き足す */
function plant(file: string, content: string | Buffer): void {
  writeFileSync(join(dist, file), content, { flag: 'a' });
}

beforeEach(() => {
  dist = makeDist();
});
afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('checkDist', () => {
  it('きれいなビルド結果は通る', () => {
    const r = checkDist(dist, ENV);
    expect(r.ok).toBe(true);
    expect(r.lines).toContain('OK: 管理者のメールアドレスは含まれていません');
    expect(r.lines).toContain('OK: テスト用のコードは含まれていません');
  });

  it('ダミーの管理者メールを JS に仕込むと失敗し、ファイル名は出すが値は出さない', () => {
    plant(JS, 'const admin="' + DUMMY_ADMIN_EMAIL + '";');
    const r = checkDist(dist, ENV);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('assets/index-abc123.js');
    expect(r.lines.join('\n').toLowerCase()).not.toContain(DUMMY_ADMIN_EMAIL.toLowerCase());
  });

  it.each([
    ['大文字', DUMMY_ADMIN_EMAIL.toUpperCase()],
    ['小文字', DUMMY_ADMIN_EMAIL.toLowerCase()],
    ['URL エンコード（%40）', DUMMY_ADMIN_EMAIL.replace('@', '%40')],
    ['URL エンコード（全体）', encodeURIComponent(DUMMY_ADMIN_EMAIL)],
    ['\\u0040', DUMMY_ADMIN_EMAIL.replace('@', '\\u0040')],
    ['&#64;', DUMMY_ADMIN_EMAIL.replace('@', '&#64;')],
    ['Base64', Buffer.from(DUMMY_ADMIN_EMAIL).toString('base64')],
    ['Base64（小文字にしたもの）', Buffer.from(DUMMY_ADMIN_EMAIL.toLowerCase()).toString('base64')],
  ])('形を変えて仕込んでも失敗する：%s', (_name, planted) => {
    plant(JS, '\nconst x="' + planted + '";');
    expect(checkDist(dist, ENV).ok).toBe(false);
  });

  it.each([
    ['日本語を含む JSON', join('data', 'exam-54.json'), Buffer.from(JSON.stringify({ 管理者: DUMMY_ADMIN_EMAIL }))],
    ['HTML', 'index.html', Buffer.from('<meta name="author" content="' + DUMMY_ADMIN_EMAIL + '">')],
    ['バイナリの途中', join('images', '54', '54-50.webp'), Buffer.concat([Buffer.from([0xff, 0xfe, 0x00]), Buffer.from(DUMMY_ADMIN_EMAIL), Buffer.from([0x00, 0x80])])],
    ['新しいファイル（ソースマップ）', join('assets', 'chunk-zzz.js.map'), Buffer.from('{"sources":["' + DUMMY_ADMIN_EMAIL + '"]}')],
  ])('どのファイルに仕込んでも失敗する：%s', (_name, file, content) => {
    plant(file, content);
    const hits = scanDist(dist, { adminEmail: DUMMY_ADMIN_EMAIL }).filter((f) => f.what.startsWith('ADMIN_EMAIL'));
    expect(hits.map((h) => h.file)).toContain(file.split('\\').join('/'));
    expect(checkDist(dist, ENV).ok).toBe(false);
  });

  it.each([...MARKERS])('テスト用・テンプレート用の文字列を仕込むと失敗する：%s', (marker) => {
    plant(JS, '\nconst x="' + marker + '";');
    const r = checkDist(dist, ENV);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain(marker);
  });

  it('ADMIN_EMAIL がないとき：必須なら失敗、そうでなければ飛ばして通る（テスト用の文字列は調べる）', () => {
    expect(checkDist(dist, { REQUIRE_ADMIN_EMAIL: '1' }).ok).toBe(false);
    expect(checkDist(dist, { ADMIN_EMAIL: '  ', REQUIRE_ADMIN_EMAIL: '1' }).ok).toBe(false);
    expect(checkDist(dist, {}).ok).toBe(true);
    plant(JS, '\nconst x="' + MARKERS[0] + '";');
    expect(checkDist(dist, {}).ok).toBe(false);
  });

  it('dist がない・空・ADMIN_EMAIL がメールアドレスの形でないときは、通さない', () => {
    expect(checkDist(join(dist, 'nothing'), ENV).ok).toBe(false);
    const empty = mkdtempSync(join(tmpdir(), 'check-dist-empty-'));
    expect(checkDist(empty, ENV).ok).toBe(false);
    rmSync(empty, { recursive: true, force: true });
    expect(checkDist(dist, { ADMIN_EMAIL: 'not-an-email' }).ok).toBe(false);
  });

  it('メールアドレスの一部が同じだけでは、見つけたことにしない', () => {
    plant(JS, '\nconst x="' + DUMMY_ADMIN_EMAIL.split('@')[0] + '@example.com";');
    expect(checkDist(dist, ENV).ok).toBe(true);
  });
});

describe('emailVariants', () => {
  it('探す形に重複がなく、どれも空でない', () => {
    const v = emailVariants(DUMMY_ADMIN_EMAIL);
    expect(new Set(v.map((x) => x.needle)).size).toBe(v.length);
    expect(v.every((x) => x.needle.length > 8)).toBe(true);
  });
});

describe('selfTest（CI で毎回実行する確認）', () => {
  it('きれいなビルド結果に対して、すべての確認が期待どおりになる', () => {
    const r = selfTest(dist);
    expect(r.lines.filter((l) => l.includes('NG'))).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('もともとテスト用の文字列が入っているビルド結果では、失敗として知らせる', () => {
    plant(JS, '\nconst x="' + MARKERS[1] + '";');
    expect(selfTest(dist).ok).toBe(false);
  });
});

describe('コマンドとしての動作（終了コード）', () => {
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [join(here, 'check-dist.ts'), ...args], {
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env },
      encoding: 'utf8',
    });

  it('きれいなら 0、仕込むと 1。出力に値は出ない', () => {
    expect(run([dist], ENV).status).toBe(0);
    plant(JS, '\nconst admin="' + DUMMY_ADMIN_EMAIL + '";');
    const r = run([dist], ENV);
    expect(r.status).toBe(1);
    expect((r.stdout + r.stderr).toLowerCase()).not.toContain(DUMMY_ADMIN_EMAIL.toLowerCase());
  });

  it('--self-test は、きれいなビルド結果なら 0', () => {
    expect(run(['--self-test', dist], {}).status).toBe(0);
  });
});
