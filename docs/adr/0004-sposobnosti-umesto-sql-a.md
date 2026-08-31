# ADR 0004 — Konektori izlažu sposobnosti, ne SQL

**Status:** Prihvaćeno · **Datum:** 2026-08-31

## Kontekst
Najbrži način da AI odgovara na poslovna pitanja je da generiše SQL nad bazom klijenta. To je neprihvatljivo: nepredvidivi upiti nad produkcijom, rizik od izmene podataka, nemoguća revizija.

## Odluka
Konektor izlaže imenovane sposobnosti sa Zod šemama (getDailySales, getOutstandingInvoices). Nema query(sql). SQL je unapred napisan, code-reviewed i verzionisan u repozitorijumu.

## Posledice
Svaka nova sposobnost traži razvojni rad. Zauzvrat: predvidivo opterećenje baze klijenta, potpuna revizija, read-only nalozi, i AI koji ne može da uradi ništa što nije unapred odobreno.
