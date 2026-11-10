# 進捗メモ

作業を引き継ぐときに最初に読むファイルです。仕様は `docs/SPEC.md`、仕様と違う判断は SPEC.md §14。

## フェーズ3（ログイン・記録）・フェーズ4（セキュリティ）

最終更新: 2026-11-10

### 済んだこと

- `docs/ocr-review.html`（OCR確認用の比較ページ。`scripts/build-data.ts` が作る）
- Firebase プロジェクト `biyoushi-kakomon`（Spark プラン）：Web アプリ、Firestore（asia-northeast1）、API キー制限、`.env.local` と GitHub Secrets（`scripts/setup/firebase.sh`）
- セキュリティルール（`firestore.rules.template`）とルールのテスト（`rules-tests/`、`npm run test:rules`）
- Google ログイン、アプリ内ブラウザの案内、ゲスト記録の引き継ぎ、Firestore への記録、設定画面（表示名・ログアウト・アカウント削除）、管理タブ（準備中）
- E2E（`npm run test:e2e`。Auth・Firestore Emulator を使う）
- CSP、CI（ルールのテスト、ビルド結果に管理者メールが入っていないことの検査）

### 残り（コンソール操作のあと）

1. コンソールで Google ログインを有効にする → `bash scripts/setup/firebase.sh` をもう一度実行（承認済みドメイン・メール列挙保護）
2. reCAPTCHA v3 のサイトキーを `.env.local` の `VITE_RECAPTCHA_SITE_KEY` に入れ、`bash scripts/setup/firebase.sh` で GitHub Secrets にも入れる
3. `main` を再デプロイ（ログインが有効になる）→ 本番で App Check のトークンが届くのを確認 → `bash scripts/setup/appcheck.sh` で Firestore の App Check を強制
4. Authentication での App Check 強制が無料プランで使えるか確認し、結果を SPEC.md §14 に書く
5. 本番URLで、ログイン → 数問解く → 別の端末でログインして記録が見える、を確認

### 手元で動かすときの注意

- Firestore Emulator に Java が必要。このPCでは `.tools/` に Temurin JRE 21 を置いてある（コミットしない）。
  `export JAVA_HOME="$PWD/.tools/jdk-21.0.13+9-jre"; export PATH="$JAVA_HOME/bin:$PATH"`
- ルールのデプロイは `bash scripts/setup/deploy-rules.sh`（テスト → 生成 → デプロイ）
