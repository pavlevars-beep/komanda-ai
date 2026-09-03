import type { Db } from '@/server/db/types'
import { err, ok, domainError, type Result } from '../shared/result'
import { LOGO_MAX_BYTES } from './limits'

/**
 * Otpremanje logotipa klijenta.
 *
 * Fajl ide u javnu kofu `branding`, u fasciklu nazvanu po organizaciji. Prvi
 * segment putanje NIJE samo raspored — na njemu stoji politika koja upis
 * ograničava na organizacije koje pozivalac administrira.
 *
 * Adresa se upisuje u `organization_branding.logo_url` tek kada otpremanje
 * uspe. Obrnut redosled bi ostavio adresu koja pokazuje u prazno kada
 * otpremanje padne — a slomljena slika izgleda kao kvar proizvoda.
 */

const BUCKET = 'branding'

/** Isti spisak stoji i na kofi; ovde je da bi poruka bila razumljiva. */
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
])

export { LOGO_MAX_BYTES } from './limits'

export function describeAllowedTypes(): string {
  return [...ALLOWED.keys()].join(', ')
}

export interface UploadedLogo {
  readonly url: string
  readonly path: string
}

export async function uploadLogo(
  db: Db,
  organizationId: string,
  file: File,
): Promise<Result<UploadedLogo>> {
  if (file.size === 0) return err(domainError('invalid_input', 'branding.error.logoEmpty'))
  if (file.size > LOGO_MAX_BYTES) {
    return err(domainError('invalid_input', 'branding.error.logoTooBig'))
  }

  const extension = ALLOWED.get(file.type)
  if (!extension) return err(domainError('invalid_input', 'branding.error.logoType'))

  /*
   * Naziv fajla se NE preuzima od korisnika.
   *
   * Ime iz obrasca može da sadrži `../`, tuđi identifikator organizacije ili
   * beskrajno dug niz znakova. Ovde se sastavlja od poznatog identifikatora i
   * poznate ekstenzije, pa ništa iz zahteva ne učestvuje u putanji.
   *
   * Vremenska oznaka je tu zbog keša: prepisan fajl na istoj adresi ostaje u
   * kešu pregledača i CDN-a, pa bi klijent posle promene i dalje gledao stari
   * logotip i mislio da nije sačuvano.
   */
  const path = `${organizationId}/logo-${Date.now()}.${extension}`

  const { error } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  })

  if (error) {
    return err(domainError('forbidden', 'branding.error.logoUpload', { detail: error.message }))
  }

  const { data } = db.storage.from(BUCKET).getPublicUrl(path)

  const { error: saveError } = await db
    .from('organization_branding')
    .upsert(
      { organization_id: organizationId, logo_url: data.publicUrl },
      { onConflict: 'organization_id' },
    )

  if (saveError) {
    // Fajl je otpremljen ali adresa nije sačuvana. Fajl se uklanja, da u kofi
    // ne ostaju siročići koje niko ne referiše i niko ne zna da obriše.
    await db.storage.from(BUCKET).remove([path])
    return err(
      domainError('internal', 'branding.error.logoUpload', { detail: saveError.message }),
    )
  }

  return ok({ url: data.publicUrl, path })
}

/** Uklanja adresu iz brendiranja. Fajl ostaje u kofi — brisanje je zaseban korak. */
export async function clearLogo(db: Db, organizationId: string): Promise<Result<true>> {
  const { error } = await db
    .from('organization_branding')
    .upsert({ organization_id: organizationId, logo_url: null }, { onConflict: 'organization_id' })

  if (error) {
    return err(domainError('forbidden', 'branding.error.logoUpload', { detail: error.message }))
  }
  return ok(true)
}
