# ADR 0003 — Impersonation umesto trajnog staff pristupa

**Status:** Prihvaćeno · **Datum:** 2026-08-31

## Kontekst
Delta Pro mora da dijagnostikuje probleme kod klijenata. Uobičajeno rešenje je BYPASSRLS ili staff izuzetak u politikama.

## Odluka
Razdvajamo administrativni pristup (konfiguracija, uvek dostupna dodeljenom osoblju) od pristupa poslovnim podacima (samo kroz vremenski ograničenu, obrazloženu i klijentu vidljivu sesiju).

## Posledice
Sporija dijagnostika za nekoliko sekundi po sesiji. Zauzvrat: dokaziva izolacija pred IT revizijom klijenta i konkurentska prednost u prodaji. Ni Super Admin nema tihi pristup.
