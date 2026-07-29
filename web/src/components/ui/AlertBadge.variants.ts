import type { AlertSeverity, AlertStats } from '../../types/alerts'

interface AlertBadgeVariantConfig {
  badgeColor: string
  triggerTextColor: string
  filterActiveClassName: string
  filterDotClassName: string
}

const FALLBACK_TRIGGER_TEXT_COLOR = ''
const FALLBACK_BADGE_COLOR = 'bg-muted-foreground'

export const ALERT_BADGE_VARIANT_MAP: Record<AlertSeverity, AlertBadgeVariantConfig> = {
  critical: {
    badgeColor: 'bg-red-500',
    triggerTextColor: 'text-red-400',
    filterActiveClassName: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
    filterDotClassName: 'bg-red-500',
  },
  warning: {
    badgeColor: 'bg-orange-500',
    triggerTextColor: 'text-orange-400',
    filterActiveClassName: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30',
    filterDotClassName: 'bg-orange-500',
  },
  info: {
    badgeColor: 'bg-blue-500',
    triggerTextColor: 'text-blue-400',
    filterActiveClassName: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
    filterDotClassName: 'bg-blue-500',
  },
}

export function getAlertBadgeHighestSeverity(stats: AlertStats): AlertSeverity | null {
  if (stats.critical > 0) return 'critical'
  if (stats.warning > 0) return 'warning'
  if (stats.info > 0) return 'info'
  return null
}

export function getAlertBadgeCountColor(stats: AlertStats): string {
  const highestSeverity = getAlertBadgeHighestSeverity(stats)
  return highestSeverity ? ALERT_BADGE_VARIANT_MAP[highestSeverity].badgeColor : FALLBACK_BADGE_COLOR
}

export function getAlertBadgeTriggerTextColor(stats: AlertStats): string {
  const highestSeverity = getAlertBadgeHighestSeverity(stats)
  return highestSeverity ? ALERT_BADGE_VARIANT_MAP[highestSeverity].triggerTextColor : FALLBACK_TRIGGER_TEXT_COLOR
}
