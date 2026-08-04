#!/usr/bin/env bash
# Trigger a Coolify redeploy for Janasadharana (or any app UUID).
#
# Prerequisites:
#   export COOLIFY_TOKEN='...'          # Coolify API token (Bearer)
#   export COOLIFY_APP_UUID='...'       # Application / resource UUID
# Optional:
#   export COOLIFY_URL='http://5.223.44.201:8000'
#
# Usage:
#   ./scripts/coolify-redeploy.sh
#   COOLIFY_APP_UUID=xxxx ./scripts/coolify-redeploy.sh
set -euo pipefail

COOLIFY_URL="${COOLIFY_URL:-http://5.223.44.201:8000}"
API="${COOLIFY_URL%/}/api/v1"

if [[ -z "${COOLIFY_TOKEN:-}" ]]; then
  echo "Missing COOLIFY_TOKEN."
  echo "Create a token in Coolify → Keys & Tokens, then:"
  echo "  export COOLIFY_TOKEN='...'"
  exit 1
fi

if [[ -z "${COOLIFY_APP_UUID:-}" ]]; then
  echo "Missing COOLIFY_APP_UUID (the Coolify application / compose resource UUID)."
  echo "Find it in Coolify UI (resource URL) or:"
  echo "  curl -sS -H \"Authorization: Bearer \$COOLIFY_TOKEN\" ${API}/applications | head"
  echo "Then:"
  echo "  export COOLIFY_APP_UUID='...'"
  exit 1
fi

echo "Redeploying ${COOLIFY_APP_UUID} via ${COOLIFY_URL} ..."
# Coolify v4 style deploy endpoint
HTTP_CODE=$(curl -sS -o /tmp/coolify-redeploy.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
  -H "Accept: application/json" \
  "${API}/deploy?uuid=${COOLIFY_APP_UUID}" || true)

# Fallback path used by some Coolify versions
if [[ "$HTTP_CODE" == "404" || "$HTTP_CODE" == "405" ]]; then
  HTTP_CODE=$(curl -sS -o /tmp/coolify-redeploy.json -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${COOLIFY_TOKEN}" \
    -H "Accept: application/json" \
    "${API}/applications/${COOLIFY_APP_UUID}/deploy" || true)
fi

echo "HTTP ${HTTP_CODE}"
cat /tmp/coolify-redeploy.json 2>/dev/null | head -c 800 || true
echo ""

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" && "$HTTP_CODE" != "202" ]]; then
  echo "Deploy may have failed — check Coolify UI logs."
  exit 1
fi

echo "Deploy triggered. Watch Coolify → Deployments for logs."
