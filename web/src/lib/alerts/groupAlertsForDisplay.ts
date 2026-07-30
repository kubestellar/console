import type { Alert } from '../../types/alerts'

export const ALERT_GROUP_WINDOW_MS = 60_000

export interface GroupedAlert extends Alert {
  alertIds: string[]
  duplicateCount: number
}

function normalizeAlertText(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeAlertSource(alert: Alert): string {
  const rawSource = alert.details?.source
  if (typeof rawSource === 'string') {
    return normalizeAlertText(rawSource)
  }

  return ''
}

function buildAlertSimilarityKey(alert: Alert): string {
  return [
    alert.ruleId,
    alert.severity,
    alert.status,
    alert.acknowledgedAt ? 'acknowledged' : 'active',
    normalizeAlertText(alert.cluster),
    normalizeAlertText(alert.resourceKind),
    normalizeAlertSource(alert),
    normalizeAlertText(alert.message),
  ].join('::')
}

export function groupAlertsForDisplay(alerts: Alert[]): GroupedAlert[] {
  const sortedAlerts = [...(alerts || [])].sort(
    (a, b) => new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
  )
  const groupedAlerts: GroupedAlert[] = []
  const groupedAlertsByKey = new Map<string, GroupedAlert>()

  for (const alert of sortedAlerts) {
    const similarityKey = buildAlertSimilarityKey(alert)
    const existingGroup = groupedAlertsByKey.get(similarityKey)
    const firedAtMs = new Date(alert.firedAt).getTime()

    if (existingGroup) {
      const existingFiredAtMs = new Date(existingGroup.firedAt).getTime()
      const isWithinGroupingWindow = existingFiredAtMs - firedAtMs <= ALERT_GROUP_WINDOW_MS
      if (isWithinGroupingWindow) {
        existingGroup.alertIds.push(alert.id)
        existingGroup.duplicateCount += 1
        continue
      }
    }

    const nextGroup: GroupedAlert = {
      ...alert,
      alertIds: [alert.id],
      duplicateCount: 1,
    }
    groupedAlertsByKey.set(similarityKey, nextGroup)
    groupedAlerts.push(nextGroup)
  }

  return groupedAlerts
}
