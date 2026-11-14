/**
 * ビルド結果（dist/）に、入ってはいけないものが入っていないかを調べる（SPEC §6.5 / §8.4）。
 *   - 管理者のメールアドレス（環境変数 ADMIN_EMAIL。値は表示しない）
 *   - E2E テスト用のコード（Firebase Emulator への接続）、ルールのテンプレートの置き場所
 *
 * grep ではなく Node で調べる：Windows の Git Bash では `grep -i -F` が既定のロケールで異常終了し、
 * 「入っていない」と見分けがつかなかった（§14）。Node なら Windows でも CI（Ubuntu）でも同じ結果になる。
 *
 * 使い方:
 *   ADMIN_EMAIL=... node scripts/check-dist.ts [dist]
 *     REQUIRE_ADMIN_EMAIL=1 のときは、ADMIN_EMAIL が空なら失敗にする（デプロイ前の検査用）
 *   node scripts/check-dist.ts --self-test [dist]
 *     この検査が効いていることの確認。dist の写しにダミーの値を仕込み、検査が失敗することを確かめる
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** ビルド結果に入っていてはいけない、テスト用・テンプレート用の文字列 */
export const MARKERS = ['localhost:9099', 'e2e-user', '__ADMIN_EMAIL__'] as const;

/** 検査が効いているかの確認にだけ使う、ダミーの「管理者メール」（実在しない。.test は予約済みのドメイン） */
export const DUMMY_ADMIN_EMAIL = 'Check-Dist.Dummy+Admin@check-dist.test';

export interface Finding {
  /** dist からの相対パス（/ 区切り） */
  file: string;
  /** 何が見つかったか。管理者メールのときは値を入れず 'ADMIN_EMAIL' とその形だけを入れる */
  what: string;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

/**
 * 管理者メールの、ビルド結果に現れうる形（すべて小文字にして比べる）。
 * そのまま／URL エンコード／JS・JSON・HTML のエスケープ／Base64。
 */
export function emailVariants(email: string): { form: string; needle: string }[] {
  const e = email.trim();
  const at = (rep: string) => e.replace('@', rep);
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/=+$/, '');
  const forms: [string, string][] = [
    ['そのまま', e],
    ['URL エンコード（%40）', at('%40')],
    ['URL エンコード（全体）', encodeURIComponent(e)],
    ['エスケープ（\\u0040）', at('\\u0040')],
    ['エスケープ（\\x40）', at('\\x40')],
    ['HTML（&#64;）', at('&#64;')],
    ['HTML（&#x40;）', at('&#x40;')],
  ];
  const out = forms.map(([form, needle]) => ({ form, needle: needle.toLowerCase() }));
  // Base64 は大文字小文字を区別する。元の表記・小文字・大文字の3通りを、そのままの形で探す
  for (const [label, s] of [['Base64', e], ['Base64（小文字）', e.toLowerCase()], ['Base64（大文字）', e.toUpperCase()]] as const) {
    out.push({ form: label, needle: `\u0000b64:${b64(s)}` });
  }
  const seen = new Set<string>();
  return out.filter((v) => (seen.has(v.needle) ? false : (seen.add(v.needle), true)));
}

/**
 * dist の中の全ファイルを調べる。画像などのバイナリも含め、バイト列として読む（文字コードに左右されない）。
 * 管理者メールは大文字小文字を区別せずに探す。
 */
export function scanDist(dist: string, opts: { adminEmail?: string } = {}): Finding[] {
  const findings: Finding[] = [];
  const email = opts.adminEmail?.trim();
  const variants = email ? emailVariants(email) : [];
  for (const path of listFiles(dist)) {
    const file = relative(dist, path).split('\\').join('/');
    // latin1：1バイトを1文字として読む。どんなバイト列でも失敗せず、ASCII の文字列をそのまま探せる
    const raw = readFileSync(path).toString('latin1');
    const lower = raw.toLowerCase();
    for (const v of variants) {
      const hit = v.needle.startsWith('\u0000b64:') ? raw.includes(v.needle.slice(5)) : lower.includes(v.needle);
      if (hit) findings.push({ file, what: `ADMIN_EMAIL（${v.form}）` });
    }
    for (const m of MARKERS) if (raw.includes(m)) findings.push({ file, what: m });
  }
  return findings;
}

export interface CheckResult {
  ok: boolean;
  lines: string[];
}

/** 検査して、表示する行と合否を返す（管理者メールの値は行に含めない） */
export function checkDist(dist: string, env: { ADMIN_EMAIL?: string; REQUIRE_ADMIN_EMAIL?: string }): CheckResult {
  const lines: string[] = [];
  let ok = true;
  let isDir = false;
  try {
    isDir = statSync(dist).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { ok: false, lines: [`::error::${dist} がありません（先にビルドしてください）`] };
  if (listFiles(dist).length === 0) return { ok: false, lines: [`::error::${dist} が空です`] };

  const email = env.ADMIN_EMAIL?.trim();
  if (email && !email.includes('@')) return { ok: false, lines: ['::error::ADMIN_EMAIL がメールアドレスの形ではありません'] };
  const findings = scanDist(dist, { adminEmail: email });
  const emailHits = findings.filter((f) => f.what.startsWith('ADMIN_EMAIL'));
  const markerHits = findings.filter((f) => !f.what.startsWith('ADMIN_EMAIL'));

  if (email) {
    if (emailHits.length) {
      ok = false;
      lines.push('::error::ビルド結果に管理者のメールアドレスが含まれています:');
      for (const f of emailHits) lines.push(`  ${f.file}（${f.what.slice('ADMIN_EMAIL（'.length, -1)}）`);
    } else lines.push('OK: 管理者のメールアドレスは含まれていません');
  } else if (env.REQUIRE_ADMIN_EMAIL === '1') {
    ok = false;
    lines.push('::error::ADMIN_EMAIL が設定されていないので検査できません');
  } else {
    lines.push('::notice::ADMIN_EMAIL がないので、管理者メールの検査を飛ばしました（Secrets を使えないPRなど）');
  }

  if (markerHits.length) {
    ok = false;
    for (const m of MARKERS) {
      const files = markerHits.filter((f) => f.what === m).map((f) => f.file);
      if (files.length) {
        lines.push(`::error::ビルド結果にテスト用・テンプレート用の文字列（${m}）が含まれています:`);
        for (const f of files) lines.push(`  ${f}`);
      }
    }
  } else lines.push('OK: テスト用のコードは含まれていません');
  return { ok, lines };
}

/**
 * 検査が効いていることの確認（CI で毎回実行する）。dist の写しを作り、
 *   1. 何も仕込まなければ、ダミーの値では通る
 *   2. JS ファイルにダミーの値を仕込むと、失敗する（大文字小文字を変えた形・URL エンコードした形でも）
 *   3. テスト用の文字列を仕込むと、失敗する
 * を確かめる。1つでも期待と違えば失敗にする。
 */
export function selfTest(dist: string): CheckResult {
  const lines: string[] = [];
  let ok = true;
  const expect = (name: string, actual: boolean, expected: boolean) => {
    const pass = actual === expected;
    if (!pass) ok = false;
    lines.push(`${pass ? 'OK' : '::error::NG'}: ${name}（期待: ${expected ? '通る' : '失敗する'}／結果: ${actual ? '通った' : '失敗した'}）`);
  };
  const work = mkdtempSync(join(tmpdir(), 'check-dist-'));
  try {
    const copy = (name: string) => {
      const d = join(work, name);
      cpSync(dist, d, { recursive: true });
      return d;
    };
    const firstJs = (d: string) => {
      const js = listFiles(d).find((f) => f.endsWith('.js'));
      if (!js) throw new Error('dist に .js ファイルがありません');
      return js;
    };
    const env = { ADMIN_EMAIL: DUMMY_ADMIN_EMAIL, REQUIRE_ADMIN_EMAIL: '1' };

    const clean = copy('clean');
    expect('何も仕込んでいないビルド結果', checkDist(clean, env).ok, true);

    const plain = copy('plain');
    appendFileSync(firstJs(plain), `\n;console.log("${DUMMY_ADMIN_EMAIL}");\n`);
    expect('JS にダミーの管理者メールを仕込んだ', checkDist(plain, env).ok, false);

    const upper = copy('upper');
    appendFileSync(firstJs(upper), `\n;console.log("${DUMMY_ADMIN_EMAIL.toUpperCase()}");\n`);
    expect('大文字にして仕込んだ', checkDist(upper, env).ok, false);

    const encoded = copy('encoded');
    appendFileSync(firstJs(encoded), `\n;fetch("/x?u=${DUMMY_ADMIN_EMAIL.replace('@', '%40')}");\n`);
    expect('URL エンコードして仕込んだ', checkDist(encoded, env).ok, false);

    const nested = copy('nested');
    mkdirSync(join(nested, 'data'), { recursive: true });
    writeFileSync(join(nested, 'data', 'leak.json'), JSON.stringify({ 管理者: DUMMY_ADMIN_EMAIL }));
    expect('日本語を含む JSON に仕込んだ', checkDist(nested, env).ok, false);

    const marker = copy('marker');
    appendFileSync(firstJs(marker), `\n;connect("http://${MARKERS[0]}");\n`);
    expect('テスト用の文字列（Emulator の接続先）を仕込んだ', checkDist(marker, env).ok, false);

    expect('ADMIN_EMAIL がない（必須の指定あり）', checkDist(clean, { REQUIRE_ADMIN_EMAIL: '1' }).ok, false);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  lines.push(ok ? 'OK: check-dist の検査は効いています' : '::error::check-dist の検査が期待どおりに動いていません');
  return { ok, lines };
}

function main(argv: string[]): number {
  const self = argv.includes('--self-test');
  const dist = argv.find((a) => !a.startsWith('--')) ?? 'dist';
  const r = self ? selfTest(dist) : checkDist(dist, process.env);
  for (const l of r.lines) console.log(l);
  return r.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
