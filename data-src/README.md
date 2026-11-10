# 問題データの元ファイル（data-src/）

公式PDF（スキャン画像）を読み取った結果を、手で直しやすいテキスト形式で置いています。
アプリが読む `public/data/exam-{回}.json` は、ここから `node scripts/build-data.ts` で作ります（JSON を直接編集しないでください）。

## exam-{回}.txt（1回目の読み取り）

```
@exam 54 令和8年度 9          ← 回・年度・月

== 3 p3 ans=3                  ← 問題番号・ページ（raw/pages/54-003.png）・正答（〇印の番号）
                                 公式に複数正解とされた問題は ans=2,4（先頭が answer、残りが altAnswers）
                                 公式に正解なし（採点対象外）の問題は ans=0 と !excluded
!img 54/54-47.webp             ← 図（public/images/ からのパス）。複数可
!ocr 理由                      ← 読み取りに自信がない（ocrChecked: false になり docs/ocr-review.md に載る）
!polarity other                ← polarity を自動判定から変えるとき
!caution 注記                  ← 注意フラグ（公式の注意事項の転記など）
!excluded                      ← 採点対象外（公式に正解なし）
美容所の開設に関する次の記述のうち、[[u:誤っているもの]]はどれか。   ← 問題文（複数行可）
a 記述                          ← 組合せ問題の a〜d（statements）
(1) 選択肢
(2) 選択肢
(3) 選択肢
(4) 選択肢
```

表記のルール:

- 下線は `[[u:…]]`。傍点（文字の上の点）も `[[u:…]]` で表す。
- ただし、交ぜ書き（漢字の一部をひらがなにした語。例: り患）を示す傍点は強調ではないので付けない。
- 空欄（□）は `［A］`、文中の「□内」は `［　］`。空欄補充の選択肢は `A：規制　B：振興指針　C：振興計画` のように書く。
- ふりがな（ルビ）は、ルビの付いた語の直後に全角かっこで書く（例：`膿痂疹（のうかしん）`）。同じ語に2回目以降ルビがあっても、選択肢では毎回書く。
- 「a と b」は `aとb`、半角英数字・記号は半角（`80%`、`pH7.5〜9.0`、`O/W型`）。範囲の「～」は `〜`。
- 選択肢の「―――」（線）は ` ― `。

polarity（SPEC §5）は自動で決まる：組合せ問題・空欄補充・図の問題・「組合せ」を含む問題は `other`、
「誤っているもの」「該当しないもの」など（下線の否定語）は `incorrect`、「正しいもの」は `correct`、それ以外は `other`。

## check-{回}.txt（二重チェック）

1回目とは別に、`raw/check/{回}-*.png`（各ページ左端の問題番号・選択肢番号・〇印の列だけを切り出した画像）を読み、
`問題番号 正答 選択肢の数 [メモ]` を書く。1回目と食い違えば `ocrChecked: false` になる。〇印が読めないときは正答を `?` にする。

## 作業の手順（1回分）

```sh
node scripts/fetch-pdfs.ts                     # raw/pdf/ に PDF（取得済みはスキップ）
python scripts/pdf-to-png.py raw/pdf/54.pdf    # raw/pages/（200dpi）
python scripts/data/crop-pages.py 54           # raw/crops/（読み取り用。余白を除く）
python scripts/data/check-strips.py 54         # raw/check/（二重チェック用）
python scripts/data/crop-figure.py 54 22 440 590 800 925 --name 54-47   # 図を WebP で切り出す
node scripts/build-data.ts && node scripts/validate.ts
```
