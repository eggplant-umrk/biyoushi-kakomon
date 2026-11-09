# フェーズ2（過去問データ作成）の進捗

SPEC §5・§6.1。第54回 → 第41回の順に1回ずつ処理し、1回分ごとにコミットする。
途中で止まった場合は、この表の「状態」が「済」でない最初の回から再開する（手順は [data-src/README.md](../data-src/README.md)）。

ブランチ: `feat/phase2-data`

| 回 | 状態 | 問題数 | ocrChecked: false | 図の問題 | メモ |
|---|---|---|---|---|---|
| 54 | 済 | 55 | 1 | 3 | 問50 は図の中の〇印を画像処理で消した |
| 53 | 済 | 55 | 0 | 1 | |
| 52 | 未 | | | | |
| 51 | 未 | | | | |
| 50 | 未 | | | | |
| 49 | 未 | | | | |
| 48 | 未 | | | | |
| 47 | 未 | | | | |
| 46 | 未 | | | | |
| 45 | 未 | | | | |
| 44 | 未 | | | | |
| 43 | 未 | | | | 新試験の PDF（43bhikkin）のみ |
| 42 | 未 | | | | 新試験の PDF（42bhikkin）のみ |
| 41 | 未 | | | | 新試験の PDF（41bhikkin）のみ |

## 1回分の手順（概要）

1. `node scripts/fetch-pdfs.ts`（全回分。取得済みはスキップ）
2. `python scripts/pdf-to-png.py raw/pdf/{回}.pdf` → `raw/pages/`
3. `python scripts/data/crop-pages.py {回}` → 読み取り用画像 `raw/crops/` を読み、`data-src/exam-{回}.txt` を書く
4. 図は `python scripts/data/crop-figure.py` で `public/images/{回}/` に WebP で切り出す（正答の〇印は自動で消す）
5. `python scripts/data/check-strips.py {回}` → `raw/check/` を読み、`data-src/check-{回}.txt`（問題番号・正答・選択肢数）を書く
6. `node scripts/build-data.ts && node scripts/validate.ts`
7. この表を更新してコミット
