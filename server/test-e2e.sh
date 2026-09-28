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

echo "[cleanup]"
DL=$(curl -s -X DELETE $B/api/items/$ID -H "Authorization: Bearer $TOK")
[[ $DL == *'"ok":true'* ]] && ok "delete item" || no "delete" "$DL"
[[ $(curl -s $B/api/items -H "Authorization: Bearer $TOK") == *'"items":[]'* ]] && ok "list empty after delete" || no "post-delete" ""

echo ""
echo "════ $pass passed, $fail failed ════"
exit $fail
