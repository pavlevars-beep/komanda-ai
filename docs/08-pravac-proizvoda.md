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

## O prognozi

Ne gradi se složena predikcija pre nego što osnovni računi budu tačni.
Redosled je: determinističko računanje i istorijska poređenja → sezonalnost i
otkrivanje anomalija → ozbiljnija prognoza tamo gde je poslovno opravdana.
Tačan podatak je vredniji od pametnog modela.
