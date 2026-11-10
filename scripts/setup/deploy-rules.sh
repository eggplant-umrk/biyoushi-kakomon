#!/usr/bin/env bash
# セキュリティルールを本番にデプロイする（SPEC §11-5 / §8.1）。
#   1. ルールのテストを実行（通らなければデプロイしない）
#   2. firestore.rules.template の __ADMIN_EMAIL__ を .env.local の ADMIN_EMAIL で置き換えて firestore.rules を作る
#   3. firebase deploy --only firestore:rules
# 前提: firebase login 済み。Java（Firestore Emulator 用）が PATH にある。
# 使い方: bash scripts/setup/deploy-rules.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PROJECT="${FIREBASE_PROJECT:-biyoushi-kakomon}"

echo "== ルールのテスト"
npm run test:rules

echo "== firestore.rules を作る"
node scripts/setup/build-rules.ts
# テンプレートの置き換え漏れがないこと
if grep -q '__ADMIN_EMAIL__' firestore.rules; then
  echo "firestore.rules に __ADMIN_EMAIL__ が残っています" >&2
  exit 1
fi

echo "== デプロイ（$PROJECT）"
firebase deploy --only firestore:rules --project "$PROJECT"
echo "== done"
