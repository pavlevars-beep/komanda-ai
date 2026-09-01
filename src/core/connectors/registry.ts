import type { Connector, ConnectorTypeKey } from './types'

/**
 * Registar konektora.
 *
 * Konektor koji nije registrovan ne postoji za sistem — nema načina da se
 * pozove „ad hoc" implementacija. Registracija se dešava na jednom mestu, pa
 * je lista onoga što proizvod stvarno ume uvek očigledna.
 */

const registry = new Map<ConnectorTypeKey, Connector>()

export function registerConnector(connector: Connector): void {
  if (registry.has(connector.type)) {
    throw new Error(`Konektor "${connector.type}" je već registrovan.`)
  }
  registry.set(connector.type, connector)
}

export function getConnector(type: string): Connector | undefined {
  return registry.get(type as ConnectorTypeKey)
}

export function registeredConnectorTypes(): ConnectorTypeKey[] {
  return [...registry.keys()].sort()
}

/** Samo za testove. */
export function clearRegistry(): void {
  registry.clear()
}
