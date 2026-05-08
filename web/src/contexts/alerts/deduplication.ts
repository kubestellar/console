import type { Alert, AlertRule } from '../../types/alerts'

// Build the dedup key for an alert.
// pod_crash alerts use (ruleId, cluster, namespace, resource) so that pods with the
// same name in different namespaces get separate entries (#7328/#7338).
// All aggregate/cluster-level alert types use (ruleId, cluster) only, preventing
// dynamic resource strings from creating duplicates.
export function alertDedupKey(ruleId: string, conditionType: string, cluster?: string, resource?: string, namespace?: string): string {
  if (conditionType === 'pod_crash') {
    return `${ruleId}::${cluster ?? ''}::${namespace ?? ''}::${resource ?? ''}`
  }
  return `${ruleId}::${cluster ?? ''}`
}

// Deduplicate an array of alerts using the per-type key, keeping the most recently fired entry.
// Used to clean up historical duplicates persisted in localStorage before this fix.
export function deduplicateAlerts(alerts: Alert[], rules: AlertRule[]): Alert[] {
  const ruleTypeMap = new Map(rules.map(r => [r.id, r.condition.type]))
  const dedupMap = new Map<string, Alert>()
  for (const alert of alerts) {
    const condType = ruleTypeMap.get(alert.ruleId) ?? ''
    const key = alertDedupKey(alert.ruleId, condType, alert.cluster, alert.resource, alert.namespace)
    const existing = dedupMap.get(key)
    if (!existing || new Date(alert.firedAt) > new Date(existing.firedAt)) {
      dedupMap.set(key, alert)
    }
  }
  return Array.from(dedupMap.values())
}
