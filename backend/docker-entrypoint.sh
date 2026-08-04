#!/bin/sh
set -e

echo "Running migrations..."
node src/db/migrate.js

if [ "${RUN_SEED}" = "true" ]; then
  echo "Running seed (RUN_SEED=true)..."
  node src/db/seed.js || echo "Seed skipped or already applied with warnings"
fi

echo "Starting API..."
exec node src/index.js
