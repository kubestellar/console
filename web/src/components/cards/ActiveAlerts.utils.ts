import { MS_PER_MINUTE } from '../../lib/constants/time'
import type { SeverityLevel } from '../../hooks/useGlobalFilters'
import type { AlertSeverity } from '../../types/alerts'

/** Format remaining DND time as "Xh Ym" or "Ym" */
export function formatRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / MS_PER_MINUTE)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export type SortField = 'severity' | 'time'

export const mapAlertSeverityToGlobal = (alertSeverity: AlertSeverity): SeverityLevel[] => {
  switch (alertSeverity) {
    case 'critical': return ['critical']
    case 'warning': return ['warning']
    case 'info': return ['info']
    default: return ['info']
  }
}

export const ALERT_ROW_ESTIMATED_HEIGHT_PX = 144
export const ALERT_LIST_OVERSCAN_COUNT = 8
export const ALERT_LIST_ITEM_GAP_PX = 8
