/**
 * Čitanje CSV i TSV tabela.
 *
 * Pisano ručno jer je format u praksi neuredniji nego što biblioteke
 * pretpostavljaju: izvozi iz domaćih ERP-ova umeju da imaju tačku-zarez kao
 * razdvajač, BOM na početku, CRLF prelome i zarez kao decimalni znak unutar
 * navodnika. Sve to se ovde obrađuje, jer se sve to stvarno pojavljuje.
 */

/**
 * Razdvajač se PREPOZNAJE, ne pretpostavlja.
 *
 * U srpskom Excelu je podrazumevani razdvajač tačka-zarez, jer je zarez
 * zauzet kao decimalni znak. Fajl sa tačkom-zarezom pročitan kao zarezom
 * razdvojen daje jednu jedinu kolonu — i korisnik vidi „tabela je prazna"
 * umesto stvarnog razloga.
 *
 * Broji se pojavljivanje van navodnika u prvih nekoliko redova; pobeđuje onaj
 * koji daje najviše kolona.
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')
  const candidates = [';', ',', '\t', '|']

  let best = ','
  let bestCount = 0

  for (const candidate of candidates) {
    let count = 0
    let inQuotes = false
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (ch === candidate && !inQuotes) count++
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }

  return best
}

/**
 * Redovi iz teksta.
 *
 * Navodnici se poštuju do kraja: prelom reda UNUTAR navodnika je deo vrednosti,
 * ne kraj reda. Adresa kupca u dva reda je uobičajena i bez toga bi razbila
 * ceo fajl od tog mesta nadalje.
 */
export function parseDelimited(text: string, delimiter?: string): readonly (readonly string[])[] {
  // BOM na početku bi inače postao deo naziva prve kolone, pa se mapiranje ne
  // bi poklopilo ni sa čim.
  const clean = text.replace(/^\ufeff/, '')
  const sep = delimiter ?? detectDelimiter(clean)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]

    if (inQuotes) {
      if (ch === '"') {
        // Dvostruki navodnik unutar navodnika je jedan navodnik u vrednosti.
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // CRLF: sam prelom obrađuje grana za \n.
    } else {
      field += ch
    }
  }

  // Poslednji red najčešće nema završni prelom.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}
