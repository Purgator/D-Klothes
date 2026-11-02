#!/usr/bin/env bash
# End-to-end smoke test of the Edge Functions against a local Supabase stack.
# Prerequisites: `supabase start` and `supabase functions serve --env-file supabase/functions/.env`
# (with RETENTION_CLEANUP_SECRET set in that file). Creates throwaway users and cleans up after itself.
set -euo pipefail
cd "$(dirname "$0")/../.."

eval "$(supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
: "${API_URL:?supabase start first}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"
CLEANUP_SECRET="$(grep -E '^RETENTION_CLEANUP_SECRET=' supabase/functions/.env | cut -d= -f2- | tr -d '"')"
FN="$API_URL/functions/v1"
PASS=0; FAIL=0
RUN_ID="$(date +%s)"

ok()   { PASS=$((PASS+1)); echo "  ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL - $1"; }
check() { # check <description> <expected> <actual>
  if [[ "$2" == "$3" ]]; then ok "$1"; else fail "$1 (expected '$2', got '$3')"; fi
}
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null || true; }

admin() { curl -s -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" "$@"; }
as_user() { # as_user <token> <curl args...>
  local tok="$1"; shift
  curl -s -H "apikey: $ANON_KEY" -H "Authorization: Bearer $tok" -H "Content-Type: application/json" "$@"
}
rest() { as_user "$1" -H "Prefer: return=representation" "$API_URL/rest/v1/$2" "${@:3}"; }
rpc()  { as_user "$1" -X POST "$API_URL/rest/v1/rpc/$2" -d "$3"; }
fn()   { # fn <token> <name> <json body> -> prints "<status>\n<body>"
  local tok="$1" name="$2" body="$3"
  curl -s -o /tmp/fn_body -w '%{http_code}' -H "apikey: $ANON_KEY" -H "Authorization: Bearer $tok" \
    -H "Content-Type: application/json" -X POST "$FN/$name" -d "$body"
  echo; cat /tmp/fn_body; echo
}

create_user() { # create_user <email> -> token
  local email="$1" pw="Sm0ke-test-password!"
  admin -X POST "$API_URL/auth/v1/admin/users" -d "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true}" >/dev/null
  curl -s -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -X POST "$API_URL/auth/v1/token?grant_type=password" \
    -d "{\"email\":\"$email\",\"password\":\"$pw\"}" | json "['access_token']"
}
user_id() { python3 -c "import base64,json,sys; t=sys.argv[1].split('.')[1]; t+='='*(-len(t)%4); print(json.loads(base64.urlsafe_b64decode(t))['sub'])" "$1"; }

# Synthetic JPEGs: SOI + APP0(JFIF) + SOS + data + EOI, with or without an APP1 Exif segment.
jpeg_clean() { printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xda\x00\x02\x01\x02\x03\xff\xd9'; }
jpeg_exif()  { printf '\xff\xd8\xff\xe1\x00\x0cExif\x00\x00MM\x00\x2a\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xda\x00\x02\x01\x02\x03\xff\xd9'; }
# Storage answers HTTP 400 for denied or missing objects and puts the real status in the JSON body.
storage_status() { python3 -c "
import json,sys
raw=sys.stdin.read(); body,_,code=raw.rpartition('\n')
try: print(json.loads(body).get('statusCode', code))
except Exception: print(code)"; }
upload() { # upload <token> <path> <generator> -> status
  curl -s -w '\n%{http_code}' -H "apikey: $ANON_KEY" -H "Authorization: Bearer $1" \
    -H "Content-Type: image/jpeg" -X POST "$API_URL/storage/v1/object/photos/$2" --data-binary @<($3) | storage_status
}
object_exists() { # object_exists <path> -> 200/404
  admin -w '\n%{http_code}' "$API_URL/storage/v1/object/photos/$1" | storage_status
}

echo "== users"
OWNER_TOK="$(create_user "owner-$RUN_ID@smoke.local")";   OWNER_ID="$(user_id "$OWNER_TOK")"
MEMBER_TOK="$(create_user "member-$RUN_ID@smoke.local")"; MEMBER_ID="$(user_id "$MEMBER_TOK")"
OTHER_TOK="$(create_user "other-$RUN_ID@smoke.local")";   OTHER_ID="$(user_id "$OTHER_TOK")"
for pair in "$OWNER_TOK:Owner" "$MEMBER_TOK:Member" "$OTHER_TOK:Other"; do
  tok="${pair%%:*}"; name="${pair##*:}"
  rest "$tok" profiles -X POST -d "{\"id\":\"$(user_id "$tok")\",\"display_name\":\"$name\"}" >/dev/null
done
check "profiles readable by their owner" "Owner" "$(rest "$OWNER_TOK" 'profiles?select=display_name' | json "[0]['display_name']")"

echo "== group, invitation, membership"
GROUP_ID="$(rpc "$OWNER_TOK" create_group '{"p_name":"Smoke group"}' | json "['id']")"
check "create_group returns an id" "36" "${#GROUP_ID}"
TOKEN="$(rpc "$OWNER_TOK" create_invitation "{\"p_group_id\":\"$GROUP_ID\"}" | json "[0]['token']")"
check "invitation token is 43 chars" "43" "${#TOKEN}"
check "anon preview is valid" "True" "$(curl -s -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -X POST "$API_URL/rest/v1/rpc/invitation_preview" -d "{\"p_token\":\"$TOKEN\"}" | json "[0]['valid']")"
REQ_ID="$(rpc "$MEMBER_TOK" redeem_invitation "{\"p_token\":\"$TOKEN\",\"p_message\":\"hi\"}" | json "['id']")"
check "redeem creates a request" "36" "${#REQ_ID}"
check "second redeem fails" "P0002" "$(rpc "$OTHER_TOK" redeem_invitation "{\"p_token\":\"$TOKEN\"}" | json "['code']")"
check "pending applicant sees no group" "[]" "$(rest "$MEMBER_TOK" 'groups?select=id')"
check "approve request" "approved" "$(rpc "$OWNER_TOK" review_membership_request "{\"p_request_id\":\"$REQ_ID\",\"p_approve\":true}" | json "['status']")"
check "member now sees the group" "$GROUP_ID" "$(rest "$MEMBER_TOK" 'groups?select=id' | json "[0]['id']")"

echo "== account tiers"
check "signed-in user cannot grant premium" "42501" "$(rpc "$OWNER_TOK" set_account_tier "{\"p_email\":\"owner-$RUN_ID@smoke.local\",\"p_tier\":\"premium\"}" | json "['code']")"
check "service role grants premium" "premium" "$(admin -X POST "$API_URL/rest/v1/rpc/set_account_tier" -d "{\"p_email\":\"owner-$RUN_ID@smoke.local\",\"p_tier\":\"premium\",\"p_note\":\"smoke\"}" | json "['tier']")"
check "entitlements reflect the tier" "premium" "$(rpc "$OWNER_TOK" my_entitlements "{}" | json "[0]['tier']")"
check "member stays free" "free" "$(rpc "$MEMBER_TOK" my_entitlements "{}" | json "[0]['tier']")"

echo "== photos (storage + register-photo)"
CLEAN_PATH="$GROUP_ID/$OWNER_ID/$(cat /proc/sys/kernel/random/uuid).jpg"
EXIF_PATH="$GROUP_ID/$OWNER_ID/$(cat /proc/sys/kernel/random/uuid).jpg"
WRONG_PATH="$GROUP_ID/$MEMBER_ID/$(cat /proc/sys/kernel/random/uuid).jpg"
check "upload into own folder" "200" "$(upload "$OWNER_TOK" "$CLEAN_PATH" jpeg_clean)"
check "upload into someone else's folder is denied" "403" "$(upload "$OWNER_TOK" "$WRONG_PATH" jpeg_clean)"
check "non-member upload is denied" "403" "$(upload "$OTHER_TOK" "$GROUP_ID/$OTHER_ID/x.jpg" jpeg_clean)"
mapfile -t R < <(fn "$OWNER_TOK" register-photo "{\"group_id\":\"$GROUP_ID\",\"path\":\"$CLEAN_PATH\",\"title\":\"Jacket\"}")
check "register-photo accepts a clean JPEG" "201" "${R[0]}"
ITEM_ID="$(echo "${R[1]}" | json "['item']['id']")"
mapfile -t R < <(fn "$OWNER_TOK" register-photo "{\"group_id\":\"$GROUP_ID\",\"path\":\"$CLEAN_PATH\",\"title\":\"Jacket\"}")
check "re-registering the same object is idempotent" "200" "${R[0]}"
check "upload exif JPEG" "200" "$(upload "$OWNER_TOK" "$EXIF_PATH" jpeg_exif)"
mapfile -t R < <(fn "$OWNER_TOK" register-photo "{\"group_id\":\"$GROUP_ID\",\"path\":\"$EXIF_PATH\"}")
check "register-photo rejects EXIF" "422" "${R[0]}"
check "rejected object is removed" "404" "$(object_exists "$EXIF_PATH")"
check "member can sign a URL for the photo" "200" "$(as_user "$MEMBER_TOK" -o /dev/null -w '%{http_code}' -X POST "$API_URL/storage/v1/object/sign/photos/$CLEAN_PATH" -d '{"expiresIn":60}')"
check "outsider cannot sign a URL" "400" "$(as_user "$OTHER_TOK" -o /dev/null -w '%{http_code}' -X POST "$API_URL/storage/v1/object/sign/photos/$CLEAN_PATH" -d '{"expiresIn":60}')"

echo "== votes"
check "member votes want" "want" "$(rpc "$MEMBER_TOK" cast_vote "{\"p_item_id\":\"$ITEM_ID\",\"p_vote\":\"want\"}" | json "['vote']")"
check "member changes to keep" "keep" "$(rpc "$MEMBER_TOK" cast_vote "{\"p_item_id\":\"$ITEM_ID\",\"p_vote\":\"keep\"}" | json "['vote']")"
check "uploader cannot vote on own item" "42501" "$(rpc "$OWNER_TOK" cast_vote "{\"p_item_id\":\"$ITEM_ID\",\"p_vote\":\"keep\"}" | json "['code']")"
check "counts show one keep" "1" "$(rpc "$OWNER_TOK" group_vote_counts "{\"p_group_id\":\"$GROUP_ID\"}" | json "[0]['keep_count']")"
check "uploader cannot read keep votes" "[]" "$(rest "$OWNER_TOK" "votes?select=vote&item_id=eq.$ITEM_ID")"
check "feed version bumped" "True" "$(rest "$MEMBER_TOK" "group_feed_state?select=version&group_id=eq.$GROUP_ID" | json "[0]['version'] >= 3")"

echo "== delete-photo"
mapfile -t R < <(fn "$MEMBER_TOK" delete-photo "{\"item_id\":\"$ITEM_ID\"}")
check "member cannot delete someone else's photo" "403" "${R[0]}"
mapfile -t R < <(fn "$OTHER_TOK" delete-photo "{\"item_id\":\"$ITEM_ID\"}")
check "outsider gets 404" "404" "${R[0]}"
mapfile -t R < <(fn "$OWNER_TOK" delete-photo "{\"item_id\":\"$ITEM_ID\"}")
check "uploader deletes the photo" "200" "${R[0]}"
check "object removed" "404" "$(object_exists "$CLEAN_PATH")"
check "row removed" "[]" "$(rest "$OWNER_TOK" "clothing_items?select=id&id=eq.$ITEM_ID")"

echo "== retention-cleanup"
OLD_PATH="$GROUP_ID/$MEMBER_ID/$(cat /proc/sys/kernel/random/uuid).jpg"
check "member uploads" "200" "$(upload "$MEMBER_TOK" "$OLD_PATH" jpeg_clean)"
admin -X POST "$API_URL/rest/v1/clothing_items" -d "{\"group_id\":\"$GROUP_ID\",\"uploader_id\":\"$MEMBER_ID\",\"storage_path\":\"$OLD_PATH\",\"created_at\":\"2020-01-01T00:00:00Z\",\"retention_deadline\":\"2022-01-01T00:00:00Z\"}" >/dev/null
check "cleanup without secret is refused" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FN/retention-cleanup")"
check "cleanup deletes the expired item" "True" "$(curl -s -H "x-cleanup-secret: $CLEANUP_SECRET" -X POST "$FN/retention-cleanup" | json "['deleted'] >= 1")"
check "expired object removed" "404" "$(object_exists "$OLD_PATH")"

echo "== export-account"
KEEP_PATH="$GROUP_ID/$MEMBER_ID/$(cat /proc/sys/kernel/random/uuid).jpg"
upload "$MEMBER_TOK" "$KEEP_PATH" jpeg_clean >/dev/null
fn "$MEMBER_TOK" register-photo "{\"group_id\":\"$GROUP_ID\",\"path\":\"$KEEP_PATH\",\"title\":\"Scarf\"}" >/dev/null
STATUS="$(curl -s -o /tmp/export.zip -w '%{http_code}' -H "apikey: $ANON_KEY" -H "Authorization: Bearer $MEMBER_TOK" -X POST "$FN/export-account")"
check "export returns 200" "200" "$STATUS"
check "export is a zip with account.json and a photo" "2" "$(python3 -c "import zipfile; z=zipfile.ZipFile('/tmp/export.zip'); n=z.namelist(); print(sum(1 for x in n if x=='account.json' or x.endswith('.jpg')))")"

echo "== delete-account / delete-group"
mapfile -t R < <(fn "$OWNER_TOK" delete-account '{"confirm":"DELETE"}')
check "owner cannot delete account while owning a group" "409" "${R[0]}"
mapfile -t R < <(fn "$MEMBER_TOK" delete-account '{"confirm":"nope"}')
check "delete-account requires confirmation" "400" "${R[0]}"
mapfile -t R < <(fn "$MEMBER_TOK" delete-account '{"confirm":"DELETE"}')
check "member deletes their account" "200" "${R[0]}"
check "member photo removed" "404" "$(object_exists "$KEEP_PATH")"
check "member auth user removed" "" "$(admin "$API_URL/auth/v1/admin/users/$MEMBER_ID" | json "['id']")"
mapfile -t R < <(fn "$MEMBER_TOK" delete-group "{\"group_id\":\"$GROUP_ID\",\"confirm_name\":\"Smoke group\"}")
check "deleted user token is rejected" "401" "${R[0]}"
mapfile -t R < <(fn "$OWNER_TOK" delete-group "{\"group_id\":\"$GROUP_ID\",\"confirm_name\":\"wrong\"}")
check "delete-group needs the exact name" "400" "${R[0]}"
mapfile -t R < <(fn "$OWNER_TOK" delete-group "{\"group_id\":\"$GROUP_ID\",\"confirm_name\":\"Smoke group\"}")
check "owner deletes the group" "200" "${R[0]}"
mapfile -t R < <(fn "$OWNER_TOK" delete-account '{"confirm":"DELETE"}')
check "owner deletes account afterwards" "200" "${R[0]}"

echo "== cleanup"
admin -X DELETE "$API_URL/auth/v1/admin/users/$OTHER_ID" >/dev/null || true

echo
echo "passed: $PASS, failed: $FAIL"
[[ $FAIL -eq 0 ]]
