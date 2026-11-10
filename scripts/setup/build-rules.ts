/**
 * firestore.rules.template から firestore.rules を作る（SPEC §6.5）。
 * __ADMIN_EMAIL__ を、環境変数 ADMIN_EMAIL（なければ .env.local の ADMIN_EMAIL）で置き換える。
 * firestore.rules はコミットしない（.gitignore 済み）。
 *
 * 使い方: node scripts/setup/build-rules.ts          … 本番用の firestore.rules
 *         node scripts/setup/build-rules.ts --test   … Emulator 用の firestore.test.rules（管理者は admin@example.com）
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** テスト（Emulator）で管理者として扱うメールアドレス */
export const TEST_ADMIN_EMAIL = 'admin@example.com';

export function renderRules(template: string, adminEmail: string): string {
  // ルールの文字列を壊す文字（引用符・バックスラッシュ・空白）が入らない、普通のメールアドレスだけ受け付ける
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(adminEmail)) {
    throw new Error('ADMIN_EMAIL がメールアドレスの形になっていません');
  }
  if (!template.includes('__ADMIN_EMAIL__')) throw new Error('テンプレートに __ADMIN_EMAIL__ がありません');
  return template.replaceAll('__ADMIN_EMAIL__', adminEmail);
}

function adminEmailFromEnv(): string {
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  const envPath = join(root, '.env.local');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('ADMIN_EMAIL='));
    if (line) return line.slice('ADMIN_EMAIL='.length).trim();
  }
  throw new Error('ADMIN_EMAIL がありません（.env.local か環境変数に入れてください）');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const template = readFileSync(join(root, 'firestore.rules.template'), 'utf8');
  if (process.argv.includes('--test')) {
    writeFileSync(join(root, 'firestore.test.rules'), renderRules(template, TEST_ADMIN_EMAIL));
    console.log('firestore.test.rules を作りました（Emulator 用）');
  } else {
    writeFileSync(join(root, 'firestore.rules'), renderRules(template, adminEmailFromEnv()));
    console.log('firestore.rules を作りました（管理者メールは表示しません）');
  }
}
