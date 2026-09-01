import type { Connector } from '../connectors/types'
import type { Integration } from './repository'

/**
 * Sposobnosti koje konektor deklariše za konkretnu integraciju.
 *
 * Isti izvor koristi i konzola (da bi znala šta ponuditi) i runner (da bi znao
 * šta sme da pozove). Da su dva izvora, u konzoli bi se pojavio prekidač za
 * nešto što runner odbija — dugme koje izgleda kao da radi.
 *
 * REST konektor spisak izvodi iz konfiguracije integracije, ostali iz tipa;
 * ta razlika je razlog zbog kojeg ova funkcija prima celu integraciju.
 */
export interface DeclaredCapability {
  readonly key: string
  readonly mode: 'read' | 'prepare' | 'execute'
  readonly requiredPermission: string
  readonly classification: string
}

export function declaredCapabilities(
  connector: Connector,
  integration: Integration,
  userId: string,
): DeclaredCapability[] {
  const descriptors = connector.getConfiguredCapabilities
    ? connector.getConfiguredCapabilities({
        organizationId: integration.organization_id,
        integrationId: integration.id,
        userId,
        // Spisak sposobnosti ne sme da zavisi od permisija onoga ko gleda:
        // konsultant treba da vidi i ono što sam ne bi smeo da pozove, jer
        // uključuje sposobnost za korisnike klijenta, ne za sebe.
        permissions: [],
        requestId: 'capability-listing',
        environment: integration.environment,
        isDemo: integration.is_demo,
        config: integration.config,
        // Spisak se izvodi iz konfiguracije; tajna se za to ne dira.
        secret: () => Promise.resolve(null),
      })
    : connector.getCapabilities()

  return descriptors.map((d) => ({
    key: d.key,
    mode: d.mode,
    requiredPermission: d.requiredPermission,
    classification: d.classification,
  }))
}
