# ADR 0001 — Dva iskustva u jednoj aplikaciji

**Status:** Prihvaćeno · **Datum:** 2026-08-31

## Kontekst
Potrebna su dva bitno različita korisnička iskustva: Delta Pro konzola i klijentski radni prostor. Alternativa je bila razdvajanje u dva zasebna deployment-a.

## Odluka
Jedna Next.js aplikacija sa dva route grupe, dva layout guarda i dva odvojena API prefiksa. Zajednički domen i design system, razdvojena autorizacija.

## Posledice
Deljenje domenske logike bez duplikata; jedan deployment. Cena: guard-ovi moraju biti besprekorni, jer greška u layout-u znači ukrštanje konteksta. Zato postoji test koji za svaku rutu proverava da li nosi ispravan guard.
