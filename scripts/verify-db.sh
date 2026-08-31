#!/usr/bin/env bash
#
# Podiže čistu bazu, primenjuje migracije, seed i testove izolacije.
#
# Radi nad običnim PostgreSQL-om, bez Docker-a i bez naloga na Supabase-u,
# pa isti skript koristi i programer lokalno i CI.
#
#   ./scripts/verify-db.sh                 # sve
#   ./scripts/verify-db.sh --no-tests      # samo migracije i seed
#
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
DB="${KOMANDA_TEST_DB:-komanda_test}"
RUN_TESTS=1
[ "${1:-}" = "--no-tests" ] && RUN_TESTS=0

psql_run() {
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"
}

echo "▸ Pravim čistu bazu '$DB'"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -q \
  -c "drop database if exists $DB;" -c "create database $DB;"

echo "▸ Supabase shim (role, auth šema, vault)"
psql_run "$DB" -f scripts/local-pg/00_supabase_shim.sql
psql_run "$DB" -f scripts/local-pg/10_test_helpers.sql

echo "▸ Migracije"
for f in supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$f")"
  psql_run "$DB" -f "$f"
done

echo "▸ Seed"
for f in supabase/seed/*.sql; do
  [ -e "$f" ] || continue
  printf '   %s\n' "$(basename "$f")"
  psql_run "$DB" -f "$f"
done

if [ "$RUN_TESTS" -eq 1 ]; then
  echo "▸ Testovi izolacije"
  for f in supabase/tests/*.sql; do
    [ -e "$f" ] || continue
    printf '   %s\n' "$(basename "$f")"
    psql_run "$DB" -f "$f"
  done
fi

echo "✓ Baza je ispravna"
