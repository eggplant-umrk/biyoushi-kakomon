# 進捗メモ

作業を引き継ぐときに最初に読むファイルです。仕様は `docs/SPEC.md`、仕様と違う判断は SPEC.md §14。

最終更新: 2026-11-10

## いまの状態

フェーズ1〜4はマージ済みで、本番（https://eggplant-umrk.github.io/biyoushi-kakomon/）にデプロイされています。次はフェーズ5（管理画面）です。

| フェーズ | 状態 |
|---|---|
| 1. 骨組み | 済み（PR #1） |
| 2. データ | 済み（PR #3）。OCR確認待ち18問は `docs/ocr-review.html` で確認できる |
| 3. ログイン・記録 | 済み（PR #4） |
| 4. セキュリティ | 済み（PR #4・#5） |
| 5. 管理画面 | 未着手。管理タブは「準備中」を出すだけ |
| 6. 解説 | 未着手 |

## Firebase（プロジェクト `biyoushi-kakomon`、Spark プラン）

- Firestore（asia-northeast1）。ルールは `firestore.rules.template` から作り、`bash scripts/setup/deploy-rules.sh`（テスト → 生成 → デプロイ）で公開する。コンソールのルール画面からは公開しない
- Authentication：Google ログインだけ有効。メール列挙保護は有効。承認済みドメインは `eggplant-umrk.github.io`・`localhost`・`biyoushi-kakomon.firebaseapp.com`
- App Check：Fraud Defense（reCAPTCHA Enterprise）のキー `biyoushi-kakomon-appcheck`。**Firestore・Authentication の両方で強制済み**（SPEC §14-37）。状態の確認と切り替えは `bash scripts/setup/appcheck.sh status|enforce|unenforce`
- API キーは、使う4つの API とリファラー3つに制限（`scripts/setup/firebase.sh`）
- 設定値は `.env.local`（コミットしない）と GitHub Secrets。管理者メール（`ADMIN_EMAIL`）はこの2か所だけに置く

## 本番で確認したこと（2026-11-10）

- Google でログイン → 第54回の10問を解く → Firestore に累計10問・問題ごとの記録10件・日別の記録1件が保存された
- `users` のドキュメントにメールアドレスは入っていない。配信中の JS に管理者メールと E2E 用のコードは入っていない
- App Check：トークンなしのリクエストは、Firestore で 403、Authentication で 401 になる。トークンありは通る
- App Check の強制後も、ログイン済みのブラウザは読み込み直して同期できる
- 端末内の記録の写しを空にしてから読み込み直すと、Firestore から10問分の記録（問題ごとの正誤・日別）を取り込み直して、ホームと記録画面に表示された（記録のない別の端末でログインしたときと同じ取り込み処理）

## まだ確認していないこと

- 実際に別のブラウザ・端末で同じアカウントにログインして、記録が見えること（Emulator の E2E では確認済み。本番では、上の「写しを空にして取り込み直す」確認まで）
- App Check を Authentication で強制した後の、新規のログイン（ポップアップ）とアカウント削除（再ログイン）
- iPhone の Safari・Android の Chrome の実機での表示とログイン
- 新しい画面（ゲスト記録の引き継ぎ確認、アプリ内ブラウザの案内、設定のアカウント欄）の見た目

ログインできない場合は、まず `bash scripts/setup/appcheck.sh unenforce auth` で Authentication の強制を外して切り分ける。

## 作っていないもの

- 回別の最高点（`examBest`）の記録（本番模試モードがまだない）
- 解説への報告ボタン（解説がまだない）。ルールとテストは用意済み

## 手元で動かすときの注意

- Firestore Emulator に Java が必要。作業用の Windows PC では `.tools/` に Temurin JRE 21 を置いてある（コミットしない）。
  `export JAVA_HOME="$PWD/.tools/jdk-21.0.13+9-jre"; export PATH="$JAVA_HOME/bin:$PATH"`
- E2E は PC の負荷が高いと時間切れで落ちることがある。そのときは並列数を下げる：
  `firebase emulators:exec --config firebase.emulator.json --project demo-kakomon --only auth,firestore "npx playwright test --workers=2"`
- Windows では iPhone（WebKit）のログイン E2E を飛ばしている。CI（Linux）で実行される
- デプロイ後に古い版が出る場合は、ページをもう一度読み込む（PR #5 より前の版を開いていたブラウザだけ。以後は自動で切り替わる）
