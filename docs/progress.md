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

### 2026-11-10 の追加分

- App Check を Fraud Defense（reCAPTCHA Enterprise）に切り替え（SPEC §14-33）。キー `biyoushi-kakomon-appcheck`（サイトキー `6Lf-DRkuAAAAAHYUjdfiymk5uG7PsaehHjOqr18J`）を作り、App Check に登録（しきい値 0.3）。GitHub Secrets の `VITE_RECAPTCHA_SITE_KEY` に登録済み
- 記録の二重加算の防止（`syncSeq`・`syncAt`）と、1回の送信の上限（55問・問題10件）をルールとアプリに追加（SPEC §14-34・35）。ルールのテストは CI で通過
- Authentication：Google ログインを有効化、承認済みドメインに `eggplant-umrk.github.io` を追加。メール列挙保護は有効

### 残り

1. 新しいルールを本番に公開する（コンソールのルール画面に入れてあり、「公開」を押すだけ。または手元で `bash scripts/setup/deploy-rules.sh`）
2. PR #4 をマージ（CI は通過済み）→ GitHub Pages に自動デプロイ
3. 本番で App Check のトークンが届くのを確認 → Firestore の App Check を強制（`bash scripts/setup/appcheck.sh enforce firestore` かコンソール）
4. Authentication での App Check 強制が無料プランで使えるか確認し、結果を SPEC.md §14 に書く
5. 承認済みドメインから `biyoushi-kakomon.web.app`・`biyoushi-kakomon.firebaseapp.com` を外す（`firebase.sh` と同じ状態にする）
6. 本番URLで、ログイン → 数問解く → 別の端末でログインして記録が見える、を確認
7. 以前作った reCAPTCHA v3 のキー（ラベル biyoushi-kakomon）を削除
8. `.env.local` の `VITE_RECAPTCHA_SITE_KEY` を新しいサイトキーにする（手元のPC）

### 手元で動かすときの注意

- Firestore Emulator に Java が必要。このPCでは `.tools/` に Temurin JRE 21 を置いてある（コミットしない）。
  `export JAVA_HOME="$PWD/.tools/jdk-21.0.13+9-jre"; export PATH="$JAVA_HOME/bin:$PATH"`
- ルールのデプロイは `bash scripts/setup/deploy-rules.sh`（テスト → 生成 → デプロイ）
