#!/usr/bin/env bash
#
# Provera javnih servisa iz kataloga.
#
# NE obara build i namerno nije deo `verify`. Državni sajtovi padaju, rade
# sporo i vraćaju čudne statuse bez ikakve veze sa našim kodom — CI koji pukne
# zato što je ministarstvo u prekidu nauči tim da crveno ne znači ništa.
#
# Pokreće se na zahtev, ili zakazano. Ispisuje stanje i izlazi sa nulom osim
# kada ijedan link uopšte ne odgovori.

set -uo pipefail

CATALOG="src/core/links/catalog.ts"
TIMEOUT="${LINK_TIMEOUT:-15}"

if [ ! -f "$CATALOG" ]; then
  echo "Katalog nije nađen: $CATALOG" >&2
  exit 1
fi

# Adrese se čitaju IZ KATALOGA, ne iz zasebnog spiska. Dva spiska bi se razišla,
# a onaj koji se ne proverava je upravo onaj koji je pokvaren.
mapfile -t URLS < <(grep -o "url: '[^']*'" "$CATALOG" | sed "s/url: '//; s/'$//" | sort -u)

if [ "${#URLS[@]}" -eq 0 ]; then
  echo "U katalogu nema nijedne adrese." >&2
  exit 1
fi

echo "▸ Proveravam ${#URLS[@]} adresa iz $CATALOG"
echo

mrtvih=0
sumnjivih=0

for url in "${URLS[@]}"; do
  # `-L` prati preusmerenja: državni sajtovi redovno vraćaju 301 na isti sadržaj.
  read -r code time <<< "$(curl -sSL -o /dev/null \
    -w '%{http_code} %{time_total}' \
    --max-time "$TIMEOUT" \
    "$url" 2>/dev/null || echo "000 0")"

  case "$code" in
    2*)
      printf '  ✓ %-6s %5.1fs  %s\n' "$code" "$time" "$url"
      ;;
    000)
      printf '  ✗ %-6s %5.1fs  %s  — ne odgovara\n' "nema" "$time" "$url"
      mrtvih=$((mrtvih + 1))
      ;;
    *)
      # 403 i 500 na ovim sajtovima često znače da im se ne sviđa naš klijent,
      # a ne da je stranica nestala. Prijavljuje se, ali se ne broji kao kvar.
      printf '  ? %-6s %5.1fs  %s  — proveriti rukom\n' "$code" "$time" "$url"
      sumnjivih=$((sumnjivih + 1))
      ;;
  esac
done

echo
if [ "$mrtvih" -gt 0 ]; then
  echo "✗ Bez odgovora: $mrtvih"
  echo "  Pokvaren link je obećanje koje se prekršilo — zameniti ili ukloniti."
  exit 1
fi

if [ "$sumnjivih" -gt 0 ]; then
  echo "⚠ Za ručnu proveru: $sumnjivih (status koji nije 2xx, ali odgovor postoji)"
fi

echo "✓ Sve adrese odgovaraju"
