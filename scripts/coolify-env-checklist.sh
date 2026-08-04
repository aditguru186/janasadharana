#!/usr/bin/env bash
# Print a Coolify env checklist (no secrets printed from local .env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Janasadharana Coolify env checklist ==="
echo "Repo root: $ROOT"
echo ""
echo "Required:"
for k in \
  NODE_ENV \
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB \
  JWT_ACCESS_SECRET JWT_REFRESH_SECRET \
  PUBLIC_API_URL CORS_ORIGINS \
  ALLOW_INSECURE_DEFAULTS
do
  echo "  [ ] $k"
done
echo ""
echo "Seed (first boot):"
for k in SEED_ADMIN_PHONE SEED_ADMIN_PASSWORD SEED_OFFICER_PHONE SEED_OFFICER_PASSWORD RUN_SEED; do
  echo "  [ ] $k"
done
echo ""
echo "R2 cow welfare:"
for k in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_ARTEFACTS_FOLDER R2_AUDIOS_FOLDER R2_PUBLIC_URL; do
  echo "  [ ] $k"
done
echo ""
echo "Template file: $ROOT/.env.example"
echo "Full guide:    $ROOT/docs/COOLIFY-DEPLOY.md"
echo ""
echo "Generate secrets:  ./scripts/generate-secrets.sh"
echo "Smoke after deploy: ./scripts/smoke-check.sh https://YOUR-API-HOST"
