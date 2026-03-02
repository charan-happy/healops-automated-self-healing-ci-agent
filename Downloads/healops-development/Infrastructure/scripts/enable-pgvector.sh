#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Run ONCE after terraform apply to enable pgvector on RDS.
# Called automatically by the deploy workflow on first deploy.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RDS_HOST="${1:?Usage: $0 RDS_HOST DB_PASSWORD}"
DB_PASS="${2:?}"
DB_NAME="healops"
DB_USER="healops"

echo "▶ Enabling pgvector extension on RDS..."

PGPASSWORD="$DB_PASS" psql \
  "host=$RDS_HOST port=5432 dbname=$DB_NAME user=$DB_USER sslmode=require" \
  << 'SQL'
-- Enable pgvector (must be done as superuser before any app migrations)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('vector', 'pg_stat_statements', 'uuid-ossp');
SQL

echo "✅ pgvector enabled on RDS $RDS_HOST"