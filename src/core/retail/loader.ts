import type { Db } from '@/server/db/types'
import type { OrgContext } from '../tenancy/org-context'
import { connectorContext, getConnector, runCapability } from '../connectors'
import { listEnabledCapabilities } from '../integrations/repository'
import { freshnessState } from '../shared/freshness'
import type { Block, BlockUnavailable } from '../brief/loader'
import { retailNetworkSchema, type RetailNetwork } from './network'

/**
 * Učitavanje prodajne mreže.
 *
 * Ide kroz ISTI runner i istu sposobnost kao i sve ostalo. Poseban put do
 * podataka bi značio da isti promet na karti i na tabli jednog dana ispadne
 * različit — a to je prva stvar koju vlasnik primeti i poslednja u koju posle
 * poveruje.
 *
 * Mreža koja se ne učita NE prikazuje praznu kartu sa nulama. Nula prometa i
 * „ne mogu da pročitam" su različite vesti.
 *
 * Nedostupnost nosi RAZLOG, isti skup koji koristi i brif. „Nije uključeno",
 * „nemate pravo" i „izvor ne odgovara" traže tri različite radnje od čoveka,
 * pa jedna zajednička poruka nikome ne pomaže.
 */

const TIMEOUT_MS = 8_000

export type NetworkBlock = Block<RetailNetwork>

export async function loadRetailNetwork(
  db: Db,
  ctx: OrgContext,
  integrationId: string | null,
  connectorType: string | null,
  now: Date = new Date(),
): Promise<NetworkBlock> {
  if (!integrationId || !connectorType) return { unavailable: 'no_integration' }

  const connector = getConnector(connectorType)
  if (!connector) return { unavailable: 'connector_missing' }

  const enabled = await listEnabledCapabilities(db, ctx.organizationId, integrationId)
  if (!enabled.ok) return { unavailable: 'integration_down' }

  const result = await runCapability({
    connector,
    capabilityKey: 'get_retail_network',
    input: {},
    // Isti prelaz kao u tabli: `requiredPermission` iz baze je niska, a runner
    // traži zatvoreni skup. Sam runner je taj koji vrednost proverava.
    enabled: enabled.value.map((c) => ({
      capabilityKey: c.capabilityKey,
      mode: c.mode,
      requiredPermission: c.requiredPermission as never,
    })),
    timeoutMs: TIMEOUT_MS,
    ctx: connectorContext({ db, ctx, integrationId }),
  })

  if (!result.ok) {
    const unavailable: BlockUnavailable =
      result.error.code === 'forbidden'
        ? 'no_permission'
        : result.error.code === 'capability_disabled'
          ? 'capability_disabled'
          : 'integration_down'
    return { unavailable }
  }

  // Oblik se proverava i posle konektora, ne samo u njemu: konektor može da se
  // promeni, a ekran ne sme da padne na polju koje je nestalo.
  const parsed = retailNetworkSchema.safeParse(result.value.data)
  if (!parsed.success) return { unavailable: 'unreadable' }

  return {
    data: parsed.data,
    provenance: result.value.provenance,
    freshness: freshnessState(result.value.provenance.freshness, now),
  }
}
