# ADR 0005 — Obavezna klasifikacija AI tvrdnji

**Status:** Prihvaćeno · **Datum:** 2026-08-31

## Kontekst
AI lako pomeša podatak iz baze sa sopstvenom procenom. U poslovnom kontekstu to je ozbiljan rizik — rukovodilac donosi odluku na osnovu izmišljenog broja.

## Odluka
Svaka tvrdnja u odgovoru nosi klasifikaciju: FACT, CALCULATION, INTERPRETATION ili FORECAST. Klasifikacija dolazi iz definicije alata, ne iz modela. UI ih vizuelno razlikuje.

## Posledice
Odgovori su nešto duži i manje glatki. Zauzvrat: korisnik uvek zna šta gleda, a prognoza nikad ne izgleda kao podatak iz ERP-a. Ovo je razlika između poslovnog alata i igračke.
