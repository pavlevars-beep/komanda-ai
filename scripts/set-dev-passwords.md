# Razvojne lozinke

Seed namerno **ne** sadrži lozinke ni njihove heševe. Heš lozinke u
repozitorijumu je tajna u verzionisanom fajlu, bez obzira na to što je
„samo razvojna" — takve stvari prežive u istoriji i završe u produkciji.

Nakon `supabase db reset`, lozinke za razvojne naloge se postavljaju kroz
Supabase Admin API, lokalno:

```bash
# Zahteva SUPABASE_SERVICE_ROLE_KEY iz lokalnog .env.local
node --env-file=.env.local scripts/set-dev-passwords.mjs
```

Skript se piše u Fazi 2, zajedno sa tokom pozivnica. Do tada se za lokalni
razvoj koristi prijava magičnim linkom kroz Supabase Studio (Inbucket hvata
poštu na `http://127.0.0.1:54324`).

Nalozi kreirani seed-om:

| E-adresa | Uloga |
|---|---|
| ana.jovanovic@deltapro.rs | Delta Pro Super Admin |
| marko.ilic@deltapro.rs | Delta Pro konsultant (dodeljen: Demo Distribucija) |
| jelena.savic@demo-distribucija.rs | Vlasnik — Demo Distribucija |
| petar.mitic@demo-distribucija.rs | Prodaja — Demo Distribucija |
| milan.kostic@demo-distribucija.rs | Opozvano članstvo (za testove) |
| nikola.pavlovic@demo-hotel.rs | Vlasnik — Demo Hotel Grupa |
| sara.djordjevic@demo-hotel.rs | Finansije — Demo Hotel Grupa |
| stefan.nikolic@example.com | Bez ijednog članstva (za testove) |
