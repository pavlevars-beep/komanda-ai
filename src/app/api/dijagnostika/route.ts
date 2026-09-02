import { NextResponse } from 'next/server'
import { userDb } from '@/server/db/user-client'
import { currentUser } from '@/server/auth/current-user'
import { requestLocale } from '@/server/http/locale'
import { redact } from '@/server/logger'
import {
  listConsoleClients,
  listMyOpenAccessSessions,
} from '@/core/organizations/console-repository'
import { listClientOrganizations } from '@/core/organizations/repository'
import ConsoleLayout from '@/app/(console)/console/layout'
import ConsoleOverview from '@/app/(console)/console/page'

/**
 * Dijagnostika konzole.
 *
 * Postoji zbog konkretnog kvara: konzola je pucala uz praznu 500 stranicu, a
 * jedini trag bila je oznaka greške čije se značenje vidi samo u logovima
 * hostinga. Ovo pokreće iste korake koje konzola izvršava pri učitavanju i
 * kaže KOJI je pao — bez kopanja po logovima.
 *
 * Dostupno isključivo aktivnom Delta Pro osoblju; svima ostalima 404, isto
 * kao i konzola, jer postojanje interne rute nije informacija koju delimo.
 *
 * Poruke prolaze kroz `redact`, istu funkciju koju koristi logger, pa iz
 * odgovora ne može da izađe ključ ni connection string.
 */

interface StepResult {
  readonly korak: string
  readonly ok: boolean
  readonly detalj?: unknown
}

async function step(korak: string, run: () => Promise<unknown>): Promise<StepResult> {
  try {
    const value = await run()
    return { korak, ok: true, detalj: value }
  } catch (cause) {
    // Baca se izuzetak — upravo ono što obara render, a što Result ne hvata.
    return { korak, ok: false, detalj: redact(cause) }
  }
}

export async function GET(): Promise<NextResponse> {
  const db = await userDb()
  const user = await currentUser(db)

  if (!user?.staffRole) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const steps: StepResult[] = []

  steps.push(
    await step('jezik zahteva', async () => await requestLocale(user.locale)),
  )
  steps.push(
    await step('otvorene sesije pristupa', async () => {
      const r = await listMyOpenAccessSessions(db)
      return r.ok ? { broj: r.value.length } : { greska: r.error }
    }),
  )
  steps.push(
    await step('organizacije klijenata', async () => {
      const r = await listClientOrganizations(db)
      return r.ok ? { broj: r.value.length } : { greska: r.error }
    }),
  )
  steps.push(
    await step('lista klijenata (RPC)', async () => {
      const r = await listConsoleClients(db)
      return r.ok ? { broj: r.value.length } : { greska: r.error }
    }),
  )

  // Podaci prolaze, a konzola i dalje puca — znači izuzetak je u iscrtavanju.
  // Serverske komponente su obične async funkcije, pa se mogu pozvati i ovde:
  // telo se izvrši i stablo elemenata se sastavi, što hvata većinu izuzetaka.
  steps.push(
    await step('render: stranica pregleda', async () => {
      await ConsoleOverview()
      return 'sastavljeno'
    }),
  )
  steps.push(
    await step('render: layout konzole', async () => {
      await ConsoleLayout({ children: null })
      return 'sastavljeno'
    }),
  )

  return NextResponse.json(
    {
      korisnik: { osoblje: user.staffRole, jezikProfila: user.locale },
      koraci: steps,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
