#!/usr/bin/env bash
# Section 3 verification (SPEC §3). Reads NOMI_KEY from .env.local (gitignored),
# probes through the local relay at :8888, and prints only the SHAPE of each
# response — every scalar value is replaced by its type, so real names/messages
# are never printed. Read-only probes only; chat/room-create are held for explicit go.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "Missing .env.local with NOMI_KEY=..."; exit 1; }
# shellcheck disable=SC1091
set -a; . ./.env.local; set +a
: "${NOMI_KEY:?Set NOMI_KEY in .env.local}"

BASE="http://localhost:8888/api"
AUTH="Authorization: $NOMI_KEY"

# jq: replace scalars with their type; show only first 3 array elements' shape.
REDACT='def red: if type=="object" then map_values(red)
  elif type=="array" then (if length>3 then [.[0:3][]|red]+["…+\(length-3) more"] else map(red) end)
  else type end; red'

echo "=== V-fields: GET /nomis (field names) ==="
curl -s -H "$AUTH" "$BASE/nomis" | jq "$REDACT"

echo; echo "=== V1: GET /nomis/:id (does detail include messages?) ==="
FIRST=$(curl -s -H "$AUTH" "$BASE/nomis" | jq -r '(.nomis // .)[0].uuid // (.nomis // .)[0].id // empty')
if [ -n "$FIRST" ]; then
  curl -s -H "$AUTH" "$BASE/nomis/$FIRST" | jq "$REDACT"
else
  echo "Could not extract a nomi id from the list — inspect the V-fields shape above."
fi

echo; echo "=== V4: GET /rooms (room shape) ==="
curl -s -H "$AUTH" "$BASE/rooms" | jq "$REDACT"

echo; echo "=== V5: GET /nomis/:id/avatar (headers only) ==="
if [ -n "${FIRST:-}" ]; then
  curl -s -D - -o /dev/null -H "$AUTH" "$BASE/nomis/$FIRST/avatar" \
    | grep -iE '^(HTTP|content-type|content-length|cache-control|etag)'
fi

echo; echo "Done. V2 (send a 'ping' chat) and V4-create (POST /rooms) are NOT run here —"
echo "they mutate your account. Say the word and I'll run them."
