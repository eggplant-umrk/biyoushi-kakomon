#!/usr/bin/env bash
# ビルド結果（dist/）に、入ってはいけないものが入っていないかを調べる（SPEC §6.5 / §8.4）。
#   - 管理者のメールアドレス（環境変数 ADMIN_EMAIL。値は表示しない）
#   - E2E テスト用のコード（Firebase Emulator への接続）
# 使い方: ADMIN_EMAIL=... bash scripts/check-dist.sh [dist]
#   REQUIRE_ADMIN_EMAIL=1 のときは、ADMIN_EMAIL が空なら失敗にする（デプロイ前の検査用）
set -euo pipefail
DIST="${1:-dist}"
[ -d "$DIST" ] || { echo "::error::$DIST がありません（先にビルドしてください）"; exit 1; }
fail=0

if [ -n "${ADMIN_EMAIL:-}" ]; then
  # -F: 文字列そのまま / -i: 大文字小文字を区別しない / -l: ファイル名だけ表示（メールアドレスは表示しない）
  if hits="$(grep -rIilF -- "$ADMIN_EMAIL" "$DIST")"; then
    echo "::error::ビルド結果に管理者のメールアドレスが含まれています:"
    echo "$hits"
    fail=1
  else
    echo "OK: 管理者のメールアドレスは含まれていません"
  fi
elif [ "${REQUIRE_ADMIN_EMAIL:-}" = "1" ]; then
  echo "::error::ADMIN_EMAIL が設定されていないので検査できません"
  fail=1
else
  echo "::notice::ADMIN_EMAIL がないので、管理者メールの検査を飛ばしました（Secrets を使えないPRなど）"
fi

for marker in 'localhost:9099' 'e2e-user' '__ADMIN_EMAIL__'; do
  if hits="$(grep -rIlF -- "$marker" "$DIST")"; then
    echo "::error::ビルド結果にテスト用・テンプレート用の文字列（$marker）が含まれています:"
    echo "$hits"
    fail=1
  fi
done
[ "$fail" = 0 ] && echo "OK: テスト用のコードは含まれていません"
exit "$fail"
