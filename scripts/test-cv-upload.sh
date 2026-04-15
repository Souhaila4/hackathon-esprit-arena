#!/usr/bin/env bash
# Test CV upload: sign in (or sign up), then POST the Front-End Dev .docx to /auth/profile/cv.
# Usage: ./scripts/test-cv-upload.sh [base_url]
# Default base_url: http://localhost:3000

set -e
BASE_URL="${1:-http://localhost:3000}"
CV_FILE="CV - template - Front-End Dev .docx"

if [[ ! -f "$CV_FILE" ]]; then
  echo "CV file not found: $CV_FILE (run from arenabackend root)"
  exit 1
fi

echo "1. Signing up test user..."
SIGNUP=$(curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"cvtest@example.com","password":"password123","firstName":"CV","lastName":"Tester"}')

# If already exists, sign in instead
if echo "$SIGNUP" | grep -q '"statusCode":409'; then
  echo "   User exists, signing in..."
  AUTH=$(curl -s -X POST "$BASE_URL/auth/signin" \
    -H "Content-Type: application/json" \
    -d '{"email":"cvtest@example.com","password":"password123"}')
else
  AUTH="$SIGNUP"
fi

TOKEN=$(echo "$AUTH" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { console.log(JSON.parse(d).tokens.accessToken); } catch(e) { console.error(d); process.exit(1); } });")
if [[ -z "$TOKEN" ]]; then
  echo "   Failed to get token. Response: $AUTH"
  exit 1
fi
echo "   Token obtained."

echo "2. Uploading CV ($CV_FILE)..."
RESULT=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/auth/profile/cv" \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume=@$CV_FILE")

HTTP_CODE=$(echo "$RESULT" | tail -n1)
BODY=$(echo "$RESULT" | sed '$d')

echo "   HTTP $HTTP_CODE"
echo "$BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { console.log(JSON.stringify(JSON.parse(d), null, 2)); } catch(e) { console.log(d); } });"

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "   OK: Profile updated with extracted specialty and skills."
else
  echo "   Request failed (HF space may be sleeping; try again in a minute)."
  exit 1
fi
