#!/usr/bin/env bash
# GitHub リポジトリの設定（SPEC §8.5 / §11-6）。何度実行しても同じ状態になる。
# 前提: gh auth login 済み。main ブランチが push 済み。
# 使い方: bash scripts/setup/github.sh
set -euo pipefail

REPO="${REPO:-eggplant-umrk/biyoushi-kakomon}"
echo "== $REPO"

# リポジトリが無ければ作成（公開）
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public \
    --description "美容師国家試験（筆記）過去問トレーナー（非公式・個人作成）"
fi

# マージ方法：squash のみ。マージ後にブランチを削除。Wiki/Projects は使わない
gh api -X PATCH "repos/$REPO" --silent \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true -F has_wiki=false -F has_projects=false

# Secret scanning と push protection（公開リポジトリは無料）
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

# Dependabot（脆弱性アラートとセキュリティアップデート。バージョン更新は .github/dependabot.yml）
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent

# Actions の GITHUB_TOKEN は既定で読み取りのみ。Actions に PR の承認をさせない
gh api -X PUT "repos/$REPO/actions/permissions/workflow" --silent \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

# GitHub Pages（GitHub Actions でデプロイ）
if gh api "repos/$REPO/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$REPO/pages" --silent -f build_type=workflow
else
  gh api -X POST "repos/$REPO/pages" --silent -f build_type=workflow
fi

# main ブランチの保護：CI（test ジョブ）成功を必須、force push・削除を禁止、管理者にも適用
gh api -X PUT "repos/$REPO/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

echo "== done"
gh api "repos/$REPO" --jq '{visibility, security_and_analysis}'
gh api "repos/$REPO/pages" --jq '{html_url, build_type}'
