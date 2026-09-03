/**
 * Granice beleške, odvojene od repozitorijuma.
 *
 * Stoje u sopstvenom modulu zato što ih koristi i klijentska komponenta (za
 * `maxLength` na polju). Uvoz iz repozitorijuma je povlačio Zod i klijenta
 * baze u bundle pregledača — stranica beleški je bila dvadeset puta veća od
 * ostalih, a razlog se nije video nigde osim u ispisu veličina.
 */
export const NOTE_MAX_LENGTH = 2000
