# ADR 0002 — Browser ne komunicira direktno sa bazom

**Status:** Prihvaćeno · **Datum:** 2026-08-31

## Kontekst
Supabase omogućava direktne upite iz browsera uz RLS. To je brže za razvoj, ali izlaže šemu, otežava rate limiting i audit, i vezuje UI za Supabase.

## Odluka
Browser koristi Supabase isključivo za auth sesiju. Svi poslovni podaci idu kroz naše Next.js rute. Role anon i authenticated nemaju prava nad tabelama.

## Posledice
Više koda po funkciji, ali: jedno mesto za autorizaciju i reviziju, mogućnost zamene baze, i eliminisana cela klasa grešaka sa zaboravljenim filterom. Prihvatamo trošak.
