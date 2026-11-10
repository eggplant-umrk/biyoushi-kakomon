#!/usr/bin/env bash
# Firebase の構築（SPEC §11-1〜4 / §8.2）。何度実行しても同じ状態になる。
# 前提: firebase login / gcloud auth login / gh auth login 済み（同じ Google アカウント）。
# 使い方: bash scripts/setup/firebase.sh
#   課金（Blaze プラン）を有効にする操作は一切しない。Spark プランのまま使う。
set -euo pipefail
cd "$(dirname "$0")/../.."

PROJECT="${FIREBASE_PROJECT:-biyoushi-kakomon}"
REPO="${REPO:-eggplant-umrk/biyoushi-kakomon}"
PAGES_HOST="${PAGES_HOST:-eggplant-umrk.github.io}"
REGION="asia-northeast1"
ENV_FILE=".env.local"

echo "== project: $PROJECT"

# --- 1. プロジェクトと Web アプリ -------------------------------------------
if ! firebase projects:list --json | grep -q "\"projectId\": \"$PROJECT\""; then
  firebase projects:create "$PROJECT" --display-name "$PROJECT"
fi

APP_ID="$(firebase apps:list WEB --project "$PROJECT" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).result||[];console.log(a[0]?.appId||"")})')"
if [ -z "$APP_ID" ]; then
  firebase apps:create WEB "$PROJECT" --project "$PROJECT"
  APP_ID="$(firebase apps:list WEB --project "$PROJECT" --json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result[0].appId)})')"
fi
echo "== web app: $APP_ID"

# --- 2. 使う API を有効にする（どれも無料枠で使える） --------------------------
gcloud services enable --project "$PROJECT" \
  firestore.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com \
  firebaseappcheck.googleapis.com apikeys.googleapis.com firebaserules.googleapis.com

# --- 3. Firestore（東京リージョン） -----------------------------------------
if ! gcloud firestore databases describe --project "$PROJECT" --database='(default)' >/dev/null 2>&1; then
  gcloud firestore databases create --project "$PROJECT" --database='(default)' \
    --location "$REGION" --type firestore-native
fi

# --- 4. Authentication：承認済みドメイン・メール列挙保護 -----------------------
TOKEN="$(gcloud auth print-access-token)"
api() { # api METHOD URL [JSON]
  curl -sS --fail-with-body -X "$1" "$2" \
    -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
}
IDP="https://identitytoolkit.googleapis.com"
# Authentication の初期化は無料プランでは API からできない（BILLING_NOT_ENABLED になる）。
# コンソールで「Authentication → Google を有効にする」（SPEC §12-2）を済ませてから、もう一度実行する
if ! api GET "$IDP/admin/v2/projects/$PROJECT/config" >/dev/null 2>&1; then
  echo "!! Authentication がまだ初期化されていません。コンソールで Google ログインを有効にしてから、もう一度実行してください。"
  echo "   （承認済みドメイン・メール列挙保護の設定を飛ばして続けます）"
else
# 承認済みドメインは GitHub Pages と localhost だけ（既定の firebaseapp.com / web.app は外す）。
# メール列挙保護を有効にし、メール／パスワード・匿名ログインは無効のままにする
api PATCH "$IDP/admin/v2/projects/$PROJECT/config?updateMask=authorizedDomains,emailPrivacyConfig.enableImprovedEmailPrivacy,signIn.email.enabled,signIn.anonymous.enabled" \
  "{\"authorizedDomains\":[\"$PAGES_HOST\",\"localhost\"],\"emailPrivacyConfig\":{\"enableImprovedEmailPrivacy\":true},\"signIn\":{\"email\":{\"enabled\":false},\"anonymous\":{\"enabled\":false}}}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);console.log("== auth:",JSON.stringify({authorizedDomains:c.authorizedDomains,emailPrivacy:c.emailPrivacyConfig,signIn:c.signIn}))})'
fi

# --- 5. ブラウザ用 API キーの制限 --------------------------------------------
# リファラー：本番・localhost と、Google ログインのポップアップ（{project}.firebaseapp.com の
# 認証ハンドラーがこのキーで Identity Toolkit を呼ぶ）だけ。API：使う4つだけ
SDK="$(firebase apps:sdkconfig WEB "$APP_ID" --project "$PROJECT" --json)"
cfg() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result;console.log((r.sdkConfig||r)[process.argv[1]]||"")})' "$1" <<<"$SDK"; }
API_KEY="$(cfg apiKey)"
KEY_NAME="$(gcloud services api-keys list --project "$PROJECT" --format=json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",async()=>{for(const k of JSON.parse(s)){console.log(k.name)}})' \
  | while read -r name; do
      if [ "$(gcloud services api-keys get-key-string "$name" --format='value(keyString)')" = "$API_KEY" ]; then echo "$name"; fi
    done)"
gcloud services api-keys update "$KEY_NAME" \
  --allowed-referrers="https://$PAGES_HOST/*,http://localhost:*,https://$PROJECT.firebaseapp.com/*" \
  --api-target=service=identitytoolkit.googleapis.com \
  --api-target=service=securetoken.googleapis.com \
  --api-target=service=firestore.googleapis.com \
  --api-target=service=firebaseappcheck.googleapis.com >/dev/null
echo "== api key restricted: $KEY_NAME"

# --- 6. 設定値を .env.local と GitHub Secrets へ ------------------------------
# VITE_ で始まる値はビルド後の JS に入る（公開されても問題ない値）。
# ADMIN_EMAIL は VITE_ を付けない＝JS には入らない。ルールのデプロイと CI の検査だけで使う
ADMIN_EMAIL="$(firebase login:list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).result[0].user.email)})')"
touch "$ENV_FILE"
setenv() { # setenv KEY VALUE：.env.local の KEY を置き換える（なければ追加）
  grep -v "^$1=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  echo "$1=$2" >> "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}
setenv VITE_FIREBASE_API_KEY "$API_KEY"
setenv VITE_FIREBASE_AUTH_DOMAIN "$(cfg authDomain)"
setenv VITE_FIREBASE_PROJECT_ID "$(cfg projectId)"
setenv VITE_FIREBASE_APP_ID "$(cfg appId)"
setenv ADMIN_EMAIL "$ADMIN_EMAIL"

for key in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID ADMIN_EMAIL VITE_RECAPTCHA_SITE_KEY; do
  value="$(grep "^$key=" "$ENV_FILE" | head -1 | cut -d= -f2- || true)"
  if [ -n "$value" ]; then
    gh secret set "$key" --repo "$REPO" --body "$value"
  else
    echo "   （$key は .env.local にまだ無いので GitHub Secrets には入れていません）"
  fi
done

echo "== done（.env.local と GitHub Secrets を更新しました）"
