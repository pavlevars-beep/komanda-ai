import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tip klijenta baze koji repozitorijumi primaju kao parametar.
 *
 * Repozitorijumi namerno ne prave klijenta sami — dobijaju ga. Zbog toga se
 * domenski sloj testira bez podizanja Supabase-a, i zbog toga nijedan
 * repozitorijum ne može da se "prišunja" do admin klijenta.
 */
export type Db = SupabaseClient

/**
 * Napomena o tipovima šeme: čim projekat na Supabase-u postoji, `npm run
 * db:types` generiše `types.generated.ts` i on postaje izvor istine.
 *
 * Do tada — a i posle toga — redovi iz baze se na granici repozitorijuma
 * proveravaju Zod šemom. Generisani tipovi važe u vreme kompajliranja i ćute
 * kada se šema promeni pod nogama; Zod provera pukne odmah i glasno.
 */
