export type ExportTab = 'card' | 'stats' | 'templates'

export const EXPORT_TAB_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-tab-templates',
  card: 'widget-export-tab-card',
  stats: 'widget-export-tab-stats'
}
export const EXPORT_PANEL_IDS: Record<ExportTab, string> = {
  templates: 'widget-export-panel-templates',
  card: 'widget-export-panel-card',
  stats: 'widget-export-panel-stats'
}
export const API_ENDPOINT_INPUT_ID = 'widget-export-api-endpoint'
export const REFRESH_INTERVAL_INPUT_ID = 'widget-export-refresh-interval'
export const WIDGET_CODE_PANEL_ID = 'widget-export-code-panel'
export const MIN_REFRESH_INTERVAL_SECONDS = 10
