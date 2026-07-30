import { ALERT_SEVERITY_ORDER } from '../../types/alerts'
import type { Alert, AlertSeverity } from '../../types/alerts'

/**
 * Pure filter + sort logic for the alert badge dropdown, extracted from AlertBadge.tsx
 * so it can be unit tested without rendering the component (see #21762, #21768).
 *
 * Filters alerts by a case-insensitive search query (matching rule name, message, or
 * cluster) and by severity, then sorts by severity (most severe first) and recency
 * (most recent first).
 *
 * Operates on the raw `Alert[]` returned by `useAlerts()` *before* grouping via
 * `groupAlertsForDisplay`, so the param/return type is `Alert`, not `GroupedAlert`.
 */
export function filterAndSortAlerts<T extends Alert>(
  alerts: T[],
  searchQuery: string,
  severityFilter: AlertSeverity | 'all'
): T[] {
  let result = [...alerts]

  const trimmedQuery = searchQuery.trim()
  if (trimmedQuery) {
    const query = trimmedQuery.toLowerCase()
    result = result.filter(a =>
      a.ruleName.toLowerCase().includes(query) ||
      a.message.toLowerCase().includes(query) ||
      (a.cluster?.toLowerCase() || '').includes(query)
    )
  }

  if (severityFilter !== 'all') {
    result = result.filter(a => a.severity === severityFilter)
  }

  return result.sort((a, b) => {
    const severityDiff = ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]
    if (severityDiff !== 0) return severityDiff
    return new Date(b.firedAt).getTime() - new Date(a.firedAt).getTime()
  })
}
