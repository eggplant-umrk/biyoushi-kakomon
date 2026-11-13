# 進捗メモ

作業を引き継ぐときに最初に読むファイルです。仕様は `docs/SPEC.md`、仕様と違う判断は SPEC.md §14。

最終更新: 2026-11-14

## いまの状態

フェーズ1〜4はマージ済みで、本番（https://eggplant-umrk.github.io/biyoushi-kakomon/）にデプロイされています。フェーズ5（管理画面）は、§10 の完了条件の3つ（利用者一覧・利用者の詳細・苦手問題で出題）を実装しました。

| フェーズ | 状態 |
|---|---|
| 1. 骨組み | 済み（PR #1） |
| 2. データ | 済み（PR #3）。OCR確認待ち18問は `docs/ocr-review.html` で確認できる |
| 3. ログイン・記録 | 済み（PR #4） |
| 4. セキュリティ | 済み（PR #4・#5） |
| 5. 管理画面 | 利用者一覧・利用者の詳細・「この人の苦手問題で出題」まで実装。残りは下の「フェーズ5の残り」 |
| 6. 解説 | 6a（第54回の55問の試作）まで。残り715問は、品質の確認後に展開する。下の「フェーズ6a」 |

## フェーズ6a（解説の試作：第54回）

- 解説の元データは `data-src/explanations/exam-54.json`（書式は `data-src/README.md`）。`node scripts/build-data.ts` で `public/data/exam-54.json` に入り、`docs/explanation-review.md`（確認待ちの一覧）も作られる
- 第54回の55問すべてに解説を付けた：確信度 高29・中22・低4。確認待ちは26問（`docs/explanation-review.md`）
- 表示は `src/components/Explanation.tsx`。要点（なぜその答えか・自分が選んだ選択肢の誤り・ここだけ覚える・注意）を先に出し、選択肢ごとの説明と根拠の資料は折りたたみ（SPEC §14-51）
- 形の検証は `src/lib/explanationCheck.ts`（`validate` と `build-data` の両方から使う）。E2E は `e2e/explanation.spec.ts`
- 根拠のURL（107件）は、2026-11-14 にすべて開けることを確認した

### 解説の作り方（残りの回に広げるとき）

1. 分野ごと（問1〜10／11〜20／21〜30／31〜40／41〜55）に分けて調べる。法令は e-Gov、制度・統計は厚生労働省などの現在の内容を必ず検索して確認する
2. 書き終えたら全問を読み直し、`traps`（1文字の語句・説明文の中でも光ってしまう語句）、`caution`（時点の注記以外を入れていないか）、出典の種別を直す
3. 一次情報がなく、照合も解説サイト1件だけの問題は `low` にする
4. `node scripts/build-data.ts && node scripts/validate.ts --expect 41-54`
- 第54回は解説サイトにまだ掲載がなく、問1〜40 は結論の照合ができていない（`crossChecked: 0`。SPEC §14-53）。文化論・美容技術理論（問41〜55）は教科書にしか根拠がないものが多く、`high` は0問

### 教科書の参照（運営管理）— 未着手

- 仕組み（`textbookRefs`、`data-src/textbook-refs.json`、`src/lib/textbooks.ts`、解説画面の1行表示、検証）は実装済み。**参照のデータは0件**
- 理由：このPCに `textbook-src/unei/`（教科書の写真）がなかった。写真をリポジトリ直下の `textbook-src/unei/` に置いてから、索引・目次を読んで `data-src/textbook-refs.json` に書く（`textbook-src/` は `.gitignore` 済み）
- 第54回で運営管理にあたりそうなのは問8〜10（国民年金・介護保険・雇用保険）。問1〜7 は関係法規・制度の側

## フェーズ5（管理画面）

- 画面は `src/screens/AdminScreen.tsx`、取得・集計・キャッシュは `src/lib/admin.ts`、Firestore の読み取りは `src/lib/cloud.ts` の `adminLoadUsers` / `adminLoadProgress`
- セキュリティルールは変えていない（管理者は他人の `users`・`progress`・`days` を読むだけ）。ルールのデプロイも不要
- 管理者以外に管理タブが出ないこと・データを読めないことは、ルールのテスト（`rules-tests/`）と E2E（`e2e/admin.spec.ts`）で確認している
- 苦手問題は「直近の解答が不正解の問題」（1回だけ解いて間違えた問題も含む。SPEC §14-47）
- 「この人の苦手問題で出題」は、出題モード `study`。管理者の記録にも利用者の記録にも残さない（SPEC §14-45）

### フェーズ5の残り（次回以降）

- おすすめ復習の作成（管理画面）と、利用者のホームへの表示
- 解説への報告ボタン（利用者側）と、報告の一覧（管理画面）
- OCR確認待ち・解説の確認待ちの一覧（管理画面）
- 回別の成績（本番模試モードができてから）
- 「本日の書き込みが多すぎる」利用者の警告（§8.2）

### フェーズ5で、本番ではまだ確認していないこと

- 管理者のアカウントでログインして「管理」タブが出ること、一覧と詳細が表示されること
- 管理者ではない別の Google アカウントでログインして、「管理」タブが出ないこと・`/#/admin` を開いてもホームに戻ること

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
