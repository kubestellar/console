import { ModalDefinition } from './types'

/**
 * YAML Parser (future implementation)
 *
 * YAML parsing intentionally not implemented - use registerModal() with JS objects.
 * If YAML config becomes a requirement, add js-yaml library and implement parser here.
 */
export function parseModalYAML(_yaml: string): ModalDefinition {
  throw new Error('YAML parsing not yet implemented. Use registerModal() with JS objects.')
}
