#!/usr/bin/env bash
# 二重チェックの結果を data-src/check-{回}.txt に書く。
# 使い方: bash scripts/data/write-check.sh 52 "第52回美容師筆記試験問題 令和7年9月7日" "3 3 1 4 ..." [図の中に〇印がある問題番号...]
# 3番目の引数は問1〜55の正答（空白区切り）。選択肢の数はすべて4として書く（4でない問題は手で直す）。
set -euo pipefail
exam=$1; cover=$2; answers=($3); shift 3
fig=" $* "
out="data-src/check-$exam.txt"
{
  echo "# 第${exam}回 二重チェック（raw/check/${exam}-*.png：各ページ左端の問題番号・選択肢番号・〇印だけを読み直したもの）"
  echo "# 書式: 問題番号 正答 選択肢の数 [メモ]"
  echo "@cover $cover"
  i=1
  for a in "${answers[@]}"; do
    if [[ "$fig" == *" $i "* ]]; then echo "$i $a 4 〇印は図の中（左端の列には出ない）。図の中の〇印で確認"; else echo "$i $a 4"; fi
    i=$((i+1))
  done
} > "$out"
n=${#answers[@]}
[ "$n" -eq 55 ] || { echo "正答が55個ではありません: $n" >&2; exit 1; }
echo "wrote $out"
