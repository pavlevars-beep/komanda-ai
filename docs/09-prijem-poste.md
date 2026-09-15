# Prijem podataka poštom (Mailgun)

Ovo je uputstvo za jednokratno podešavanje. Radi se jednom za celu platformu,
ne po klijentu.

## Zašto Mailgun i zašto EU region

Kroz ovaj kanal prolaze imena kupaca, iznosi dugovanja i ko kome koliko duguje —
najosetljiviji podaci koje dodirujemo. Kada direktor pita gde to stoji, odgovor
„u Evropi" zatvara razgovor, a „u Sjedinjenim Državama" ga otvara.

Region se bira PRI PRAVLJENJU naloga i **ne može se kasnije promeniti** bez
otvaranja novog. Ako se pogreši, sve se radi ispočetka.

## Korak 1: poddomen, ne glavni domen

Prijem ide na **zaseban poddomen**, na primer `uvoz.komanda.ai`.

> Ako usmerite MX zapis glavnog domena na Mailgun, **prestaje da radi poslovna
> e-pošta Delta Pro-a**. To je greška koja se primeti za sat vremena, usred
> radnog dana, i vraća se ručno.

Poddomen potpuno odvaja prijem podataka od vaše prepiske, a adresa i dalje
izgleda uredno: `uvoz+<token>@uvoz.komanda.ai`.

## Korak 2: DNS zapisi

U Mailgun-u se doda domen (Sending → Domains → Add New Domain), unese
`uvoz.komanda.ai` i izabere **EU region**. Mailgun tada ispiše tačne vrednosti
zapisa. Oblik je ovakav — **vrednosti prepisati iz Mailgun-a, ne odavde**:

| Tip | Ime | Vrednost | Čemu služi |
|---|---|---|---|
| MX | `uvoz` | `mxa.eu.mailgun.org` (prioritet 10) | prijem poruka |
| MX | `uvoz` | `mxb.eu.mailgun.org` (prioritet 10) | rezerva |
| TXT | `uvoz` | `v=spf1 include:eu.mailgun.org ~all` | SPF |
| TXT | `<izabrani>._domainkey.uvoz` | javni ključ iz Mailgun-a | DKIM |

Za sam prijem dovoljni su MX zapisi. SPF i DKIM se dodaju jer se **naš
bezbednosni model oslanja na njih**: bez provere autentičnosti spisak
dozvoljenih pošiljalaca ne vredi ništa, jer se adresa pošiljaoca lažira u tri
reda koda.

Provera da su se zapisi raširili:

```
dig MX uvoz.komanda.ai +short
dig TXT uvoz.komanda.ai +short
```

Širenje ume da potraje do nekoliko sati. Mailgun ima dugme „Verify DNS Settings"
koje kaže šta još nedostaje.

## Korak 3: ruta u Mailgun-u

Receiving → Create Route:

- **Expression type:** Match Recipient
- **Recipient:** `^uvoz\+.*@uvoz\.komanda\.ai$`
- **Actions:** `forward("https://<APP_URL>/api/nadzor/posta/mailgun")`
- **Priority:** 0

Namerno se koristi `forward`, ne `store`. Prilog tada stiže u samom zahtevu, bez
dodatnog poziva ka Mailgun-u i bez čuvanja poslovnih podataka kod dobavljača
duže nego što traje isporuka.

> **Granica veličine.** Kroz ovaj put prilog sme da bude do oko 4 MB, zbog
> ograničenja tela zahteva na platformi. `.xlsx` je sažet i praktično uvek staje
> (50.000 redova prodaje je oko 2 MB); veliki `.csv` ne mora. Kada to postane
> usko grlo, prelazi se na `store()` — Mailgun tada čuva poruku i šalje URL, a
> mi prilog dovučemo serverski kroz postojeću zaštitu od SSRF-a.

## Korak 4: promenljive okruženja

U Vercel-u (Production i Preview):

| Promenljiva | Odakle | Napomena |
|---|---|---|
| `MAIL_DOMAIN` | `uvoz.komanda.ai` | domen namenskih adresa |
| `MAILGUN_SIGNING_KEY` | Mailgun → Webhooks → HTTP webhook signing key | **nije** API ključ |
| `SUPABASE_SERVICE_ROLE_KEY` | već podešen | prijem radi bez korisnika |

Provera šeme okruženja odbija podešavanje na pola: `MAILGUN_SIGNING_KEY` bez
`MAIL_DOMAIN` obara build. Razlog je što bi adresa tada u konzoli izgledala
spremno, a poruke ne bi imale gde da stignu.

Dok ove promenljive nisu podešene, ruta vraća 404 — postojanje interne rute
nije informacija koju delimo sa onim ko nije pozvan da je koristi.

## Korak 5: provera da radi

1. U konzoli, uz integraciju tipa `file`, otvoriti **Uvoz**.
2. Uraditi **jedan uvoz ručno**. Pošta puni tek pošto su kolone jednom
   potvrđene — bez toga bi pogođeno mapiranje niko ne proverio.
3. Napraviti sanduče za tu vrstu podatka, upisati dozvoljenog pošiljaoca i
   uključiti prijem.
4. Poslati probnu poruku sa te adrese, sa jednom `.xlsx` tabelom u prilogu.
5. Osvežiti stranicu: poruka mora da se pojavi u **Dolazne poruke**, primljena
   ili odbijena sa razlogom.

Ako se poruka ne pojavi uopšte, kvar je pre nas — u Mailgun-ovom dnevniku
(Sending → Logs) vidi se da li je poruka stigla i šta je ruta uradila.

## Šta se NE podešava po klijentu

Domen, DNS i ključ su jednokratni. Po klijentu se podešava samo sanduče:
adresa se generiše sama, a konsultant unosi spisak dozvoljenih pošiljalaca.
