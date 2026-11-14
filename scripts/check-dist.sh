#!/usr/bin/env bash
# ビルド結果（dist/）に、入ってはいけないものが入っていないかを調べる（SPEC §6.5 / §8.4）。
# 検査の本体は scripts/check-dist.ts（Node）。grep を使うと、Windows の Git Bash では既定のロケールで
# `grep -i -F` が異常終了し、「入っていない」と見分けがつかなかったため（SPEC §14）。
# 使い方: ADMIN_EMAIL=... bash scripts/check-dist.sh [dist]
#   REQUIRE_ADMIN_EMAIL=1 のときは、ADMIN_EMAIL が空なら失敗にする（デプロイ前の検査用）
#   bash scripts/check-dist.sh --self-test [dist]   検査が効いていることの確認
set -euo pipefail
exec node "$(dirname "$0")/check-dist.ts" "$@"
