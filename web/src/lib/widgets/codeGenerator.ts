/**
 * Widget Code Generator
 *
 * Generates Übersicht widget code (.jsx) for cards, stats, and templates.
 *
 * This file is the main entry point that re-exports from focused modules.
 */

// Re-export types
export type { WidgetConfig } from './codeGenerator.types'

// Re-export template generators (main API)
export {
  generateCardWidget,
  generateStatWidget,
  generateTemplateWidget,
  generateCardRenderFunction,
  generateMiniStatComponent,
} from './codeGenerator.templates'

// Re-export utilities (less commonly used, but part of the public API)
export { resolveWidgetEndpoint, generateWidgetCommand } from './codeGenerator.utils'

// Re-export constants
export { UBERSICHT_FALLBACK_URL, WIDGET_TOKEN_CACHE } from './codeGenerator.constants'

import type { WidgetConfig } from './codeGenerator.types'
import {
  generateCardWidget,
  generateStatWidget,
  generateTemplateWidget,
} from './codeGenerator.templates'

// Main generator function
export function generateWidget(config: WidgetConfig): string {
  switch (config.type) {
    case 'card':
      if (!config.cardType) throw new Error('cardType required for card widget')
      return generateCardWidget(config.cardType, config.apiEndpoint, config.refreshInterval)

    case 'stat':
      if (!config.statIds || config.statIds.length === 0) throw new Error('statIds required for stat widget')
      return generateStatWidget(config.statIds, config.apiEndpoint, config.refreshInterval)

    case 'template':
      if (!config.templateId) throw new Error('templateId required for template widget')
      return generateTemplateWidget(config.templateId, config.apiEndpoint, config.refreshInterval)

    default:
      throw new Error(`Unknown widget type: ${config.type}`)
  }
}

// Get filename for widget
export function getWidgetFilename(config: WidgetConfig): string {
  switch (config.type) {
    case 'card':
      return `${config.cardType?.replace(/_/g, '-')}.widget.jsx`
    case 'stat':
      return `stats-${(config.statIds ?? []).join('-')}.widget.jsx`
    case 'template':
      return `${config.templateId?.replace(/_/g, '-')}.widget.jsx`
    default:
      return 'widget.jsx'
  }
}
