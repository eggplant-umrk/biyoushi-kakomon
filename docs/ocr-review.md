# OCR確認待ちの一覧

`scripts/build-data.ts` が自動で作るファイルです（手で編集しないでください）。

`ocrChecked: false` の問題の一覧です。原本（公式PDF）と見比べて、問題がなければ `data-src/exam-{回}.txt` の該当問題から
`!ocr` の行を消し、`node scripts/build-data.ts` を実行してください。ページ画像は `python scripts/pdf-to-png.py` で作れます（`raw/` はコミットしません）。

件数: 1問

| 回 | 問題 | 理由 | ページ画像 |
|---|---|---|---|
| 第54回 | 問50 | 図の中の選択肢(4)に正答の〇印が描かれていたため、画像処理で消した。消し跡が不自然でないか目視確認が必要 | raw/pages/54-024.png |
