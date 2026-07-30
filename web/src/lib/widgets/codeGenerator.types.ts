/**
 * Type definitions for widget code generation
 */

export interface WidgetConfig {
  type: 'card' | 'stat' | 'template'
  cardType?: string
  statIds?: string[]
  templateId?: string
  apiEndpoint: string
  refreshInterval: number
  theme: 'dark' | 'light'
}
