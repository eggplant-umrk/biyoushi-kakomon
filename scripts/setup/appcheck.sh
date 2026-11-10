#!/usr/bin/env bash
# App Check の強制（SPEC §8.2）。
# 前提: コンソールで Web アプリを App Check（reCAPTCHA v3）に登録済み。gcloud auth login 済み。
# 使い方:
#   bash scripts/setup/appcheck.sh status            … いまの状態を表示
#   bash scripts/setup/appcheck.sh enforce firestore … Firestore で強制（トークンのない通信を拒否）
#   bash scripts/setup/appcheck.sh enforce auth      … Authentication で強制（使えるプランのときだけ成功する）
#   bash scripts/setup/appcheck.sh unenforce firestore|auth … 強制をやめる（ログインできなくなったときの戻し方）
# 注意: 強制する前に、本番のアプリが App Check のトークンを送れていること（ログインして記録が保存できること）を確かめる。
set -euo pipefail
PROJECT="${FIREBASE_PROJECT:-biyoushi-kakomon}"
API="https://firebaseappcheck.googleapis.com/v1/projects/$PROJECT"
TOKEN="$(gcloud auth print-access-token)"

call() { # call METHOD URL [JSON]
  curl -sS --fail-with-body -X "$1" "$2" \
    -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT" \
    -H 'Content-Type: application/json' ${3:+-d "$3"}
}
service_of() {
  case "$1" in
    firestore) echo "firestore.googleapis.com" ;;
    auth) echo "identitytoolkit.googleapis.com" ;;
    *) echo "firestore か auth を指定してください" >&2; exit 1 ;;
  esac
}

case "${1:-status}" in
  status)
    for s in firestore auth; do
      echo "== $s"
      call GET "$API/services/$(service_of "$s")" || true
      echo
    done
    ;;
  enforce | unenforce)
    svc="$(service_of "${2:-}")"
    mode="ENFORCED"
    [ "$1" = "unenforce" ] && mode="UNENFORCED"
    call PATCH "$API/services/$svc?updateMask=enforcementMode" "{\"enforcementMode\":\"$mode\"}"
    echo
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
