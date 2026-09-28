#!/usr/bin/env bash
# End-to-end smoke test for the SnapChef API.
B=${1:-http://localhost:5000}
E="e2e_$RANDOM@snapchef.test"
P="secret123"
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1 -> $2"; fail=$((fail+1)); }

echo "▶ Testing $B"

echo "[health]"
H=$(curl -s $B/api/health)
[[ $H == *'"ok":true'* ]] && ok "health ok" || no "health" "$H"
[[ $H == *'"supabase":true'* ]] && ok "supabase configured" || no "supabase" "$H"

echo "[auth]"
S=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\",\"full_name\":\"E2E Chef\"}")
TOK=$(echo "$S" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
[[ -n $TOK ]] && ok "signup returns JWT" || no "signup" "$S"
[[ $S != *password_hash* ]] && ok "password hash never leaves server" || no "hash leak" "$S"

D=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
[[ $D == *already* ]] && ok "duplicate email rejected" || no "dup email" "$D"

W=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"wrongpass\"}")
[[ $W == *Invalid* ]] && ok "wrong password rejected (bcrypt)" || no "wrong pw" "$W"

L=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"$P\"}")
TOK=$(echo "$L" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
[[ -n $TOK ]] && ok "login works" || no "login" "$L"

ME=$(curl -s $B/api/auth/me -H "Authorization: Bearer $TOK")
[[ $ME == *"$E"* ]] && ok "session restores (cross-device /me)" || no "me" "$ME"

U=$(curl -s $B/api/items)
[[ $U == *'Not authenticated'* ]] && ok "unauthenticated CRUD blocked" || no "auth guard" "$U"

echo "[crud]"
C=$(curl -s -X POST $B/api/items -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"Spinach","description":"200g, expires Friday"}')
ID=$(echo "$C" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
[[ -n $ID ]] && ok "create item" || no "create" "$C"

G=$(curl -s $B/api/items -H "Authorization: Bearer $TOK")
[[ $G == *Spinach* ]] && ok "read persists in Supabase" || no "read" "$G"

E2=$(curl -s -X PUT $B/api/items/$ID -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"Baby Spinach","description":"250g"}')
[[ $E2 == *"Baby Spinach"* ]] && ok "update item" || no "update" "$E2"

BAD=$(curl -s -X POST $B/api/items -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"  "}')
[[ $BAD == *required* ]] && ok "empty title validated" || no "validation" "$BAD"

# ownership isolation
E3="e2e2_$RANDOM@snapchef.test"
T2=$(curl -s -X POST $B/api/auth/signup -H 'Content-Type: application/json' -d "{\"email\":\"$E3\",\"password\":\"$P\"}" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
X=$(curl -s -X DELETE $B/api/items/$ID -H "Authorization: Bearer $T2")
[[ $X == *'not found'* ]] && ok "other user cannot touch my data" || no "isolation" "$X"
Y=$(curl -s $B/api/items -H "Authorization: Bearer $T2")
[[ $Y != *Spinach* ]] && ok "other user sees only own items" || no "leak" "$Y"

echo "[ai]"
A=$(curl -s -X POST $B/api/ai/generate -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"mode":"recipe"}')
[[ $A == *'"result"'* ]] && ok "AI recipe generated" || no "AI" "$(echo $A | head -c 180)"
A2=$(curl -s -X POST $B/api/ai/generate -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"mode\":\"summary\",\"itemId\":\"$ID\"}")
[[ $A2 == *'"result"'* ]] && ok "AI item tip generated" || no "AI summary" "$(echo $A2 | head -c 180)"
[[ $(curl -s $B/api/items -H "Authorization: Bearer $TOK") == *ai_summary\":\"* ]] && ok "AI tip saved to DB" || echo "  ⚠️  ai_summary not persisted"

echo "[camera]"
BULK=$(curl -s -X POST $B/api/items/bulk -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"items":[{"title":"Lettuce","description":"1 head"},{"title":"Milk","description":"1L"},{"title":"   "}]}')
[[ $BULK == *Lettuce* && $BULK == *Milk* ]] && ok "bulk add from photo scan" || no "bulk" "$BULK"
EMPTY=$(curl -s -X POST $B/api/items/bulk -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"items":[]}')
[[ $EMPTY == *"No ingredients"* ]] && ok "empty bulk rejected" || no "empty bulk" "$EMPTY"
BADIMG=$(curl -s -X POST $B/api/ai/scan -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"image":"not-an-image"}')
[[ $BADIMG == *"valid JPEG"* ]] && ok "invalid photo rejected" || no "bad image" "$BADIMG"
NOAUTH=$(curl -s -X POST $B/api/ai/scan -H 'Content-Type: application/json' -d '{"image":"x"}')
[[ $NOAUTH == *"Not authenticated"* ]] && ok "photo scan requires login" || no "scan auth" "$NOAUTH"
# clean up the bulk rows so the final assertion is meaningful
for bid in $(echo "$BULK" | grep -o '"id":"[^"]*' | cut -d'"' -f4); do
  curl -s -X DELETE $B/api/items/$bid -H "Authorization: Bearer $TOK" >/dev/null; done

echo "[voice]"
LANGS=$(curl -s $B/api/ai/languages)
[[ $LANGS == *Telugu* && $LANGS == *Hindi* ]] && ok "language list served" || no "languages" "$LANGS"
SP=$(curl -s -X POST $B/api/ai/speak -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"text":"DISH: Toast\nSTEPS:\n1. Toast the bread.","lang":"en"}')
[[ $SP == *'"audio"'* ]] && ok "English narration generated" || no "tts en" "$(echo $SP | head -c 150)"
# valid RIFF/WAV header once decoded?
echo "$SP" | python3 -c "
import sys,json,base64
d=json.load(sys.stdin)
a=base64.b64decode(d.get('audio',''))
sys.exit(0 if a[:4]==b'RIFF' and a[8:12]==b'WAVE' and len(a)>10000 else 1)" \
  && ok "audio is a valid playable WAV" || no "wav header" ""
BADL=$(curl -s -X POST $B/api/ai/speak -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"text":"hello","lang":"xx"}')
[[ $BADL == *"not supported"* ]] && ok "unknown language rejected" || no "bad lang" "$BADL"
NOTXT=$(curl -s -X POST $B/api/ai/speak -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"text":"  ","lang":"en"}')
[[ $NOTXT == *"Nothing to read"* ]] && ok "empty text rejected" || no "empty tts" "$NOTXT"
NOAU=$(curl -s -X POST $B/api/ai/speak -H 'Content-Type: application/json' -d '{"text":"hi","lang":"en"}')
[[ $NOAU == *"Not authenticated"* ]] && ok "narration requires login" || no "tts auth" "$NOAU"

echo "[savings]"
SV=$(curl -s -X POST $B/api/items -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"title":"Paneer","description":"200g"}')
SVID=$(echo "$SV" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "$SV" | grep -q '"value_inr":[0-9]' && ok "rupee value auto-estimated" || no "value" "$SV"
echo "$SV" | grep -q '"status":"in_kitchen"' && ok "new item starts in kitchen" || no "status default" "$SV"
US=$(curl -s -X PATCH $B/api/items/$SVID/status -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"status":"used"}')
[[ $US == *'"status":"used"'* ]] && ok "mark as cooked" || no "mark used" "$US"
SUM=$(curl -s $B/api/items/summary -H "Authorization: Bearer $TOK")
echo "$SUM" | python3 -c "
import sys,json; d=json.load(sys.stdin); sys.exit(0 if d['saved']>0 and d['counts']['used']>=1 else 1)" \
  && ok "savings summary counts rupees" || no "summary" "$SUM"
LIST=$(curl -s $B/api/items -H "Authorization: Bearer $TOK")
[[ $LIST != *"$SVID"* ]] && ok "cooked item leaves the kitchen list" || no "list filter" ""
ALL=$(curl -s "$B/api/items?status=all" -H "Authorization: Bearer $TOK")
[[ $ALL == *"$SVID"* ]] && ok "history still retrievable via ?status=all" || no "status=all" ""
BADS=$(curl -s -X PATCH $B/api/items/$SVID/status -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"status":"eaten"}')
[[ $BADS == *"Invalid status"* ]] && ok "invalid status rejected" || no "bad status" "$BADS"
OTHER=$(curl -s -X PATCH $B/api/items/$SVID/status -H "Authorization: Bearer $T2" -H 'Content-Type: application/json' -d '{"status":"used"}')
[[ $OTHER == *"not found"* ]] && ok "cannot change another user's item" || no "status isolation" "$OTHER"
ST=$(curl -s $B/api/stats)
echo "$ST" | python3 -c "
import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'rupeesSaved' in d and 'cooks' in d else 1)" \
  && ok "public stats endpoint (no auth)" || no "stats" "$ST"
[[ $ST != *email* && $ST != *password* ]] && ok "public stats leak no personal data" || no "stats leak" "$ST"

echo "[cleanup]"
DL=$(curl -s -X DELETE $B/api/items/$ID -H "Authorization: Bearer $TOK")
[[ $DL == *'"ok":true'* ]] && ok "delete item" || no "delete" "$DL"
[[ $(curl -s $B/api/items -H "Authorization: Bearer $TOK") == *'"items":[]'* ]] && ok "list empty after delete" || no "post-delete" ""

echo ""
echo "════ $pass passed, $fail failed ════"
exit $fail
