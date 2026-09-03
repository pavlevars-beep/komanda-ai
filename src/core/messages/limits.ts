/**
 * Granice poruke, odvojene od repozitorijuma.
 *
 * Isti razlog kao kod beleški: obrazac ih koristi za `maxLength`, a uvoz iz
 * repozitorijuma bi povukao Zod i klijenta baze u bundle pregledača.
 */
export const MESSAGE_TITLE_MAX = 120
export const MESSAGE_BODY_MAX = 1000
