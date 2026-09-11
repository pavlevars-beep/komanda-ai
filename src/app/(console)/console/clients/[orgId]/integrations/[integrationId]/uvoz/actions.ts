'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/core/shared/uuid'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString, formStringOrNull } from '@/server/http/form'
import { redact } from '@/server/logger'
import { readTable, ImportError, MAX_ROWS } from '@/core/import/table'
import {
  DATASET_KINDS,
  FIELDS,
  applyRememberedMapping,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
  type DatasetKind,
} from '@/core/import/mapping'
import { normalizeRows } from '@/core/import/normalize'
import {
  contentHash,
  findActiveByHash,
  getStoredMapping,
  recordResubmission,
  rememberMapping,
  saveDataset,
} from '@/core/import/repository'
import { deleteExpectation, saveExpectation } from '@/core/import/expectations'

/** 25 MB; ista granica stoji i na kofi. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

export interface AnalyzeState extends ActionResultBase {
  readonly analysis?: {
    readonly kind: DatasetKind
    readonly headers: readonly string[]
    readonly preview: readonly (readonly string[])[]
    readonly rowCount: number
    readonly mapping: ColumnMapping
    /** Sadržaj fajla, base64, da drugi korak ne traži ponovno otpremanje. */
    readonly payload: string
    readonly fileName: string
    /** Odakle mapiranje dolazi: predlog sistema ili zapamćena potvrda. */
    readonly source: 'suggested' | 'remembered'
    /** Kolone koje su nestale iz zaglavlja — traže odluku čoveka. */
    readonly missing: readonly string[]
    /** Kolone koje su se premestile; mapiranje je već ispravljeno po nazivu. */
    readonly moved: readonly string[]
    readonly added: readonly string[]
  }
}

export interface ImportState extends ActionResultBase {
  readonly imported?: { readonly rows: number; readonly problems: number }
  /** Ista tabela je već u upotrebi — nije greška, ali nije ni nov podatak. */
  readonly duplicate?: { readonly fileName: string; readonly importedAt: string }
}

function isKind(value: unknown): value is DatasetKind {
  return typeof value === 'string' && (DATASET_KINDS as readonly string[]).includes(value)
}

/**
 * Prvi korak: pročitaj zaglavlje i predloži mapiranje.
 *
 * Fajl se u ovom koraku NE upisuje nigde. Konsultant prvo vidi šta je sistem
 * prepoznao i tek onda potvrđuje — uvoz koji upiše pa pita bi ostavljao
 * polovične skupove pri svakom odustajanju.
 */
export const analyzeFileAction = consoleAction<AnalyzeState>(
  { rateLimit: 'write', audit: 'integration.updated' },
  async ({ db }, _prev, formData) => {
    const kind = formString(formData, 'kind')
    if (!isKind(kind)) return { error: 'error.invalid_input' }

    const organizationId = uuid().safeParse(formString(formData, 'organizationId'))
    const integrationId = uuid().safeParse(formString(formData, 'integrationId'))
    if (!organizationId.success || !integrationId.success) return { error: 'error.invalid_input' }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'import.error.empty' }
    if (file.size > MAX_FILE_BYTES) return { error: 'import.error.tooLarge' }

    const bytes = Buffer.from(await file.arrayBuffer())

    try {
      const table = readTable(bytes)
      const dataRows = Math.max(0, table.rows.length - 1)
      if (dataRows > MAX_ROWS) return { error: 'import.error.tooManyRows' }

      /*
       * Zapamćeno mapiranje ima PREDNOST nad pogađanjem.
       *
       * Pogađanje po nazivu kolone je dobro za prvi put, ali se od izvoza do
       * izvoza ume da razreši drugačije — a isti fajl mora svaki put da se
       * pročita isto. Kada je čovek jednom potvrdio kolone, to je odluka, ne
       * pretpostavka, i sistem je ne preispituje sam.
       */
      const stored = await getStoredMapping(
        db,
        organizationId.data,
        integrationId.data,
        kind,
      )

      const remembered = stored
        ? applyRememberedMapping(stored.mapping, stored.headers, table.headers)
        : null

      return {
        analysis: {
          kind,
          headers: table.headers,
          // Pet redova je dovoljno da se vidi da li su kolone pogođene, a ne
          // toliko da se prikaz pretvori u pregled cele tabele.
          preview: table.rows.slice(1, 6),
          rowCount: dataRows,
          mapping: remembered ? remembered.mapping : suggestMapping(table.headers, kind),
          payload: bytes.toString('base64'),
          fileName: file.name,
          source: remembered ? 'remembered' : 'suggested',
          missing: remembered ? remembered.missing : [],
          moved: remembered ? remembered.moved : [],
          added: remembered && remembered.headersChanged ? remembered.added : [],
        },
      }
    } catch (cause) {
      return { error: cause instanceof ImportError ? cause.key : 'import.error.unreadable' }
    }
  },
)

const confirmInput = z.object({
  organizationId: uuid(),
  integrationId: uuid(),
  kind: z.enum(DATASET_KINDS),
  fileName: z.string().min(1).max(200),
  payload: z.string().min(1),
})

/**
 * Drugi korak: potvrđeno mapiranje, čitanje i upis.
 *
 * Mapiranje stiže iz obrasca, pa se PONOVO proverava. Prvi korak ga je samo
 * predložio; ono što se stvarno upisuje mora da prođe istu proveru bez obzira
 * odakle je došlo.
 */
export const importFileAction = consoleAction<ImportState>(
  { rateLimit: 'write', audit: 'integration.updated' },
  async ({ db, user }, _prev, formData) => {
    const parsed = confirmInput.safeParse({
      organizationId: formString(formData, 'organizationId'),
      integrationId: formString(formData, 'integrationId'),
      kind: formString(formData, 'kind'),
      fileName: formString(formData, 'fileName'),
      payload: formString(formData, 'payload'),
    })
    if (!parsed.success) return { error: 'error.invalid_input' }

    const { organizationId, integrationId, kind, fileName, payload } = parsed.data

    const bytes = Buffer.from(payload, 'base64')
    if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
      return { error: 'import.error.unreadable' }
    }

    /*
     * ISTI FAJL NIJE NOV PODATAK.
     *
     * Provera ide PRE svega ostalog: bez nje bi ponovno slanje jučerašnje
     * tabele napravilo nov skup i pomerilo vreme podatka, pa bi sve izgledalo
     * sveže iako ništa nije stiglo. To je tiho laganje i gore je od greške —
     * greška se bar vidi.
     */
    const hash = contentHash(bytes)
    const active = await findActiveByHash(db, organizationId, integrationId, kind, hash)
    if (active) {
      await recordResubmission(db, organizationId, active.id, active.seenCount)
      return { duplicate: { fileName: active.fileName, importedAt: active.importedAt } }
    }

    let table
    try {
      table = readTable(bytes)
    } catch (cause) {
      return { error: cause instanceof ImportError ? cause.key : 'import.error.unreadable' }
    }

    // Mapiranje iz obrasca: naziv polja → indeks kolone, ili prazno.
    const mapping: Record<string, number> = {}
    for (const field of FIELDS[kind]) {
      const raw = formString(formData, `map.${field.key}`)
      if (raw === undefined || raw === '') continue
      const index = Number(raw)
      if (Number.isInteger(index)) mapping[field.key] = index
    }

    const problems = validateMapping(mapping, kind, table.headers.length)
    if (problems.length > 0) {
      return {
        error: 'error.invalid_input',
        detail: problems.map((p) => `${p.field}: ${p.key}`).join('; '),
      }
    }

    const normalized = normalizeRows(table.rows, mapping, kind)

    /*
     * Valuta se uzima iz podešavanja organizacije, ne iz tabele.
     *
     * Kolona sa valutom je u izvozima retka, a mešane valute u jednom izvozu
     * još ređe. Podrazumevana valuta firme je tačna pretpostavka u gotovo svim
     * slučajevima, a onaj ostatak bi tražio kolonu koju izvozi nemaju.
     */
    const { data: orgRow } = await db
      .from('organizations')
      .select('default_currency')
      .eq('id', organizationId)
      .maybeSingle()

    const parsedCurrency = z
      .object({ default_currency: z.string().length(3) })
      .safeParse(orgRow)
    const currency = parsedCurrency.success ? parsedCurrency.data.default_currency : 'RSD'

    /*
     * Original se čuva PRE upisa redova.
     *
     * Kada se posle mesec dana ispostavi da je kolona pogrešno mapirana, bez
     * originala se ne može ni proveriti ni ponoviti — a upravo tada se traži.
     */
    const path = `${organizationId}/${integrationId}/${Date.now()}-${kind}`
    const { error: uploadError } = await db.storage.from('imports').upload(path, bytes, {
      contentType: 'application/octet-stream',
      upsert: false,
    })
    if (uploadError) {
      return {
        error: 'import.error.uploadFailed',
        detail: String(redact(uploadError.message)),
      }
    }

    const saved = await saveDataset(db, {
      organizationId,
      integrationId,
      kind,
      filePath: path,
      fileName,
      fileSize: bytes.length,
      mapping,
      currency,
      rows: normalized.rows,
      problems: normalized.problems,
      importedBy: user.id,
      contentHash: hash,
    })

    if (!saved.ok) {
      return {
        error: saved.error.key,
        ...(saved.error.detail ? { detail: String(redact(saved.error.detail)) } : {}),
      }
    }

    /*
     * Mapiranje se pamti TEK sada, i pamti se ono što je čovek potvrdio — ne
     * ono što je sistem predložio. Zapamćen predlog koji niko nije pogledao bi
     * sledeći put prošao bez pitanja, sa greškom u sebi.
     *
     * Neuspeh pamćenja ne ruši uvoz: podaci su već upisani, a mapiranje je
     * pogodnost za sledeći put.
     */
    await rememberMapping(db, {
      organizationId,
      integrationId,
      kind,
      mapping,
      headers: table.headers,
      userId: user.id,
    })

    revalidatePath(`/console/clients/${organizationId}/integrations/${integrationId}/uvoz`)
    return { imported: { rows: normalized.rows.length, problems: normalized.problems.length } }
  },
)

export interface CadenceState extends ActionResultBase {
  readonly saved?: boolean
}

/**
 * Čuvanje dogovorenog ritma.
 *
 * Dani stižu kao više vrednosti pod istim imenom, pa idu kroz `getAll`. Prazan
 * izbor se NE popunjava podrazumevanim danima: tiho ubačena radna nedelja bi
 * značila da konsultant misli da je isključio praćenje, a ono i dalje radi.
 */
export const saveCadence = consoleAction<CadenceState>(
  { audit: 'integration.updated', rateLimit: 'write' },
  async (ctx, _prev, formData) => {
    const organizationId = uuid().safeParse(formString(formData, 'organizationId'))
    const integrationId = uuid().safeParse(formString(formData, 'integrationId'))
    const kind = formString(formData, 'kind')

    if (!organizationId.success || !integrationId.success || !isKind(kind)) {
      return { error: 'error.invalid_input' }
    }

    const weekdays = formData
      .getAll('weekdays')
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)

    const remove = formString(formData, 'remove') === '1'

    if (remove) {
      const removed = await deleteExpectation(
        ctx.db,
        organizationId.data,
        integrationId.data,
        kind,
      )
      if (!removed.ok) return { error: removed.error.key }

      revalidatePath(
        `/console/clients/${organizationId.data}/integrations/${integrationId.data}/uvoz`,
      )
      return { saved: true }
    }

    const grace = Number(formString(formData, 'graceMinutes') ?? '30')

    const saved = await saveExpectation(ctx.db, {
      organizationId: organizationId.data,
      integrationId: integrationId.data,
      kind,
      weekdays,
      byTime: formString(formData, 'byTime') ?? '',
      timeZone: formString(formData, 'timeZone') ?? '',
      graceMinutes: Number.isFinite(grace) ? Math.min(1440, Math.max(0, grace)) : 30,
      pausedUntil: formStringOrNull(formData, 'pausedUntil'),
      enabled: formString(formData, 'enabled') === '1',
      userId: ctx.user.id,
    })

    if (!saved.ok) {
      return {
        error: saved.error.key,
        ...(saved.error.detail ? { detail: String(redact(saved.error.detail)) } : {}),
      }
    }

    revalidatePath(
      `/console/clients/${organizationId.data}/integrations/${integrationId.data}/uvoz`,
    )
    return { saved: true }
  },
)
