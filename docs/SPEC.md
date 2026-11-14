# 美容師国家試験 過去問トレーナー 仕様書 v2

## 0. 概要

- **目的**：美容師国家試験（筆記）の過去問をスマホで解ける学習Webアプリ。後輩の勉強用。
- **想定利用者**：基本は後輩1人（友人に共有されても数人程度）。他の利用者と比べる機能（みんなの正答率など）は持たない。
- **作成者（管理者）の目的**：ログインした利用者の学習量・分野別正答率を確認し、一緒に勉強するときに苦手分野を重点的に教える。
- **非商用・限定配布**。URLを知っている人だけが使う（検索エンジンにはインデックスさせない）。
- **実装はClaude Codeが行う**。人の手作業は「ブラウザでのログイン・同意クリック」など、Claude Codeが代行できないものだけにする（§12）。

## 1. 方針

| 項目 | 方針 |
|---|---|
| 収録範囲 | 第41回〜第54回の**新制度試験**（14回×55問＝770問）。第41〜43回の「旧試験」は収録しない |
| 出典 | 公益財団法人 理容師美容師試験研修センター「過去の筆記試験問題」。全問に「第○回 問○」を表示し、フッターに出典と「非公式・個人作成」を明記 |
| 解説 | 公式解説はない。自前で作成する。未作成の問題は「解説準備中」と表示 |
| 法改正・統計の古さ | 問題ごとに注意フラグと注記を持てる |
| 記録の扱い | ログイン画面に「学習記録はクラウドに保存され、作成者が問題の改善や苦手分析に使います」と明記。ログインせずに使うこと（ゲスト）もできる |
| 費用 | すべて無料。Firebaseは**Sparkプラン（課金設定なし）から絶対に変更しない**。これで想定外の請求が起こらない |

## 2. 技術構成

| 層 | 採用 |
|---|---|
| フロント | Vite＋React＋TypeScript（strict）。静的ビルド |
| ホスティング | GitHub Pages（GitHub Actionsでビルド＆デプロイ） |
| PWA | vite-plugin-pwa。ホーム画面に追加でき、問題データはオフラインでも解ける |
| 認証 | Firebase Authentication（Googleログインのみ） |
| DB | Cloud Firestore（東京リージョン `asia-northeast1`） |
| 不正利用対策 | Firebase App Check（Fraud Defense＝reCAPTCHA Enterprise のスコアベースのキー。無料枠の範囲で使う。§14） |
| 問題データ | リポジトリ内のJSON（`public/data/`）。図はWebP（`public/images/`） |
| テスト | Vitest（ロジック）、Firebase Emulator＋@firebase/rules-unit-testing（セキュリティルール）、Playwright（スマホ表示のE2E） |

## 3. 機能一覧

過去問道場などの定番機能を参考にした。優先度 **A＝初版に入れる / B＝第2版 / C＝余裕があれば**。

### 3.1 出題

| 機能 | 内容 | 優先 |
|---|---|---|
| 出題条件の細かい設定 | 回（複数選択）× 分野（複数選択）× 出題数（10/20/30/全部）× 順番（番号順/ランダム）。前回の条件を記憶 | A |
| 絞り込み | 「未解答だけ」「前回間違えた問題だけ」「チェックした問題だけ」「自分の正答率が低い順」 | A |
| 回別の本番模試 | 55問を本番と同じ順で解く。最後まで正誤を出さず、終了後に採点。合格ライン（33問）と、0点の分野がないかを判定 | A |
| あとで見直すチェック | 問題ごとのチェック（★）。チェックした問題だけ出題できる | A |
| 過去の正誤マーク | 問題ごとに直近の結果を「○○×」のように表示 | A |
| 中断と再開 | 途中で閉じても、次に開いたとき「続きから」で再開 | A |
| 新しい回を優先 | ランダム出題で新しい回ほど出やすくする重み付け（ON/OFF） | B |
| 苦手克服モード | 2回以上解いて正答率が低い問題を自動で集めて出題 | B |
| 間隔反復 | 正解した問題を1日後→3日後→7日後に再出題（「今日の復習」） | B |

### 3.2 解答・解説

| 機能 | 内容 | 優先 |
|---|---|---|
| 即時の正誤表示 | 選択肢をタップ→正誤、正答のハイライト、解説を表示 | A |
| 選択肢ごとの解説 | 正答の理由だけでなく、誤りの選択肢それぞれがなぜ誤りかを表示 | A |
| ひっかけポイント | 問題を誤りにしている語句（例：「30日以内」）を解説内で強調表示 | B |
| 注意フラグ | 法改正・統計が古い問題に注記を表示 | A |
| 根拠の表示 | 解説の根拠（法令・公的資料のリンク）を折りたたみで表示 | A |
| 解説への報告 | 「分かりにくい／間違っているかも」を1タップで報告 | A |
| 図の拡大 | 図はタップで全画面表示、ピンチで拡大 | A |

### 3.3 記録・成績

| 機能 | 内容 | 優先 |
|---|---|---|
| ホームの成績 | 今日の解答数、累計、全体正答率、分野別正答率（弱い順） | A |
| 回別の成績 | 回ごとの最高点・最新点。合格ラインに届いたかを表示 | A |
| 学習カレンダー | 日別解答数のヒートマップ、連続学習日数 | B |
| 試験日カウントダウン | 次の試験日まであと何日か、全問を一巡するのに1日何問必要か | B |
| データの削除 | 利用者が自分の記録とアカウントを削除できる | A |

### 3.4 独自の提案

| 機能 | 内容 | 優先 |
|---|---|---|
| ○×一問一答モード | 4択問題の各選択肢を「正しい／誤り」の○×問題にばらして出題。同じ770問から約3,000問の○×問題ができる。「誤っているものはどれか」形式の対策に強い（§5の `polarity` から自動生成） | B |
| おすすめ復習 | 管理者が苦手問題などから復習セットを作り、その利用者のホームに「おすすめ復習」として表示する。**作成者名・「宿題」「先輩から」などの表現は出さず、期限や未実施の催促もしない**。自動で出る「今日の復習」と同じ見た目・トーンにする | B |
| 数字暗記カード | 「5日以内」「30日以内」「0.1%」「85μW/cm²」など、試験に出る数字だけを集めたカード | C |
| 間違え方の分析 | 誤答の選択肢の傾向（例：「誤っているもの」を「正しいもの」と取り違えている）を表示 | C |

## 4. スマホUI

### 4.1 画面構成

- **下部タブバー**（固定）：ホーム／出題／記録／設定。管理者だけ「管理」タブが追加される。
- 画面一覧：

| 画面 | パス | 内容 |
|---|---|---|
| ログイン | `/` | Googleログイン、「ログインせずに使う」、記録の扱いの一文 |
| ホーム | `/home` | 「続きから」「今日の復習」「おすすめ復習」のカード、成績の要約 |
| 出題条件 | `/setup` | 回・分野・出題数・順番・絞り込みの設定 |
| 出題 | `/quiz` | 1問ずつ解く |
| 結果 | `/result` | セットの成績、間違えた問題一覧 |
| 記録 | `/stats` | 分野別・回別の成績、カレンダー |
| 設定 | `/settings` | 表示名、文字サイズ、ダークモード、データ削除、ログアウト |
| 管理 | `/admin` | §7 |

ハッシュルーティング（`/#/quiz`）を使う（GitHub Pagesでリロードしても404にならないように）。

### 4.2 出題画面のレイアウト

```
┌───────────────────────┐
│ ← 12/20  ━━━━━━━━░░░░  ★ │ ← 上部：戻る・進捗バー・チェック
│ 第54回 問12 ｜ 公衆衛生     │
├───────────────────────┤
│ 問題文（スクロール可）       │
│ 図（タップで拡大）           │
├───────────────────────┤
│ ┌───────────────────┐ │
│ │ (1) 選択肢…          │ │ ← 選択肢は横幅いっぱいのカード
│ └───────────────────┘ │    高さ最低56px、間隔8px
│ ┌───────────────────┐ │
│ │ (2) 選択肢…          │ │
│ └───────────────────┘ │
│   …                     │
├───────────────────────┤
│ [ 次へ ]（解答後に表示）    │ ← 下部固定。親指で届く位置
└───────────────────────┘
```

### 4.3 UIの要件

- **親指で操作できる**：選択肢・「次へ」は画面下半分に置く。重要なボタンを画面上端に置かない。
- **タップ領域は最低48×48px**。選択肢カード全体をタップ可能にする。
- **誤タップ防止**：選択肢をタップしたら即確定（確認ダイアログは出さない）。ただし解答直後0.3秒は「次へ」を無効にして連打を防ぐ。
- **スワイプ**：解答後、左スワイプで次の問題へ。
- 文字は本文17px以上。設定で「標準／大／特大」を切り替えられる。
- 正誤は**色だけで伝えない**（○×アイコンと文字も併記）。色覚の違いに配慮する。
- 画面の高さは `100dvh`、下部は `env(safe-area-inset-bottom)` を考慮する（iPhoneのホームバーと重ならないように）。
- 入力欄は16px以上（iOSで勝手にズームしないように）。ダブルタップズームは無効にするが、ピンチズームは止めない。
- ダークモードはOS設定に追従し、設定で手動切替も可能。
- 正解・不正解時に軽い振動（Android。対応端末のみ、設定でOFF可）。
- 読み込み中はスケルトン表示。通信できないときも、出題と解答は続けられる（記録は後で送信）。
- 横画面でも崩れない。PCでは中央に最大幅480pxで表示。

## 5. 問題データ仕様

`public/data/exams.json`（回の一覧）

```json
[{ "examNo": 54, "year": "令和8年度", "month": 9, "questionCount": 55 }]
```

`public/data/exam-54.json`（1回分）

```json
{
  "examNo": 54,
  "questions": [
    {
      "id": "54-01",
      "examNo": 54,
      "no": 1,
      "fieldId": "law",
      "stem": "美容師法に関する次の記述のうち、[[u:誤っているもの]]はどれか。",
      "polarity": "incorrect",
      "statements": null,
      "choices": ["…", "…", "…", "…"],
      "answer": 2,
      "images": [],
      "explanation": {
        "summary": "…",
        "perChoice": ["…", "…", "…", "…"],
        "traps": ["30日以内"],
        "keyPoint": "数字の整理：名簿訂正＝30日以内／免許証返納＝速やかに",
        "sources": [
          { "title": "美容師法施行規則 第7条", "url": "https://…", "type": "law" }
        ],
        "crossChecked": 2,
        "confidence": "high",
        "status": "published",
        "asOf": "2026-11"
      },
      "caution": null,
      "ocrChecked": false
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | `"{回}-{問題番号2桁}"`。正規表現 `^(4[1-9]\|5[0-4])-(0[1-9]\|[1-4][0-9]\|5[0-5])$` |
| `stem` | string | 問題文。下線は `[[u:…]]` という独自記法で持つ（HTMLは使わない。§8.4） |
| `polarity` | `"correct"` \| `"incorrect"` \| `"other"` | 「正しいもの」「誤っているもの/該当しないもの」「それ以外（語句の組合せ・図など）」。○×モードの生成に使う |
| `statements` | `{label, text}[]` \| null | 組合せ問題のa〜d |
| `choices` | string[4] | 選択肢 |
| `answer` | 1〜4 | 正答番号（`scoringExcluded` のときは 0） |
| `altAnswers` | number[]（省略可） | 公式に複数の選択肢が正解とされた問題の、`answer` 以外の正解番号（§14） |
| `scoringExcluded` | true（省略可） | 公式に正解となる選択肢がなく、採点対象外の問題（§14） |
| `images` | string[] | 図のパス |
| `explanation` | object \| null | 解説。中身と作り方は§6.7 |
| `caution` | string \| null | 注意フラグの注記 |
| `ocrChecked` | boolean | 原本と照合済みか |

分野は問題番号から決まる（新制度は全回共通）。

| fieldId | 分野 | 問題番号 |
|---|---|---|
| `law` | 関係法規・制度及び運営管理 | 1〜10 |
| `public_health` | 公衆衛生・環境衛生 | 11〜15 |
| `infection` | 感染症 | 16〜20 |
| `hygiene` | 衛生管理技術 | 21〜25 |
| `anatomy` | 人体の構造及び機能 | 26〜30 |
| `skin` | 皮膚科学 | 31〜35 |
| `cosmetics` | 香粧品化学 | 36〜40 |
| `theory` | 文化論及び美容技術理論 | 41〜55 |

## 6. データ作成とFirestore設計

### 6.1 過去問データの作成（Claude Codeが行う）

1. `scripts/fetch-pdfs.ts`：公式の「過去の筆記試験問題」ページから第41〜54回の美容師（新試験）PDFのURLを取得し、`raw/pdf/` にダウンロードする。
2. `python scripts/pdf-to-png.py`（PyMuPDF、200dpi）でページ画像にする（`raw/pages/`）。※当初は `pdftoppm -r 200 -png` の予定だったが、Windows で追加バイナリなしに確実に動く PyMuPDF に変更した（§14）。
3. Claude Codeがページ画像を読み、§5の形式でJSONを作る。正答は〇印がついた選択肢。
4. 図は該当部分を切り出してWebPで保存する。
5. `scripts/validate.ts` で検証：各回55問、番号の重複なし、`choices` が4つ、`answer` が1〜4、`fieldId` と番号が一致、`id` が正規表現に合う。
6. 読み取りに自信がない問題は `ocrChecked: false` とし、`docs/ocr-review.md` に一覧を出す。
7. 解説は§6.7のルールで作成する。

`raw/` はコミットしない。

### 6.2 認証

- Googleログインのみ。`signInWithPopup` を使う。
- アプリ内ブラウザ（LINE・Instagramなど）を User-Agent で検知したら、ログインボタンの代わりに「Safari / Chromeで開いてください」とURLコピーボタンを出す。配布URLには `?openExternalBrowser=1` を付ける。
- ゲストモードの記録は端末内（IndexedDB）に保存する。ログインしたら引き継ぐか確認する。

### 6.3 Firestore データモデル

利用者1人あたりのドキュメント数に上限がつくように設計する（不正な大量書き込みを防ぐため）。

```
users/{uid}
  displayName: string(1〜30)        // 初回はGoogleの表示名。設定で変更可（プロフィール画像は保存しない）
  createdAt, lastActiveAt: timestamp
  totals: { answered: int, correct: int }
  byField: { law: {answered, correct}, ... }   // 8分野のみ
  examBest: { "54": int, ... }                 // 回別の最高点
  syncSeq: int                                 // 記録の送信の連番。送信ごとに＋1（二重加算の防止。§14）

users/{uid}/progress/{questionId}     // 問題ごとに1件。最大770件
  attempts, correctCount: int
  history: string                     // 直近10回の正誤 "○×○" 
  lastAnsweredAt: timestamp
  checked: bool
  nextReviewAt: timestamp | null      // 間隔反復用

users/{uid}/days/{YYYY-MM-DD}         // 1日1件。書き込めるのは「今日（日本時間）と前日」のドキュメントだけ
  answered, correct: int
  sessions: [{mode, total, correct, endedAt}]   // 最大50件

users/{uid}/assignments/{autoId}      // おすすめ復習（管理者が作成。画面上は作成者を表示しない）
  title: string, questionIds: string[](最大55), createdAt, doneAt | null

reports/{uid}_{questionId}             // 解説への報告。1人1問につき1件（IDを固定して大量投稿を防ぐ）
  questionId: string, kind: "unclear" | "wrong" | "other",
  comment: string(0〜300), uid: string, createdAt: timestamp

admin/ping                             // 管理者判定用の空ドキュメント（管理者だけ読める）
```

- **メールアドレスはFirestoreに保存しない**（必要最小限のデータだけを持つ）。

### 6.4 書き込みの方針

- 1問ごとには書かない。**10問ごと／セット終了時／アプリが背面に回ったとき**に `writeBatch` でまとめて書く。
- 未送信分はIndexedDBに置き、通信が戻ったら送信する（Firestoreのオフライン永続化を有効にする）。
- 起動時は `users/{uid}` の1件だけを読む。`progress` は出題条件で必要になったときに読み、端末にキャッシュする。

### 6.5 管理者の判定

- 管理者は**メールアドレス＋メール確認済み**で判定する（UIDを手で調べる作業をなくすため）。
- 管理者のメールアドレスはリポジトリに書かない。`firestore.rules.template` に `__ADMIN_EMAIL__` と書き、ルールをデプロイするときに `.env.local`（コミットしない）の値で置き換える。
- **フロントのJSには管理者のメールアドレスを入れない**（ビルドしたJSは誰でも読めるため）。フロントは、管理者だけが読める `admin/ping` ドキュメントの読み込みを試し、成功したら管理タブを表示する。

### 6.7 解説作成のルール

解説はこのアプリの価値の中心なので、正確さを最優先にする。

#### 作る順番

**新制度の全回（第41〜54回、770問）すべてに解説を付ける**。作業は第54回→第53回→…→第41回の順に進める（新しい回ほど出題傾向が今に近く、先に使われるため）。

#### 1問あたりの手順

1. **下書き**：AIが問題文・選択肢・正答から下書きを書く。
2. **根拠の確認**：各選択肢の正誤の理由を、§6.7.1の優先順位で根拠となる資料に当たって確認する。根拠のURLを `sources` に記録する。
3. **結論の照合**：既存の解説サイト（KOREBI、過去問ドットコムなど）と**結論だけ**を照合する（正答番号、各選択肢の正誤、「どの語句が誤りか」）。照合できたサイト数を `crossChecked` に記録する。
4. **食い違いの処理**：正答が公式と合わない、根拠同士が矛盾する、既存サイトと結論が違う場合は、**推測で埋めずに** `confidence: "low"` とし、`docs/explanation-review.md` に理由を書いて管理者に報告する（確信度の基準は§6.7.7）。
5. **法令・統計の時点確認**：法令・制度・統計に関わる問題は、**現在**の内容と出題当時の内容を比べる。変わっていれば `caution` に「出題時は○○、現在は△△」と書き、`asOf`（確認した年月）を入れる。
6. **自己チェック**：§6.7.4のチェックリストを満たしてから `status: "published"` にする。

#### 6.7.1 根拠の優先順位

| 順位 | 種類（`type`） | 例 |
|---|---|---|
| 1 | `law` 法令 | e-Gov法令検索（美容師法・施行令・施行規則、労働基準法、薬機法など） |
| 2 | `gov` 国・自治体・公的機関 | 厚生労働省、都道府県の衛生関係ページ、国立感染症研究所、理容師美容師試験研修センター |
| 3 | `academic` 学会・専門機関・メーカーの技術資料 | 日本皮膚科学会、化粧品メーカーの成分解説など |
| 4 | `edu` 養成施設・教育機関の資料 | 美容専門学校が公開している対策資料 |
| 5 | `site` 解説サイト | **結論の照合にだけ使う。根拠としては使わない** |

- 法規・制度の問題は、順位1か2の根拠が見つかるまで `confidence: "high"` にしない。
- 教科書（日本理容美容教育センター発行）にしか載っていない内容は、根拠が確認できない旨を `docs/explanation-review.md` に書き、管理者が教科書で確認する。

#### 6.7.2 やってはいけないこと

- 既存サイトの解説文をコピーする、言い回しを変えて流用する、文章の構成をまねる。
- 解説サイトを機械的に大量取得する（スクレイピング）。照合は1問ずつ、必要なページだけ見る。
- 根拠が見つからない内容を、もっともらしく書く。分からない部分は「要確認」と明記する。
- 正答を公式（〇印）から変える。公式の正答が現在の法令と合わない場合も正答は変えず、`caution` で説明する。

#### 6.7.3 解説の書き方

- **読む人**：美容専門学校の学生。専門用語には一言で説明を添える（例：「けん化（油脂にアルカリを加えて分解すること）」）。
- **`summary`**：最初の1文で「なぜその選択肢が正答か」を言い切る。全体で3〜6文。
- **`perChoice`**：4つ全部書く。誤りの選択肢は「どこが誤りで、正しくは何か」を書く（例：「30日以内ではなく『速やかに』」）。正しい選択肢も、なぜ正しいかを1文で書く。
- **`traps`**：その問題を誤りにしている語句。出題画面で強調表示する。
- **`keyPoint`**：「ここだけ覚える」1〜2行。似た数字・用語の整理（例：O/W型とW/O型の違い）。
- 計算問題（希釈など）は、式と途中の計算をすべて書く。
- 断定できないことは断定しない。「〜とされる」「教科書では〜」と書き分ける。
- 文体は短い常体で統一（例：「〜は誤り。正しくは〜」）。

#### 6.7.4 公開前のチェックリスト

- [ ] 正答番号が公式の〇印と一致している
- [ ] 4つの選択肢すべてに理由が書かれている
- [ ] 各選択肢の理由に根拠（`sources`）がある、または「要確認」と明記されている
- [ ] 法令・統計の問題は現在の内容を確認し、`asOf` を入れた
- [ ] 既存サイトと結論を照合し、食い違いがあれば報告した
- [ ] 既存サイトの文章と似た言い回しになっていない
- [ ] 計算問題は途中式がある

#### 6.7.5 `explanation` のフィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `summary` | string | 全体の解説 |
| `perChoice` | string[4] | 選択肢ごとの解説 |
| `traps` | string[] | 強調する語句 |
| `keyPoint` | string \| null | ここだけ覚えるポイント |
| `sources` | `{title, url, type}[]` | 根拠（§6.7.1の `type`） |
| `crossChecked` | int | 結論を照合できた解説サイトの数 |
| `confidence` | `"high"` \| `"medium"` \| `"low"` | 確信度。基準は§6.7.7 |
| `status` | `"draft"` \| `"published"` | `draft` はアプリに表示しない（「解説準備中」と表示） |
| `asOf` | string \| null | 法令・統計を確認した年月 |

#### 6.7.6 アプリでの見せ方

- `confidence: "low"` の解説には「この解説は確認中です」と小さく表示する。
- 解説の下に根拠のリンク（`sources`）を折りたたみで表示する。
- 解説の下に「解説が分かりにくい／間違っているかも」報告ボタンを置く（§6.3 `reports`）。報告は管理画面に一覧表示する。

#### 6.7.7 確信度（`confidence`）の基準

| 確信度 | 基準 |
|---|---|
| 高（`high`） | 条文・官公庁などの**一次資料で裏づけが取れている**。解説サイトとの照合の有無は問わない |
| 中（`medium`） | 一次資料はないが、**複数の信頼できる資料で一致**している |
| 低（`low`） | **資料が乏しい**、または**資料の間で食い違い**がある |

当てはめ方：

- **一次資料**は、`sources` の種別が `law`（法令）と `gov`（官公庁・公的機関）のもの。法令のない分野（人体、皮膚科学、香粧品化学、文化論・技術理論など）では、`academic`（学会、大学の教科書、専門機関、医学事典、業界団体の技術資料）も一次資料として扱う。関係法規・制度（問1〜10）は、`law` か `gov` の裏づけがなければ高にしない。
- **高**にするのは、正答の根拠と、各選択肢（組合せ問題は各記述）の正誤が一次資料で裏づけられているとき。本文に「要確認」と書いた、裏づけのない選択肢・記述が残っている問題は高にしない。正答に関わらない選択肢1つが養成施設の資料（`edu`）で裏づけられているだけ、という程度なら高のままでよい。
- **中**は、一次資料では裏づけきれないが、`sources` が1件以上あり、ほかの資料（別の `sources`、または解説サイト）と結論が一致しているとき。
- **低**は、`sources` が0件のとき（解説サイト何件と一致していても）、正答の根拠そのものを資料で確かめられていないとき、資料どうし・資料と解説サイト・解説サイトの中で説明が食い違っているとき。解説サイトの一部の解説だけが条文と違い、条文で確かめられている場合は、食い違いとは扱わない。
- `crossChecked`（照合できた解説サイトの数）は記録として残すが、高かどうかの判定には使わない。
- 検証（`scripts/validate.ts`）で止めるもの：`sources` が0件なのに高・中／関係法規・制度で `law`・`gov` の根拠がないのに高／低なのに確認待ちの理由（`review`）がない。

## 7. 管理画面（`/admin`）

- **利用者一覧**：表示名、最終利用日、累計解答数、全体正答率、直近7日の解答数。最終利用日順。
- **利用者の詳細**：分野別正答率（弱い順）、日別解答数、苦手問題（2回以上解いて正答率の低い順）、回別の成績。
- **この人の苦手問題で出題**：管理者の端末でその問題セットを解ける（勉強会用）。
- **おすすめ復習を作る**（B）：苦手問題などから復習セットを作り、その利用者のホームに「おすすめ復習」として表示する。
- **OCR確認待ちの一覧**：`ocrChecked: false` の問題。
- **解説の確認待ち・報告の一覧**：`confidence: "low"` の問題と、利用者からの報告（`reports`）。
- 管理画面の表示は管理者判定で出し分けるが、**データを守るのはセキュリティルール**（§8.1）。

## 8. セキュリティ

### 8.1 Firestore セキュリティルール

方針：**明示的に許可したもの以外はすべて拒否**。書き込みは型・キー・値の範囲・サイズを全部検査する。

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
    function isAdmin() {
      return signedIn()
        && request.auth.token.email == '__ADMIN_EMAIL__'
        && request.auth.token.email_verified == true
        && request.auth.token.firebase.sign_in_provider == 'google.com';
    }
    function isValidQid(q) {
      return q.matches('^(4[1-9]|5[0-4])-(0[1-9]|[1-4][0-9]|5[0-5])$');
    }
    function isNonNegInt(v, max) { return v is int && v >= 0 && v <= max; }
    // request.time を日本時間の "YYYY-MM-DD" に変換する（実装時に関数として書く）
    // function jstDate(t) { ... }

    match /users/{uid} {
      allow read: if isOwner(uid) || isAdmin();
      allow create, update: if isOwner(uid) && validUser(request.resource.data);
      allow delete: if isOwner(uid);

      match /progress/{qid} {
        allow read: if isOwner(uid) || isAdmin();
        allow write: if isOwner(uid) && isValidQid(qid)
                     && validProgress(request.resource.data);
        allow delete: if isOwner(uid);
      }
      match /days/{day} {
        allow read: if isOwner(uid) || isAdmin();
        // 今日か前日（日本時間）のドキュメントだけ書ける。過去・未来の日付を大量に作れないようにする
        allow create, update: if isOwner(uid)
                     && (day == jstDate(request.time) || day == jstDate(request.time - duration.value(1, 'd')))
                     && validDay(request.resource.data);
        allow delete: if isOwner(uid);
      }
      match /assignments/{aid} {
        allow read: if isOwner(uid) || isAdmin();
        allow create: if isAdmin() && validAssignment(request.resource.data);
        allow delete: if isAdmin();
        // 利用者は doneAt だけ、timestamp型で、現在時刻にだけ更新できる
        allow update: if isOwner(uid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['doneAt'])
          && request.resource.data.doneAt == request.time;
      }
    }

    match /reports/{rid} {
      // ドキュメントIDは "{uid}_{questionId}" に固定。1人1問1件まで
      // 作成のみ。本人のuid・正しい問題ID・決まった種類・文字数上限・作成時刻=request.time を検査
      allow create: if signedIn()
        && rid == request.auth.uid + '_' + request.resource.data.questionId
        && request.resource.data.keys().hasOnly(['questionId','kind','comment','uid','createdAt'])
        && request.resource.data.uid == request.auth.uid
        && isValidQid(request.resource.data.questionId)
        && request.resource.data.kind in ['unclear','wrong','other']
        && request.resource.data.comment is string
        && request.resource.data.comment.size() <= 300
        && request.resource.data.createdAt == request.time;
      allow read: if isAdmin();
      // 管理者と、報告した本人（アカウント削除時）は削除できる
      allow delete: if isAdmin() || (signedIn() && resource.data.uid == request.auth.uid);
      allow update: if false;
    }

    match /admin/ping {
      allow read: if isAdmin();
      allow write: if false;
    }

    // ここに書いていないパスはすべて拒否（Firestoreの既定動作）


    // validUser / validProgress / validDay / validAssignment では
    //  - keys().hasOnly([...]) で許可したキー以外を拒否
    //  - 型（int / string / timestamp / bool）を検査
    //  - 数値の上限（answered ≤ 100000 など）、文字列長、配列長（sessions ≤ 50）を検査
    //  - correct ≤ answered などの整合性を検査
    //  - lastActiveAt / lastAnsweredAt は request.time と一致させる（時刻の偽装を防ぐ）
    //  - history は '^[○×]{0,10}$' に一致すること
    //  - createdAt は作成時だけ request.time と一致させ、更新では変更不可
  }
}
```

- 管理者でも他人の記録は**読むだけ**（おすすめ復習を除き、書き込み不可）。
- ルールは**自動テストで検証**する（Emulator＋@firebase/rules-unit-testing）。最低限のテスト項目：
  - 未ログインでは何も読めない／書けない
  - 他人の `users` / `progress` / `days` を読めない・書けない
  - 管理者以外はおすすめ復習を作れない
  - 許可していないキー、不正な型、上限を超える値、不正な問題IDを拒否する
  - 利用者がおすすめ復習の `doneAt` 以外を変更できない
  - `reports` は本人のuidでしか作れず、IDが `{uid}_{問題ID}` 以外なら拒否、更新できず、管理者以外は読めない
  - `days` は今日・前日以外の日付に書けない
  - 管理者がおすすめ復習を削除できる（v2のルールの不具合の再発防止）
  - 管理者でない人は `admin/ping` を読めない
  - 記録の送信は `users/{uid}.syncSeq` が「前回＋1」のときだけ通り、同じ送信の再送は拒否される。`progress`・`days` は syncSeq を進める送信の中でしか書けない
  - 1回の送信で増やせる解答数は55まで、正解数の増加は解答数の増加以下（`users` の totals・byField、`progress`、`days` のすべて）
- テストが通らないとデプロイしない（CIで実行）。

### 8.2 Firebase 側の設定

- **Sparkプラン（無料・課金なし）を維持**。
- **App Check（Fraud Defense＝reCAPTCHA Enterprise）を有効化し、Firestoreで強制（Enforce）**。スコアのしきい値は 0.3（Sparkプランで選べる 0.1 / 0.3 / 0.7 / 0.9 のうち。厳しすぎて本人がログインできなければ 0.1 に下げる）。Authenticationでの強制は、無料プランで使えるか実装時に確認し、使えれば有効化する。他のサイトやスクリプトからAPIを叩かれるのを防ぐ。
- **無料枠を使い切られた場合**：Sparkプランなので請求は発生せず、その日は止まって翌日に戻る。管理画面に「本日の書き込みが多すぎる」警告を出せるよう、`users` の更新回数が異常な利用者を一覧で目立たせる。
- **APIキーの制限**：ブラウザ用APIキーを、HTTPリファラー `https://eggplant-umrk.github.io/*` と `http://localhost:*` に限定し、使うAPI（Identity Toolkit、Secure Token、Firestore、App Check）だけ許可する。
- **承認済みドメイン**：`eggplant-umrk.github.io` と `localhost` だけにする。
- Authenticationで**メール列挙保護**を有効化。ログイン方法はGoogleだけ（メール／パスワード等は無効）。

### 8.3 ページ側の対策

- **CSP**（GitHub Pagesはレスポンスヘッダーを設定できないので `<meta http-equiv="Content-Security-Policy">` で設定。本番ビルドにだけ入れる。開発サーバーはReactのインラインスクリプトを使うため）。フェーズ1・2は外部通信がないので `'self'` だけにし、Google・Firebase・reCAPTCHAのドメインはフェーズ3でFirebaseを入れるときに追加する（§14）：
  - `default-src 'self'`
  - `script-src 'self' https://apis.google.com https://www.gstatic.com https://www.google.com/recaptcha/`
  - `connect-src 'self'` ＋ Firestore・Identity Toolkit・Secure Token・App Check・reCAPTCHAのドメイン
  - `frame-src` ＋ `https://{project}.firebaseapp.com https://www.google.com/recaptcha/`
  - `img-src 'self' data:`
  - `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`
  - インラインスクリプト禁止（`'unsafe-inline'` を使わない）。vite-plugin-pwa は `injectRegister: 'script'` にして、Service Worker登録コードを外部ファイルにする
  - `img-src` からGoogleのプロフィール画像ドメインは外す（画像は表示しない）
  - `<meta>` のCSPでは `frame-ancestors` が効かないため、埋め込み対策は下記のJSで行う
- `<meta name="referrer" content="strict-origin-when-cross-origin">`、`<meta name="robots" content="noindex, nofollow">`
- **アクセス解析・広告など外部スクリプトは入れない**。
- 他サイトへの埋め込み（クリックジャッキング）対策として、`window.top !== window.self` なら表示しない。

### 8.4 コード側の対策

- **`dangerouslySetInnerHTML` / `innerHTML` を使わない**。下線（`[[u:…]]`）や強調は自前の小さなパーサーでReact要素に変換する。
- ユーザーが入力するのは表示名だけ。長さ1〜30文字、制御文字を除去してから保存・表示する。
- Firebaseの設定値（APIキーなど）は公開されても問題ない値だが、管理者メールなど秘密にしたい値はリポジトリに含めない（`.env.local` と GitHub Secrets）。
- ログアウト時に端末内のキャッシュ（IndexedDB・Firestoreのオフラインキャッシュ）を消去する（`terminate()` → `clearIndexedDbPersistence()`）。
- **アカウント削除**は、`progress`・`days`・`assignments`・自分の `reports`・`users/{uid}` をすべて削除してから、Firebase Authのユーザーを削除する。直前に再ログインを求める。

### 8.5 リポジトリ・CIの対策

- GitHub Actionsは**サードパーティのActionをコミットSHAで固定**し、ワークフローの `permissions` は最小限（`contents: read`、デプロイジョブだけ `pages: write` と `id-token: write`）。
- `package-lock.json` をコミットし、CIでは `npm ci`。`npm audit --audit-level=high` で失敗させる。
- Dependabot（npm・GitHub Actions）を有効化。
- `main` ブランチを保護（CI成功を必須、force push禁止）。
- Secret scanning と push protection を有効化。

### 8.6 残るリスク（受け入れるもの）

| リスク | 内容 | 受け入れる理由 |
|---|---|---|
| 自分の成績の改ざん | 利用者は自分の記録を（ルールの範囲内で）書き換えられる。成績はブラウザで計算するため | 被害を受けるのは本人だけ。防ぐにはサーバー処理（有料プラン）が必要 |
| 無料枠の使い切り | 多数のGoogleアカウントで大量に書き込まれると、その日はサービスが止まる | 請求は発生しない。App Checkと書き込み上限でかなり難しくしてある |
| 表示名が見える | 管理者には利用者のGoogle表示名が見える | ログイン画面で記録の扱いを明記。表示名は設定で変えられる |
| サイト自体は公開 | URLを知っていれば誰でも開ける | 問題データは公開情報。記録はルールで守る |

## 9. 非機能要件

- 初回表示（問題データを除く）はgzip後200KB以下を目標。Firebase SDKは必要なモジュールだけimportし、Firestore・Authはログイン画面以降で遅延読み込みする。
- iPhone Safari と Android Chrome の最新版で動作確認する（PlaywrightのiPhone・Pixelのエミュレーション）。
- 利用者が数人の規模で、Firestoreの無料枠（読み込み5万回/日・書き込み2万回/日）の10%以内に収まること。

## 10. 開発フェーズ

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| 1. 骨組み | Vite＋React＋TS、PWA、GitHub Pagesデプロイ、出題画面（サンプル5問）、ゲストモード、スマホUI | スマホで5問解けて、ホーム画面に追加できる |
| 2. データ | PDF取得→JSON化→検証（第54回→第41回の順） | 770問がそろい、検証が通る |
| 3. ログイン・記録 | Firebase構築（§11）、Googleログイン、記録の保存、ホームと記録画面 | 別端末でも記録が見える |
| 4. セキュリティ | ルール＋ルールのテスト、App Check、APIキー制限、CSP、CI | ルールのテストが全部通り、CIでデプロイされる |
| 5. 管理画面 | 利用者一覧・詳細、苦手問題で出題 | 管理者以外は他人の記録を読めない（テストで確認） |
| 6. 解説 | §6.7のルールで第54回→第41回の順に作成 | 新制度の全770問が `published` になり、`low` はすべて報告済み |
| 7. 機能追加 | 優先度Bの機能 | 順次 |

## 11. Firebase・GitHubの構築（Claude Codeが行う）

Claude Codeは以下をCLI（`firebase` / `gcloud` / `gh`）で実行する。

1. Firebaseプロジェクトの作成（`firebase projects:create`）とWebアプリの登録（`firebase apps:create web`）。設定値を `.env.local` に書き込む
2. Firestoreの作成（東京リージョン）
3. 承認済みドメインの設定（Identity Toolkit API）
4. APIキーの制限（`gcloud services api-keys update`）
5. セキュリティルールのテンプレートから本番ルールを生成し、デプロイ
6. GitHubリポジトリ作成、GitHub Pagesの有効化、Secretsの登録（`gh secret set`）、ブランチ保護・Dependabot・Secret scanningの有効化（`gh api`）

各手順は `scripts/setup/` にスクリプトとして残し、やり直せるようにする。

## 12. 人の手作業（これだけ）

| # | 作業 | 理由 |
|---|---|---|
| 1 | `firebase login` / `gcloud auth login` / `gh auth login` で、ブラウザに出る画面でログインする | 本人のGoogle/GitHubアカウントの認証は本人しかできない |
| 2 | Firebaseコンソールで「Authentication → Google」を有効にする（ボタン2回） | Googleログイン用のOAuth設定がコンソールでしか自動作成されない |
| 3 | Google Cloud コンソールの Fraud Defense（reCAPTCHA Enterprise）でスコアベースのWebサイト用キーを作り、App Check に登録して、サイトキーをClaude Codeに渡す | 本人の Google アカウントでのコンソール操作が必要（§14） |
| 4 | 管理者として使うGoogleアカウントのメールアドレスをClaude Codeに伝える | `.env.local` に入れる |
| 5 | （任意）`docs/ocr-review.md` に出た問題を原本と見比べる | 読み取り間違いの最終確認 |

## 13. 開発ルール

- コミット・PRは、リポジトリに `docs/GitHub運用ルール.md` があればそれに従い、PRテンプレートがあれば使う。
- セキュリティルールのテストとE2Eが通らない変更はマージしない。
- `docs/GitHub運用ルール.md` がない間は、次の運用にする：作業ごとにブランチ（`feat/…`・`fix/…`・`chore/…`）を切り、PR（`.github/pull_request_template.md`）で `main` に squash マージする。コミットのメールアドレスは GitHub の noreply アドレスを使う。

## 14. 実装時に仕様から変えたこと・決めたこと

| # | 項目 | 内容 | 理由 |
|---|---|---|---|
| 1 | PDFの画像化（§6.1） | `pdftoppm` ではなく PyMuPDF（`scripts/pdf-to-png.py`） | 開発環境がWindows。poppler の導入なしに pip だけで確実に動く |
| 2 | CSP（§8.3） | フェーズ1・2は `'self'` のみ。`style-src 'self'`・`frame-src 'none'`・`manifest-src`・`worker-src` を明示。Firebase関係のドメインはフェーズ3で追加 | 使わない外部ドメインを先に許可しない。FirebaseのプロジェクトID（`frame-src` に必要）もフェーズ3で決まる |
| 3 | サンプル問題（§10 フェーズ1） | フェーズ1では `public/data/exam-54.json` にダミー5問を置き、`exams.json` に `"sample": true` を付けた。フェーズ2で第41〜54回の実データに置き換え、`sample` フィールドと画面の「サンプル」表示を削除した。E2Eテストも実データ（最新の回の問1〜10）から期待値を計算する形にした | 実際の過去問の転記はフェーズ2で行う。ダミーなら内容の正確さの問題が起きない |
| 4 | ゲストモードの保存（§6.4） | 端末内（IndexedDB）には1問ごとにすぐ保存する。§6.4 のまとめ書きはFirestoreへの書き込みに適用する | 端末内の書き込みは無料・高速で、まとめると閉じたときに記録が消える恐れがある |
| 5 | 記録の削除の確認 | 確認ダイアログではなく「記録を削除する」→「本当に削除する」の2段階ボタン | `window.confirm` はPWA・自動テストで扱いにくい。誤操作は2段階で防げる |
| 6 | ブランチ保護（§8.5） | CI（`test` ジョブ）成功を必須・force push と削除を禁止・管理者にも適用。レビュー承認は必須にしない。マージは squash のみ | 開発者が1人なので、承認必須にするとマージできなくなる |
| 7 | 結果画面のタブバー | 結果画面にも下部タブバーを出す（出題画面だけ出さない） | 結果から記録・ホームへ移りやすくするため。出題中は誤タップ防止のため出さない |
| 8 | Node.js | 24（LTS）。`.nvmrc` で CI と合わせる | 開発環境に入っていた LTS 版 |
| 9 | CIのE2E実行環境 | CIのテストジョブは公式の Playwright コンテナイメージ（ダイジェスト固定）で動かす。`@playwright/test` は固定版にし、Dependabot の対象から外す。上げるときはイメージのタグ・ダイジェストも同時に更新する | ランナー上で `playwright install --with-deps` を実行すると apt の取得が遅く、20分でも終わらなかった |
| 10 | 過去問データの作り方（§6.1 手順3・6） | JSONを直接書かず、ページ画像の読み取り結果を `data-src/exam-{回}.txt`（独自のテキスト形式。書式は `data-src/README.md`）に書き、`scripts/build-data.ts` で `public/data/*.json`・`docs/ocr-review.md` を生成する。`id`・`fieldId`・`polarity` は自動で付ける | 770問を手でJSONに書くと、引用符・カンマ・番号の誤りが入りやすい。機械的に決まる項目は自動にしてミスを減らす |
| 11 | 二重チェック（§6.1 手順6） | 各ページの左端（問題番号・選択肢番号・〇印の列）だけを切り出した画像（`scripts/data/check-strips.py`）を本文とは別に読み直し、正答番号と選択肢の数を `data-src/check-{回}.txt` に書く。1回目と食い違う問題は自動で `ocrChecked: false` にする | 本文を見ずに読み直すことで、1回目の読み取りに引きずられない確認にする |
| 12 | `polarity` の決め方（§5） | 「正しいもの」「誤っているもの」でも、a〜dの組合せ問題・語句の組合せ（空欄補充や「A ― B」の対応）・図を使う問題は `other` にする | 選択肢1つずつを独立した○×問題にできないため（○×モードで意味が通らなくなる） |
| 13 | 図の中の正答の〇印（§6.1 手順4） | 公式PDFは正答に〇印が付いた版のため、図の中に〇印がある場合は、赤茶色の画素を周りの画素で埋めて消す（`scripts/data/crop-figure.py`）。消した問題は消し跡の目視確認のため `ocrChecked: false` にする | 図に〇印が残ると答えが見えてしまう。原本はモノクロで〇印だけ色付きなので機械的に消せる<br>**追記（2026-11-14）**：この消し方では跡（薄い輪・点線・線の欠け）が残り、図を見ただけで正答が分かる問題があった（〇印を消した14問のうち、調べた範囲では全部に何らかの跡があった）。`scripts/data/check-figure-marks.py` で、PDF の〇印の位置と切り出した図を見比べて跡を自動で検出し、`--fix` で〇印のまわりを PDF の元の図から作り直す（〇印の画素と、その内側の色のにじみを紙の色で埋める。文字・交わる線・矢印の先は残す）。〇印が網点の上にある図（第54回 問50）は自動では直さず、手作業で直す。結果は `data-src/figure-marks.json`、処理前後の比較は `docs/ocr-review.html` |
| 14 | 複数正解・正解なしの問題（§5） | 公式に複数の選択肢を正解とした問題は `altAnswers`、正解なし（採点対象外）の問題は `scoringExcluded: true`・`answer: 0` とし、どちらも `caution` に注記を入れる。採点対象外の問題は解いても記録・結果に含めない。第47回問17・第43回問50・第42回問40 は〇印が2つあるが、PDFに公式の注意事項がないため、暫定で両方を正解とし `ocrChecked: false` にした | 第49回のPDFに公式の注意事項（複数正解・正解なし）があり、§5の `answer`（1つ）だけでは表せないため |
| 15 | 表記のルール（§5） | 傍点は下線と同じ `[[u:…]]`（交ぜ書きの「り患」の傍点は付けない）。ルビは「語（よみ）」。空欄（□）は `［A］`、空欄補充の選択肢は「A：…　B：…」、語句の対応は「A ― B」、分数は「1/3」、図の番号を選ぶ選択肢は「(1)の図」のように書く | HTMLを使わない（§8.4）範囲で、原本の強調・読みがなを失わないため |
| 16 | `exams.json` の `year` | 試験日の属する年度（3月の試験は前年度。例：令和5年3月の第47回は「令和4年度」） | 公式の実施年度の数え方に合わせる |
| 17 | CI でのデータ検証（§8.5） | CI のテストジョブで `npm run validate -- --expect 41-54` を実行する | 問題データの壊れ（55問未満・図のファイル漏れなど）をマージ前に止める |
| 18 | Authentication の初期化（§11-3） | Authentication の初期化（コンソールの「始める」）は CLI/API ではできなかった（`BILLING_NOT_ENABLED`）。承認済みドメイン・メール列挙保護は、コンソールで Google ログインを有効にした後に `scripts/setup/firebase.sh` をもう一度実行して設定する | 無料プランでは Identity Platform の初期化 API が使えないため。コンソール操作は §12-2 でもともと必要 |
| 19 | APIキーのリファラー（§8.2） | `https://eggplant-umrk.github.io/*`・`http://localhost:*` に加えて `https://biyoushi-kakomon.firebaseapp.com/*` を許可 | Google ログインのポップアップ（`{project}.firebaseapp.com/__/auth/handler`）がこのキーで Identity Toolkit を呼ぶため。外すとログインできない |
| 20 | ログインを有効にする条件 | ビルドに Firebase の設定値と reCAPTCHA v3 のサイトキーが両方あるときだけ、ログインボタンを有効にする（なければ「準備中」） | App Check なしで Firestore を使う状態を本番に出さないため |
| 21 | 端末内の記録と送信（§6.4） | ログイン中も、画面は端末内の IndexedDB（`kakomon-user`。Firestore の記録の写し）を読み書きする。未送信分は同じDBの outbox に「増えた分」で貯め、10問ごと・セット終了時・出題画面を離れたとき・背面に回ったとき・通信が戻ったときに `writeBatch` で送る。回数は `increment()` で足す。Firestore のオフライン永続化は使わない（メモリキャッシュ） | 自前の outbox と Firestore の永続化を両方使うと、同じ記録を二重に送る恐れがある。`increment()` なら、2台の端末で解いても互いの記録を上書きしない |
| 22 | 起動時の読み込み（§6.4） | 起動時に読むのは `users/{uid}` の1件と、管理者判定の `admin/ping`。`users/{uid}.lastActiveAt` が前回の取り込みより新しいときだけ、それ以降に変わった `progress` と直近60日の `days` を読む。その端末で初めてログインしたときは `progress` を全件（最大770件）読む | ホーム・出題条件・記録画面をどれも端末内の写しから表示するため。別の端末で解いていなければ、起動時の読み込みは2件で済む |
| 23 | `lastAnsweredAt` の意味（§6.3 / §8.1） | `progress` の `lastAnsweredAt` は、チェック（★）だけを変えたときも `request.time` に更新する（「最後に更新した時刻」として使う） | ルールで `lastAnsweredAt == request.time` を必須にしているため。差分の取り込み（上の行）にも使える |
| 24 | 古い日付の日別記録（§8.1） | 通信できないまま2日以上たった未送信の日別記録（`days`）と、ゲストの記録を引き継ぐときの今日・前日より前の日別記録は、送らずに捨てる（問題ごとの記録と累計は引き継ぐ） | ルールで `days` に書けるのは今日と前日だけのため |
| 25 | ルールで調べきれない所（§8.1） | `days.sessions` は件数（最大50）と末尾の1件の中身、`assignments.questionIds` は件数（最大55）と先頭の1件だけを検査する | セキュリティルールには配列を1件ずつ調べる構文がないため。`sessions` は追加するたびに末尾が検査される。`assignments` は管理者しか作れない |
| 26 | アカウント削除のためのルール（§8.1 / §8.4） | `assignments` は本人も削除できる。`reports` は本人が自分の報告だけ読める（`uid` で絞り込んだ一覧だけ通る） | §8.4 のアカウント削除で、本人が自分の `assignments` と `reports` を消す必要があるため。§8.1 のままだと消せない |
| 27 | ルールのデプロイ（§8.1） | CI ではルールのテストだけを行い、本番へのデプロイは手元で `scripts/setup/deploy-rules.sh`（テスト→生成→デプロイ）を実行する | CI からデプロイするにはサービスアカウントの鍵を GitHub に置く必要がある。鍵を置かない方が安全で、ルールはめったに変わらない |
| 28 | E2E のログイン | E2E は Auth・Firestore Emulator に対して実行する（`vite build --mode e2e`）。ログインはポップアップではなく、Auth Emulator が受け付ける偽の Google ID トークンで行う。Emulator 用のコードは本番ビルドから消え、CI（`scripts/check-dist.sh`）で確認する。Windows 版の Playwright WebKit は Emulator と安定して通信できないので、Windows でだけ iPhone のログインテストを飛ばす（CI は Linux で実行） | 本物の Google ログインは自動テストできない。偽トークンでも `sign_in_provider` は `google.com` になるので、管理者判定まで本番と同じルールで試せる |
| 29 | firebase-tools と依存関係 | `firebase-tools` は devDependencies に入れず、手元は全体インストール、CI は版を固定して別の場所に入れる。`@grpc/grpc-js` は `overrides` で修正版に固定 | `firebase-tools` を入れると依存が大きく増え、`npm audit` の対象も増える。`firebase` が依存する古い `@grpc/grpc-js` に high の脆弱性報告があるため |
| 30 | CSP（§8.3） | `script-src` の `https://www.gstatic.com` は `https://www.gstatic.com/recaptcha/` に絞った。`connect-src` は Firestore・Identity Toolkit・Secure Token・App Check（`content-firebaseappcheck.googleapis.com`）・reCAPTCHA。`frame-src` は `{project}.firebaseapp.com` と reCAPTCHA。Firebase の設定値がないビルドでは `'self'` のまま | 使うものだけを許可する |
| 31 | 表示名の入力欄（§8.3） | 表示名の変更は `<form>` を使わず、ボタンと Enter キーで保存する | CSP を `form-action 'none'` にしているため |
| 32 | フェーズ3・4で作っていないもの | 回別の最高点（`examBest`）の記録と、解説への報告ボタン（`reports` への書き込み）は、ルールとテストだけ用意した | 本番模試モード（§3.1）と解説（フェーズ6）がまだないため。それぞれを作るときに画面を足す |
| 33 | App Check のプロバイダ（§2 / §8.2） | reCAPTCHA v3（Classic）をやめ、Fraud Defense（旧称 reCAPTCHA Enterprise）のスコアベースのWebサイト用キー（表示名 `biyoushi-kakomon-appcheck`、ドメイン `eggplant-umrk.github.io`・`localhost`）を使う。アプリは `ReCaptchaEnterpriseProvider`。App Check のしきい値は 0.3。キーはサイトキーだけを使い、シークレットキーは扱わない。以前作った reCAPTCHA v3 のキーは使わない（App Check には登録していない） | App Check のコンソールで reCAPTCHA Classic が非推奨と表示された。Firebase のドキュメントでは Spark プランでも reCAPTCHA Enterprise を使え、スコアが 0.1 / 0.3 / 0.7 / 0.9 の4段階に限られるだけとされている。Google Cloud コンソールでのキー作成・App Check への登録で課金（Blaze）は求められなかった |
| 34 | 記録の二重加算の防止（§6.4 / §8.1） | `users/{uid}` に送信の連番 `syncSeq`（作成時 0）を持たせる。記録の送信（writeBatch 1回）では `syncSeq` を「前回＋1」の値にし、ルールは「前回＋1」のときだけ許可する。`progress`・`days` の書き込みは、同じ writeBatch で `syncSeq` を進めている（`getAfter` と `get` の比較）ときだけ許可する。アプリは送る分と連番を端末内（`inflight`）に保存してから送り、再送では同じものを送る。再送が拒否され、Firestore の `syncSeq` がその連番以上になっていれば「届いていた」とみなして未送信分から消す。初めての送信が拒否されたとき（別の端末が先に同じ連番を使った等）は、作り直して送る | `increment()` で足す方式では、届いたのに応答が来なかった送信を再送すると二重に足される。連番なら2回目をルールで止められる。残るあいまいさ：送信の結果が分からないまま、別の端末が先に次の連番で送った場合は、届いていない送信を「届いた」とみなす可能性がある（1人で2台を同時に使う場合だけ。受け入れる） |
| 35 | 1回の送信で増やせる量（§8.1） | 1回の送信で増やせる解答数は55まで、正解数の増加は解答数の増加以下（`users` の totals と8分野の byField、`progress` の attempts・correctCount、`days` の answered・correct）。減らす更新は拒否。アプリは未送信分を55問ずつに分けて送る（1問だけで55を超える場合はその問題を分けて送る）。`users/{uid}` の作成時は記録をすべて 0 にする。表示名の変更など `syncSeq` を進めない更新では、記録（totals・byField・examBest）を変えられない | ルールの検査をすり抜けて記録を一度に大きく書き換えられないようにする。55は1回分の試験の問題数 |
| 36 | E2E の WebKit のエラー | ログインの E2E で、ページを読み込み直したときに WebKit が出す Firestore の通信の中断エラー（`access control checks`）と、その直後の「バックエンドに接続できない」、通信の確認用の `www.google.com/images/cleardot.gif` が CSP で止められたエラーは、アプリの不具合として数えない。ログアウト後の確認は、ページの読み込み直しが終わってから行う | iPhone（WebKit）でだけ、読み込み直しで切れた通信がコンソールのエラーとして出て、CI が失敗していた。記録の同期そのものはテストで確かめている |
| 37 | App Check の強制（§8.2） | Firestore と Authentication の両方で App Check を強制した（2026-11-10。`scripts/setup/appcheck.sh enforce firestore` / `enforce auth`）。Authentication での強制は、Spark プラン・Identity Platform へのアップグレードなし（`subtype: FIREBASE_AUTH`）のままで設定でき、実際に効いた。確認方法：本番でログインしたブラウザから、同じリクエストを App Check のトークンなし／ありで送った。Firestore の読み込みは 403／200（設定から約20秒後）、Identity Toolkit の `accounts:lookup`・`accounts:createAuthUri` は 401「Firebase App Check token is invalid.」／200（設定の約1分半後はまだ通り、20分後には拒否されていた）。ログインできなくなったときは `appcheck.sh unenforce auth` で戻す | §8.2 の「Authentication での強制は、無料プランで使えるか実装時に確認し、使えれば有効化する」の結果 |
| 38 | 承認済みドメイン（§8.2） | `eggplant-umrk.github.io`・`localhost` に加えて `biyoushi-kakomon.firebaseapp.com` を残す。外したのは `biyoushi-kakomon.web.app` だけ | Google ログインのポップアップ（`{project}.firebaseapp.com/__/auth/handler`）が使うドメインのため |
| 39 | Service Worker の更新（§2） | 登録を `registerSW.js`（`injectRegister: 'script'`）から `virtual:pwa-register`（`src/main.tsx`）に変え、Workbox の `skipWaiting`・`clientsClaim` を明示した。新しい版はすぐ有効になり、開いているページは自動で読み込み直される | 以前の設定では、新しい版の Service Worker が「待機中」のまま、アプリを完全に閉じるまで切り替わらなかった（PR #4 のデプロイ後、開いたことのあるブラウザでログインボタンが「準備中」のままだった）。登録コードはバンドルされた外部ファイルになるので、インラインスクリプトは増えない |
| 40 | reCAPTCHA のキー | 以前作った reCAPTCHA v3 のキー（表示名 `biyoushi-kakomon`）を削除した。残っているのは App Check 用の `biyoushi-kakomon-appcheck` だけ | App Check に登録しておらず、アプリからも使っていないため（#33） |
| 41 | 管理画面の範囲（§7 / §10 フェーズ5） | フェーズ5で作ったのは、利用者一覧・利用者の詳細（分野別正答率、直近14日の学習量、苦手問題の上位10問）・「この人の苦手問題で出題」。回別の成績、おすすめ復習の作成、OCR確認待ち・解説の確認待ち・報告の一覧は作っていない | §10 の完了条件の3つを先に作る。回別の成績は本番模試モード（`examBest`）がまだなく、報告は送る側の画面がまだないため |
| 42 | 最終利用日の表示（§7） | 一覧・詳細の「最終学習日」は `users/{uid}.lastActiveAt` の日付（日本時間）。1問も解いていない人は「—」。`lastActiveAt` は記録の送信のほか、表示名の変更でも更新される | 日別の記録から求めると、取り込んでいる14日より前に最後に解いた人の日付が出せない。表示名の変更はまれなので `lastActiveAt` で足りる |
| 43 | 管理画面の読み取りとキャッシュ（§7 / §9） | 管理画面を開いたとき、`users` の全件と、各利用者の直近14日の `days` をまとめて読む（利用者数 ＋ 各利用者の記録のある日数〔最低1〕件）。問題ごとの記録（`progress`、最大770件）は、その利用者の詳細を初めて開いたときに1回読む。結果はメモリに持ち、一覧と詳細を行き来しても読み直さない。読み直すのは「最新の状態に更新」を押したときと、ページを読み込み直したときだけ。端末（IndexedDB）には保存しない | 無料枠（読み込み5万回/日）の中で、利用者が数人なら1回の表示で数十件、詳細を開いても1人あたり最大770件。他人の記録を管理者の端末に残さない |
| 44 | 苦手問題の決め方（§7） | 2回以上解いて、1回でも間違えている問題。正答率の低い順、同じなら解いた回数の多い順、最近解いた順。詳細画面には上位10問を出し、出題には上位20問を使う。1回しか解いていない問題は、間違えていても含めない | §7 の「2回以上解いて正答率の低い順」に合わせた。1回だけの間違いは、たまたまの可能性がある |
| 45 | 「この人の苦手問題で出題」（§7） | 出題のモードに `study`（勉強会用）を足した。このモードでは、解答・チェック・セットの結果を、管理者の端末内の記録にも Firestore にも保存しない。出題画面と結果画面に「あなたの記録に残りません」と表示し、チェック（★）と過去の正誤は出さない。「間違えた問題を解き直す」も同じモードのまま。利用者の記録にも書き込まない | 管理者自身の成績・苦手分析が、後輩の苦手問題で汚れないようにするため |
| 46 | 管理画面のURL（§4.1） | 利用者の詳細は `/#/admin?u={uid}`。ブラウザの「戻る」で一覧に戻れる | 画面の一覧（§4.1）にない画面を増やさず、戻る操作を自然にするため |
| 47 | 苦手問題の決め方（§7。#44 を変更） | 管理画面の「苦手問題」は、**直近の解答が不正解の問題**（1回だけ解いて間違えた問題も含む）。間違えたことがあっても、直近で正解できた問題は含めない。並び順（正答率の低い順、同じなら解いた回数の多い順、最近解いた順）と件数（表示10問・出題20問）は #44 のまま | 「2回以上解いた問題」に限ると、解き始めたばかりの人では1問も出ない。直近で正解できた問題は、もう解けるようになったとみなせる |
| 48 | 解説の置き場所（§5 / §6.7） | 解説は `data-src/explanations/exam-{回}.json` に書き、`scripts/build-data.ts` が `public/data/exam-{回}.json` の `explanation` に入れる。形は `scripts/validate.ts` と `build-data` の両方で検証する（`src/lib/explanationCheck.ts`）。解説のない問題は `explanation: null` のまま | 問題データは `data-src` から生成しているので（#10）、生成物に直接書くと次の生成で消える |
| 49 | 解説のフィールドの追加（§6.7.5） | `explanation` に `perStatement`（a〜d の組合せ問題で、記述ごとの説明。記述と同じ数。ほかは null）と `caution`（法令・統計・制度の時点の注記。なければ null）を足した。§6.7 手順5の「`caution` に書く」は、問題の `caution` ではなく `explanation.caution` に書く | 組合せ問題は選択肢が「aとb」なので、選択肢ごとの説明だけでは各記述の正誤の理由が書けない。問題の `caution` は解答前に表示されるので（公式の注記用）、時点の注記を入れると答えが分かってしまう |
| 50 | `traps` の決まり（§6.7.3） | `traps` は、その問題の選択肢・記述にそのまま出てくる2文字以上の語句に限る（検証でエラーにする）。解答したあとに、選択肢・記述と解説の中で強調する。解答前は強調しない | 問題文にない語句は強調できない。1文字の語句は関係のない所まで強調される。解答前に強調すると答えが分かる |
| 51 | 解説の見せ方（§6.7.6） | 解答後、最初に出すのは `summary`・自分が選んだ誤りの選択肢の説明・`keyPoint`・`caution`・教科書の参照。選択肢（記述）ごとの説明と根拠の資料は折りたたむ。`summary` は2〜4文（160字が目安）、`perChoice` は各90字が目安 | スマホで、解答のたびに長い解説を読まなくて済むようにするため（§6.7.3 の「3〜6文」より短くした） |
| 52 | 確認待ちの一覧（§6.7 手順4） | `docs/explanation-review.md` は、解説の元データの `review`（理由と、確認してほしい点）から `build-data` が自動で作る。`review` は問題データ（公開されるJSON）には入れない。`confidence: "low"` には `review` が必須 | 解説を直したときに一覧とずれないようにするため |
| 53 | `confidence` の基準（§6.7.5） | 当初の「高＝一次情報で裏付けあり・照合一致」をやめ、§6.7.7 の基準にした（2026-11-14）：高＝一次資料で裏づけ（解説サイトとの照合の有無は問わない）／中＝一次資料はないが複数の信頼できる資料で一致／低＝資料が乏しい、または資料の間で食い違い。`sources` が0件の問題は、解説サイト何件と一致していても低。`sources` に解説サイト（`site`）は入れない（検証でエラー）。この基準で第54〜52回の全問をかけ直した（変更した問題は `docs/review-6b.md`） | 実施から間がない回は解説サイトに掲載がなく、照合の有無で確信度が決まると、一次資料で確かめた問題と区別がつかない。解説サイトは根拠にしない（§6.7.1）ので、解説サイトとの一致だけでは中にしない |
| 54 | 教科書の参照（§5） | 問題に `textbookRefs`（省略可）を足した：`{bookId, chapter, section, title, page, via: 'index'｜'toc', confidence}`。`bookId` は版と発行年を含む（`unei-2ed-2024`＝『運営管理』第2版・2024年。一覧は `src/lib/textbooks.ts`）。元データは `data-src/textbook-refs.json`。索引に語があればそのページを使い（`via: index`）、なければ目次から節を推定して `via: toc`・`confidence: low` にする。解説の中に「教科書 運営管理 第2版 第2編2章3節 p.68（第2版の場合）」のように1行で表示する。**教科書の本文と、目次・索引の全文は、データにもリポジトリにも入れない**（入れるのは問題ごとの節の見出しとページだけ）。写真は `textbook-src/`（`.gitignore`）に置く | 教科書の奥付に、私的使用以外のデジタル化を認めないとあるため。ページは版によってずれるので、版を明示する |
