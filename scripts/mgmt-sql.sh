#!/usr/bin/env bash
# Run SQL against the live Supabase DB via the Management API (HTTPS).
# Fallback path for networks that block outbound Postgres ports (5432/6543).
# Usage: scripts/mgmt-sql.sh "SELECT 1;"   or   scripts/mgmt-sql.sh -f file.sql
# Auth: Supabase CLI access token from macOS keychain (requires `supabase login` done once).
set -euo pipefail

PROJECT_REF="rlbtdpnmdnaxlccelxdr"
TOKEN=$(security find-generic-password -l "Supabase CLI" -w)

if [ "${1:-}" = "-f" ]; then
  SQL=$(cat "$2")
else
  SQL="$1"
fi

jq -n --arg q "$SQL" '{query: $q}' | curl -sS -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d @-
echo
