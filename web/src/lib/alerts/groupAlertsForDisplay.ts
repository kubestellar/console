import type { Alert } from '../../types/alerts'

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
    normalizeAlertText(alert.namespace),
    normalizeAlertText(alert.resourceKind),
    normalizeAlertText(alert.resource),
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

    if (existingGroup) {
      existingGroup.alertIds.push(alert.id)
      existingGroup.duplicateCount += 1
      continue
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
