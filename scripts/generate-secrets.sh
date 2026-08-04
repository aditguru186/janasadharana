#!/usr/bin/env bash
# Generate strong secrets for Coolify / production .env
set -euo pipefail

rand() {
  # 48 hex chars ≈ 24 bytes
  openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | xxd -p -c 48
}

echo "# Paste into Coolify Environment Variables (production)"
echo "JWT_ACCESS_SECRET=$(rand)"
echo "JWT_REFRESH_SECRET=$(rand)"
echo "POSTGRES_PASSWORD=$(rand)"
echo "SEED_ADMIN_PASSWORD=ChangeMe-$(rand | cut -c1-12)"
echo "SEED_OFFICER_PASSWORD=ChangeMe-$(rand | cut -c1-12)"
echo "ALLOW_INSECURE_DEFAULTS=false"
echo "NODE_ENV=production"
echo ""
echo "# Remember to set:"
echo "# PUBLIC_API_URL=https://<api-host>/api/v1"
echo "# CORS_ORIGINS=https://<web-host>"
echo "# R2_* for cow-welfare-puri bucket"
