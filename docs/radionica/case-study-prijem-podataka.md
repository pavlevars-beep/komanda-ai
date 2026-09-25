# Case study za n8n radionicu — Komanda AI: kako podatak klijenta stiže do nas

> Radionica AI automatizacije, Bildi akademija · 26.09.2026.
> Live build: **prijem jutarnjeg izveštaja iz ERP-a klijenta + straža tišine.**

## 1. Zašto baš ovo

Komanda AI je gotova sa jedne strane: izolacija klijenata, tabla, jutarnji brif,
pitanja, poreklo svakog broja. Sve to danas radi nad **demo podacima**.

Deo koji najviše plaši je sredina lanca:

```
ERP klijenta  ──►  ???  ──►  Komanda AI (brif, upozorenja, pitanja)
```

Konkretno pitam sebe:

- Kako uopšte doći do podataka kada je ERP (MIS, Pantheon…) na računaru u
  firmi, bez adrese na internetu, a njihov IT ne želi rupu u firewall-u?
- Kome dajem kredencijale, gde se čuvaju, i šta ako procure?
- Šta kad sutra neko preimenuje kolonu u Excelu, a mi mesecima prikazujemo
  pogrešan broj?
- Šta kad izveštaj **prestane da stiže**? Ništa ne pukne; tabla mirno
  prikazuje jučerašnje brojeve kao današnje.

Taj poslednji kvar je najopasniji, jer greške nema. Postoji samo tišina.

**Kriterijumi radionice:**

| Kriterijum | Kako ga ovo ispunjava |
|---|---|
| Realan problem | Prvi klijent (Euro Profil) još nema odgovor na „kako nam šaljete podatke". Bez toga proizvod ostaje na demo podacima. |
| Demo za 20 min | Pošaljem mejl sa `.xlsx` → red se pojavi u tabeli. Pošaljem loš fajl → stigne mejl „odbijeno, fali kolona dospeće". |
| Upotrebljivo posle | Isti tok se koristi kao **most** dok ne stigne pravi ERP konektor, i prodaje se svakom sledećem klijentu kao „podešavanje prijema podataka". |

## 2. Put podatka: četiri opcije, jedna izabrana

Fajl na računaru u firmi nema adresu sa interneta. Zato ili nešto sa njihove
strane **gura** fajl ka nama, ili fajl stoji na mestu koje vide obe strane.
Opcije su poređane po tome koliko dugo rade bez ljudske pažnje:

| # | Put | Šta traži od klijenta | Slabost |
|---|---|---|---|
| **1** | **Mejl na namensku adresu** (ERP zakaže izveštaj) | Jedno podešavanje u ERP-u, ništa se ne instalira | Veličina priloga (~3–4 MB) |
| 2 | Deljeni folder (Drive/OneDrive) | Da čovek čuva izveštaj u drugi folder | Sinhronizacija, nalog se izloguje |
| 3 | Mali agent na njihovom računaru | Instalaciju i naše održavanje | Umire pri reinstalaciji računara |
| 4 | SFTP / VPN / read-only nalog na bazi | Posao njihovog IT-a, otvaranje firewall-a | Najsporije do dogovora |

**Za radionicu biram opciju 1.** To je jedini put koji potpuno izbacuje čoveka
iz svakodnevnog kruga: skoro svaki ERP ume da zakaže izveštaj i pošalje ga
mejlom. Na radionici ga pravim u n8n-u. U Komanda AI isti put već postoji u kodu
(`/api/nadzor/posta/mailgun`), a n8n verzija služi da se ideja **pokaže i proda**
pre nego što se klijent uopšte poveže na platformu.

## 3. Razlaganje po komponentama (šablon radionice)

### Trigger
- **Tok A:** novi mejl na `mojmejl+uvoz@gmail.com` sa prilogom (Gmail trigger,
  proverava na svaki minut). Plus-adresa daje namensku adresu bez novog naloga,
  kao `uvoz+<token>@uvoz.komanda.ai` u produkciji.
- **Tok B:** raspored, radnim danima u 08:30 (Europe/Belgrade).

### Data inputs
- Mejl: pošiljalac, zaglavlje `Authentication-Results` (DKIM), naslov, prilozi.
- Prilog: `.xlsx` izveštaj **potraživanja** (kupac, broj fakture, iznos, datum dospeća).
- Za tok B: dnevnik prijema (list „Dnevnik" u Google Sheets).

### Logic
1. **Čuvar na ulazu.** Adresa nije lozinka, jer prolazi kroz tuđe logove i mejl
   servere. Zato proveravam:
   - pošiljalac je na spisku dozvoljenih (prazan spisak ne propušta **nikoga**);
   - DKIM je prošao (adresa pošiljaoca se lažira u tri reda koda; nepoznat
     rezultat = neuspeh);
   - stigla je **tačno jedna** tabela. Dve tabele se odbijaju, ne pogađa se koja je prava.
2. **Mapiranje kolona po tragovima** (`iznos`, `dug`, `saldo` → iznos;
   `dospeć`, `valuta`, `rok` → dospeće…), sa svođenjem č/ć/š/ž/đ. Isti tragovi
   kao u `src/core/import/mapping.ts`.
3. **Fali obavezna kolona → odbij celu tabelu.** Pogrešno pogođena kolona se ne
   vidi kao greška nego kao pogrešan broj, mesecima.
4. **Pretvaranje vrednosti:** `184.500,00`, `15.08.2026.` i Excelov serijski
   datum svode se na broj i ISO datum. Poneki loš red se preskoči i prijavi; ako je
   loša većina, cela tabela se odbija.
5. **Straža tišine (tok B):** koliko je rokova prošlo od poslednjeg prijema?
   - `kasni`: jedan propušten rok, izvoz verovatno nije pokrenut;
   - `ne stiže`: dva ili više, brojevima se više ne veruje;
   - `nikad nije stiglo`: dotok nije ni uspostavljen, pa se proverava podešavanje.

### Actions
- Upis ispravnih redova u list **Potraživanja**.
- Upis **jednog reda po poruci** u **Dnevnik**, i za primljenu i za odbijenu, sa razlogom.
- Mejl meni (konsultantu) kada je poruka odbijena ili izveštaj ne stiže.
  **Kada je sve u redu, ništa ne šaljem.** Poruka „sve je OK" svakog jutra
  nauči čoveka da je preskače.

### Memory
Da, i to je suština. **Dnevnik prijema je memorija:**
- bez njega klijent kaže „poslao sam", sistem kaže „nije stiglo", i niko ne može
  da proveri ko je u pravu;
- bez njega straža tišine nema prema čemu da meri.

Druga memorija je **očekivanje zapisano unapred**: radnim danima do 08:00, uz
30 min tolerancije. Bez zapisanog dogovora sistem ne zna da li je izostanak kvar
ili je tako dogovoreno.

### Integracije
| Alat | Uloga | Kredencijal |
|---|---|---|
| Gmail | prijem (trigger) + upozorenja | OAuth, moj nalog |
| Google Sheets | privremeno skladište + dnevnik | OAuth, moj nalog |
| n8n | izvršni motor | instanca sa radionice |
| *(kasnije)* Komanda AI API | umesto Sheets-a: `readImported` → tabla, brif | potpisan webhook (HMAC) |

**Klijentu ne treba nijedan kredencijal od nas, a nama nijedan njegov.** On
samo šalje mejl. To je odgovor na strah „kome dajem pristup".

## 4. Šta je pripremljeno u ovom folderu

| Fajl | Čemu služi |
|---|---|
| `n8n-prijem-podataka.json` | Ceo workflow (oba toka). U n8n: **⋯ → Import from File**. |
| `primer-potrazivanja.xlsx` | Ispravan izveštaj sa 8 faktura, za srećan put. |
| `primer-potrazivanja-los-format.xlsx` | Ista tabela, ali je kolona „Datum dospeća" preimenovana u „Napomena". Mora biti odbijena. |

### Podešavanje pre demonstracije (≈10 min)

1. Google Sheets: napravi tabelu **„Komanda – prijem"** sa dva lista:
   - `Potrazivanja`: zaglavlje `kupac | faktura | iznos | dospece | izvor | fajl | primljeno`
   - `Dnevnik`: zaglavlje `primljeno | vrsta | status | posiljalac | fajl | redova | ukupno | razlog`
2. Uvezi `n8n-prijem-podataka.json`.
3. Poveži Gmail i Google Sheets kredencijale. U četiri Sheets čvora izaberi tabelu i list.
4. Zameni `TVOJ.MEJL` u Gmail trigeru i u dva „Javi" čvora.
5. U čvoru *Provera pošiljaoca i priloga* upiši u `DOZVOLJENI_POSILJAOCI` adresu
   sa koje šalješ probni mejl. To je tvoja druga adresa i glumi „ERP klijenta".
6. Ako sve pada sa „DKIM nepoznat", otvori izlaz trigera i pogledaj
   `headers`. Tek onda privremeno stavi `ZAHTEVAJ_DKIM = false`, i reci to naglas.

## 5. Scenario demonstracije (20 min)

| Min | Šta radim | Šta publika vidi |
|---|---|---|
| 0–3 | Problem: „ERP je u podrumu firme, kako do podataka?" Tabela sa četiri puta. | Zašto baš mejl |
| 3–7 | Šaljem `primer-potrazivanja.xlsx` sa dozvoljene adrese. | 8 redova u *Potrazivanja*, red „primljeno" u *Dnevniku* |
| 7–10 | Šaljem **isti fajl sa druge adrese**. | Odbijeno: „pošiljalac nije na spisku". Mejl upozorenja stiže. |
| 10–13 | Šaljem `primer-potrazivanja-los-format.xlsx`. | Odbijeno: „Nedostaju obavezne kolone: dospece". **Ništa nije upisano napola.** |
| 13–17 | Ručno pokrećem stražu tišine (*Execute workflow* na rasporedu). Obrišem današnji red iz dnevnika. | Mejl „potraživanja: KASNI" |
| 17–20 | Kako ovo postaje proizvod: Sheets se menja pozivom ka Komanda AI API-ju; klijent n8n nikad ne vidi. | Cena i ponuda (ispod) |

## 6. Kako ovo prodajem sledećem klijentu

> „Vaš ERP već ume da pošalje izveštaj mejlom. Mi podesimo da to radi svako
> jutro, proverimo da je stiglo od vas i da je ispravno, i **javimo vam pre nego
> što primetite** ako izveštaj ne stigne. Ne instaliramo ništa kod vas i ne tražimo
> pristup vašoj bazi."

- **Jednokratno:** podešavanje prijema po vrsti podatka (prodaja, potraživanja,
  obaveze, zalihe).
- **Mesečno:** nadzor dotoka + brif nad tim podacima (Komanda AI).

## 7. Pitanja za predavače

1. Gmail trigger i veliki prilozi: gde je granica i da li je bolje prebaciti se
   na IMAP ili Mailgun inbound webhook u n8n-u?
2. Kako u n8n-u najčistije uraditi **idempotentnost**? Ako isti mejl dođe dva puta,
   ne sme duplo da se upiše. Ideja: ključ = `Message-ID` + hash priloga, proveren u dnevniku.
3. Error workflow u n8n-u: kako da i **pad samog n8n-a** (a ne samo loš fajl)
   završi u upozorenju? Straža tišine delimično to pokriva, jer ne zavisi od toka A.
4. Čuvanje kredencijala klijenata u n8n-u kada ih bude više: jedna instanca po
   klijentu ili jedna zajednička? Komanda AI čuva tajne u Supabase Vault-u, pa n8n
   treba da ostane „bez pamćenja".
5. Da li Composio ima smisla za ERP-ove sa ovog tržišta (MIS, Pantheon), ili je
   mejl/izvoz realno jedini put u prvoj godini?

## 8. Šta posle radionice (veza sa kodom)

- Tok A u produkciji već postoji: `src/core/mail/*` + `/api/nadzor/posta/mailgun`
  (SPF/DKIM, spisak pošiljalaca, jedna adresa = jedna vrsta podatka, dnevnik).
- Tok B postoji kao `src/core/import/cadence.ts` + `/api/nadzor/ritam`, sa
  presudama *kasni / ne stiže / nikad nije stiglo*.
- n8n ostaje **opcioni izvršni motor iza našeg API-ja** (`docs/01-arhitektura.md` §9).
  Ovaj workflow je prototip i prodajni alat, ne zamena za platformu.
- Otvoreno pitanje br. 5 i 6 iz `docs/00-otvorena-pitanja.md` („read-only nalog
  ili izvoz?", „postoji li n8n instanca?") dobija predlog odgovora: **izvoz
  mejlom prvi, agent tek kada fajl ne sme da napusti mrežu.**
