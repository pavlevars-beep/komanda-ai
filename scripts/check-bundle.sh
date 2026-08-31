#!/usr/bin/env bash
#
# Provera da u klijentski bundle nije procurilo ništa serversko.
#
# ESLint granice i `server-only` hvataju većinu slučajeva u vreme pisanja
# koda, ali ovo je poslednja provera nad onim što se STVARNO šalje pregledaču.
# Pokreće se posle `next build`.
#
set -euo pipefail

DIR="${1:-.next/static}"

if [ ! -d "$DIR" ]; then
  echo "✗ Nema '$DIR' — pokreni prvo 'npm run build'."
  exit 1
fi

fail=0

check() {
  local pattern="$1" label="$2"
  local hits
  hits=$(grep -rlE "$pattern" "$DIR" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    echo "✗ $label"
    echo "$hits" | sed 's/^/    /'
    fail=1
  else
    echo "✓ $label"
  fi
}

echo "▸ Skeniram klijentski bundle: $DIR"

check 'SUPABASE_SERVICE_ROLE_KEY|service_role'      'nema service_role ključa'
check '\bsk-[A-Za-z0-9_-]{20,}'                     'nema OpenAI ključa'
check 'OPENAI_API_KEY'                              'nema naziva OpenAI promenljive'
check '(postgres|postgresql|mysql|mssql)://[^"'"'"' ]+' 'nema connection stringa'
check 'vault_secret_id'                             'nema reference na Vault tajnu'
check 'BEGIN (RSA |EC )?PRIVATE KEY'                'nema privatnog ključa'

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "✗ Klijentski bundle sadrži nešto što ne sme da napusti server."
  exit 1
fi

echo "✓ Bundle je čist"
