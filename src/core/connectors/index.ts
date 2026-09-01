import { registerConnector, registeredConnectorTypes } from './registry'
import { demoConnector } from './impl/demo'
import { restConnector } from './impl/rest'
import { webhookConnector } from './impl/webhook'

/**
 * Registracija konektora na jednom mestu.
 *
 * Ovaj spisak je odgovor na pitanje „šta proizvod stvarno ume danas".
 * Konektori koji su u katalogu označeni kao `planned` ovde se namerno ne
 * pojavljuju — dok nisu implementirani, ne smeju da se mogu pozvati.
 */

let initialised = false

export function initialiseConnectors(): void {
  if (initialised) return
  initialised = true

  registerConnector(demoConnector)
  registerConnector(restConnector)
  registerConnector(webhookConnector)
}

export function availableConnectorTypes(): string[] {
  initialiseConnectors()
  return registeredConnectorTypes()
}

export { getConnector } from './registry'
export * from './types'
export { runCapability, runHealthCheck } from './runner'
