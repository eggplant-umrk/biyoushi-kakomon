import { defineConfig } from 'vitest/config';

// セキュリティルールのテスト（SPEC §8.1）。Firestore Emulator が必要なので、
// `npm run test:rules`（firebase emulators:exec 経由）で実行する
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
