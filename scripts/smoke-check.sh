#!/usr/bin/env bash
# Smoke-check API after deploy.
# Usage: ./scripts/smoke-check.sh https://api.example.com
#    or: ./scripts/smoke-check.sh https://api.example.com/api/v1
set -euo pipefail

BASE="${1:-http://localhost:5430}"
BASE="${BASE%/}"
if [[ "$BASE" != */api/v1 ]]; then
  BASE="${BASE}/api/v1"
fi

echo "→ Health  ${BASE}/health"
curl -fsS "${BASE}/health" | head -c 400
echo ""
echo "→ Ready   ${BASE}/ready"
curl -fsS "${BASE}/ready" | head -c 400
echo ""
echo "→ Meta    ${BASE}/meta"
curl -fsS "${BASE}/meta" | head -c 300
echo ""
echo "OK — smoke checks passed."
