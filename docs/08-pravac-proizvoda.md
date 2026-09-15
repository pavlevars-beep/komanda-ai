# Pravac proizvoda

Ovaj dokument je merilo za odluku „da li ovo uopšte gradimo". Kada je odgovor
sporan, presuđuje jedno pitanje:

> Da li ovo pomaže rukovodiocu da razume šta traži pažnju i da brže donese
> ispravnu odluku?

Ako ne pomaže, verovatno ne pripada jezgru proizvoda.

## Šta proizvod jeste

Sloj upravljačke inteligencije IZNAD postojećih sistema klijenta. ERP ostaje
sistem zapisa; mi ga ne zamenjujemo i ne gradimo ponovo.

```
ERP / računovodstvo / prodaja / nabavka / zalihe / e-pošta / CRM
        ↓
sloj integracije (konektori)
        ↓
poslovna pravila + istorijski kontekst + analiza
        ↓
upravljački interfejs
        ↓
uvidi · upozorenja · pitanja · radnje
```

Lanac vrednosti je: **PODATAK → KONTEKST → UVID → UPOZORENJE → PREPORUKA →
RADNJA**.

## Šta proizvod NIJE

- Nije ERP. Ne gradimo računovodstvo, obračun zarada, fakturisanje, magacinsko
  poslovanje, HRIS ni pun CRM.
- Nije BI tabla sa dvadeset grafikona. Rukovodilac ne treba da pregleda sve.
- Nije ćaskalica. Pitanja su JEDAN od interfejsa, ne proizvod.

## Vodeće načelo prikaza

**Normalno ćuti. Izuzetak traži pažnju.**

Početna strana je jutarnji brif, ne tabla. Cilj je da za 60 sekundi u 8h
direktor zna: šta se juče desilo, šta se promenilo, gde je novac zarobljen,
šta postaje rizično, šta je neuobičajeno i šta danas traži pažnju.

## Pravila koja se ne pregovaraju

1. **Činjenica se ne meša sa tumačenjem.** Broj iz baze, zapažanje izvedeno
   računom, tumačenje modela i preporuka su četiri različite stvari i tako se
   i označavaju.
2. **Svaki važan broj nosi poreklo.** Izvor, skup podataka, period i vreme
   poslednje sinhronizacije.
3. **Zastareo ili nepotpun podatak se ne prikazuje kao pouzdan.** Stanja
   `dostupno / nepotpuno / zastarelo / integracija nedostupna / moguća anomalija`.
4. **Radnja sa posledicom traži potvrdu čoveka.** Čitanje je podrazumevano;
   upis se dodaje samo uz jasnu potrebu, ovlašćenje i trag.
5. **Model nikad ne sastavlja upit nad bazom klijenta.** Bira između imenovanih
   sposobnosti konektora.
6. **Prag i definicija su konfiguracija, ne kod.** Šta je „dospelo", šta je
   „kritična zaliha", koji period je uporedni — svaka firma odgovara drugačije.
7. **Ništa se ne vezuje za jedan ERP.** Konektor mora da bude zamenljiv bez
   prepisivanja upravljačkog sloja.

## Uloge

Ne prikazuje se svima isto. Direktor, prodaja, nabavka i finansije imaju
različite brifove, sa konfigurabilnim pravima.

## Šta već postoji

| Zahtev | Stanje |
|---|---|
| Izolacija klijenata, RLS, revizija | postoji |
| Uloge i prava | postoji |
| Konektor kao apstrakcija, registar | postoji |
| Imenovane sposobnosti umesto upita | postoji |
| Poreklo i svežina uz svaki broj | postoji |
| Klasifikacija činjenica/izračunato/tumačenje/prognoza | postoji |
| Pitanja sa strukturiranim odgovorom | postoji |
| Brendiranje, logotip, tema, jezik | postoji |
| Sistemske poruke rolama | postoji |
| Beleške | postoji |

## Šta nedostaje, po prioritetu

**P0**

1. Jutarnji brif kao početna strana
2. Pregled prodaje sa poređenjima (juče / 7 dana / mesec / uporedni period)
3. Starosna struktura potraživanja i najveći dužnici
4. Zalihe kao POKRIVENOST, ne kao stanje
5. Odeljak „zahteva pažnju"
6. Predložena sledeća radnja uz odgovor
7. Brif po ulozi

**P1**

8. Istorijska poređenja (mesec, godina, YTD, višegodišnji trend)
9. Poslovni kontekstni događaji
10. Pravila upozorenja po klijentu
11. Prolaz u dubinu sa brifa
12. Konfigurabilan brif po korisniku
13. Trag radnji nad preporukama

**P2 — tek posle stvarnog pristupa ERP-u**

14. MIS konektor i produkciona sinhronizacija
15. Integracije radnji
16. Nabavna inteligencija
17. Ozbiljnija prognoza (sezonalnost, potražnja, anomalije)

## Otvorena pitanja koja se NE izmišljaju

Za Euro Profil još nije utvrđeno: šta MIS može da izloži, postoji li zvanični
API i šta nudi, da li je moguć pristup bazi samo za čitanje, šta već pokriva
Beyond 360, koji izvozi postoje, model autentikacije, dostupnost istorije,
tačna struktura prodaje, potraživanja, obaveza i zaliha, dostupnost rokova
isporuke dobavljača, postojeća struktura korisnika i rola, postojeći BI,
tražena učestalost osvežavanja, način hostovanja i bezbednosni zahtevi, i koje
radnje smemo da izvršavamo.

Do odgovora proizvod radi nad demo podacima, vidljivo označenim kao demo.

## Zašto odobrenja još ne postoje kao ekran

Odobrenja postoje da bi radnja u tuđem poslovnom sistemu prošla kroz čoveka.
Nijedna uključena sposobnost trenutno ne menja podatke — sve su samo za
čitanje — pa nema šta da se odobrava.

Ekran koji bi zauvek prikazivao prazan spisak bio bi upravo ono što ovaj
proizvod ne sme da radi: nešto što izgleda kao funkcija a nije. Stavka u
navigaciji zato ostaje vidljivo označena kao nedostupna, i otvara se kada prva
EXECUTE sposobnost bude uključena za nekog klijenta.

Isto važi i za zakazano slanje izveštaja na e-poštu. Raspored bez stvarnog
izvora podataka je mehanizam koji uredno šalje prazne dokumente. Izveštaj se
za sada pravi na zahtev, kao presek stanja za štampu.

## O prognozi

Ne gradi se složena predikcija pre nego što osnovni računi budu tačni.
Redosled je: determinističko računanje i istorijska poređenja → sezonalnost i
otkrivanje anomalija → ozbiljnija prognoza tamo gde je poslovno opravdana.
Tačan podatak je vredniji od pametnog modela.

## Tišina je kvar, i mora da bude glasna

Najopasniji kvar u ovom proizvodu nije pogrešan broj nego IZOSTANAK podatka.
Kada tabela ne stigne, ništa ne pukne: sistem nastavlja da radi i prikazuje
jučerašnje brojeve kao današnje. Nema poruke o grešci jer greške nema —
postoji samo tišina, a tišina se ne primeti dok neko ne donese odluku na
osnovu podatka od pre nedelju dana.

Zato se očekivanje zapisuje UNAPRED, po vrsti podatka: koji dani, do kog
lokalnog vremena, uz koliku toleranciju. Bez zapisanog dogovora sistem nema
prema čemu da izmeri tišinu i mora da je prećuti.

Mera se razlikuje na tri načina, jer traže tri različita razgovora:

- **kasni** — jedan propušten rok; izvoz verovatno nije pokrenut,
- **ne stiže** — dva ili više uzastopnih; brojevima se više ne veruje,
- **nikad nije stiglo** — dotok nije ni uspostavljen, pa se proverava
  podešavanje, ne kvar.

Provera radi na DVA mesta, namerno. Zakazani prolaz podiže upozorenje i kada
niko ne gleda, da konsultant zna pre klijenta. Nezavisno od njega, klijentov
početni ekran ocenjuje isto pri svakom otvaranju, pa onaj ko GLEDA nikad ne
vidi zastareo broj bez oznake — čak ni kada je zakazani posao stao.

Uredni tokovi se ne prikazuju. Traka koja svakog dana javlja da je sve u redu
nauči korisnika da je preskače, pa je ne pročita ni onog dana kada piše
suprotno.

## Kako podatak stiže sa računara u firmi

Fajl na računaru u firmi nema adresu sa interneta. To nije ograničenje ovog
proizvoda nego definicija privatne mreže: ili nešto sa njihove strane gura
fajl ka nama, ili fajl stoji na mestu koje obe strane vide.

Redosled po tome koliko dugo izdrži bez ljudske pažnje:

1. **Pošta na namensku adresu** — skoro svaki ERP ume da zakaže izveštaj i
   pošalje ga mejlom. Podesi se jednom, ništa se ne instalira, ništa ne mora
   da bude ulogovano. Jedini put koji potpuno izbacuje čoveka iz svakodnevnog
   kruga.
2. **Deljeni folder u oblaku** — dobro kada izveštaj pravi čovek, jer mu se
   menja samo odredište, ne navika. Zavisi od toga da sinhronizacija radi i da
   nalog ostane ulogovan.
3. **Mali agent na računaru** — zakazani zadatak koji šalje HTTPS-om, samo
   odlazni saobraćaj. Za slučaj kada fajl ne sme da napusti mrežu; cena je da
   ga mi održavamo i da umire pri reinstalaciji računara.
4. **SFTP, mrežni deo, VPN** — traži posao njihovog IT-a i rupu u firewall-u.

Nijedan od njih nije stabilan kao pravi ERP konektor, jer svi zavise od toga
da neko drugi svaki dan uradi svoj deo. Uvoz tabele je MOST, ne odredište —
zato `readImported` i postoji kao port: kada ERP stigne, tabla, brif i pitanja
se ne diraju.

## Prijem poštom: šta je gotovo, a šta traži odluku

Pošta je izabrana kao glavni put jer jedina potpuno izbacuje čoveka iz
svakodnevnog kruga: ERP zakaže izveštaj, pošalje ga na namensku adresu, i niko
ništa ne otprema.

Adresa je oblika `uvoz+<token>@domen`. Plus-adresiranje znači da jedno stvarno
sanduče nosi koliko god adresa, bez otvaranja naloga po klijentu.

**Adresa nije lozinka.** Token stoji u podešavanjima tuđeg ERP-a, prolazi kroz
njihove logove i kroz svaki mejl server na putu. Zato adresa kaže samo KOJI
izvor se puni, a da li se sme puniti odlučuju dve stvari:

1. **Spisak dozvoljenih pošiljalaca.** Prazan spisak ne propušta nikoga.
   Podrazumevano „primaj od svih" značilo bi da svako ko sazna adresu upisuje
   brojeve u tuđu tablu.
2. **Provera autentičnosti (SPF/DKIM).** Adresa pošiljaoca se trivijalno
   lažira; spisak dozvoljenih bez ove provere je zaključana brava na otvorenim
   vratima. Nepoznat rezultat se broji kao neuspeh, ne kao prolaz.

**Jedna adresa prima jednu vrstu podatka.** Zbog toga dve tabele u istoj poruci
smeju da se ODBIJU umesto da se pogađa koja je koja. Izbor „ona veća" ili „ona
prva" jednog dana promaši, i tada prodaja bude upisana kao zalihe bez ijedne
poruke o grešci.

**Pošta puni tek pošto je jedan uvoz urađen ručno.** Pri ručnom uvozu kolone
potvrđuje čovek. Ovde nema nikoga, pa pogođeno mapiranje niko ne bi proverio — a
pogrešno pogođena kolona se ne vidi kao greška nego kao pogrešan broj, mesecima.
Isto važi kada se zaglavlje promeni i kolona nestane: prijem staje i traži
ručnu potvrdu.

Zapisuje se SVAKA poruka, i primljena i odbijena, sa razlogom. Bez dnevnika
odbijena poruka nestaje bez traga: klijent tvrdi da je poslao, sistem tvrdi da
nije stiglo, i niko ne može da proveri ko je u pravu.

### Šta ostaje

**Dobavljač pošte nije izabran.** Ruta prima NORMALIZOVAN oblik poruke, namerno
naš a ne nečiji: adapter koji prevodi Postmark, Mailgun ili SendGrid u taj
oblik je nekoliko redova, dok bi vezivanje celog toka za jedan oblik značilo da
se promena dobavljača plaća prepisivanjem prijema.

Dok `MAIL_DOMAIN` i `MAIL_WEBHOOK_SECRET` nisu podešeni, konzola adresu
prikazuje kao NEAKTIVNU i to piše. Adresa koja izgleda spremno a ne može da
primi poruku je tačno ono što ovaj proizvod ne sme.

**Granica veličine priloga je oko 3 MB**, i nije izabrana po tome koliko tabela
ume da bude velika nego po tome koliko telo zahteva prolazi kroz platformu:
base64 uveća sadržaj za trećinu, a serverless funkcija odbija telo preko ~4,5
MB. `.xlsx` je sažet i praktično uvek staje; veliki `.csv` ne mora. Kada to
postane usko grlo, sledeći korak je da dobavljač čuva prilog i pošalje URL, a
mi ga dovučemo kroz postojeću zaštitu od SSRF-a.
