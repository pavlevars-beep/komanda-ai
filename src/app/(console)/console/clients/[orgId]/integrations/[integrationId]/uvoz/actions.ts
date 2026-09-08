'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid } from '@/core/shared/uuid'
import { consoleAction, type ActionResultBase } from '@/server/http/with-action'
import { formString } from '@/server/http/form'
import { redact } from '@/server/logger'
import { readTable, ImportError, MAX_ROWS } from '@/core/import/table'
import {
  DATASET_KINDS,
  FIELDS,
  suggestMapping,
  validateMapping,
  type ColumnMapping,
  type DatasetKind,
} from '@/core/import/mapping'
import { normalizeRows } from '@/core/import/normalize'
import { saveDataset } from '@/core/import/repository'

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
  }
}

export interface ImportState extends ActionResultBase {
  readonly imported?: { readonly rows: number; readonly problems: number }
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
  async (_ctx, _prev, formData) => {
    const kind = formString(formData, 'kind')
    if (!isKind(kind)) return { error: 'error.invalid_input' }

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'import.error.empty' }
    if (file.size > MAX_FILE_BYTES) return { error: 'import.error.tooLarge' }

    const bytes = Buffer.from(await file.arrayBuffer())

    try {
      const table = readTable(bytes)
      const dataRows = Math.max(0, table.rows.length - 1)
      if (dataRows > MAX_ROWS) return { error: 'import.error.tooManyRows' }

      return {
        analysis: {
          kind,
          headers: table.headers,
          // Pet redova je dovoljno da se vidi da li su kolone pogođene, a ne
          // toliko da se prikaz pretvori u pregled cele tabele.
          preview: table.rows.slice(1, 6),
          rowCount: dataRows,
          mapping: suggestMapping(table.headers, kind),
          payload: bytes.toString('base64'),
          fileName: file.name,
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
    })

    if (!saved.ok) {
      return {
        error: saved.error.key,
        ...(saved.error.detail ? { detail: String(redact(saved.error.detail)) } : {}),
      }
    }

    revalidatePath(`/console/clients/${organizationId}/integrations/${integrationId}/uvoz`)
    return { imported: { rows: normalized.rows.length, problems: normalized.problems.length } }
  },
)
