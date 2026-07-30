import { describe, it, expect } from 'vitest'
import { alertDedupKey, deduplicateAlerts } from '../deduplication'
import type { Alert, AlertRule } from '../../../types/alerts'

// --- helpers ---

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    description: '',
    enabled: true,
    condition: { type: 'node_not_ready' },
    severity: 'warning',
    channels: [],
    aiDiagnose: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    ruleId: 'rule-1',
    ruleName: 'Test Rule',
    severity: 'warning',
    status: 'firing',
    message: 'test',
    details: {},
    firedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

// --- alertDedupKey ---

describe('alertDedupKey', () => {
  it('includes namespace and resource for pod_crash', () => {
    const key = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'my-pod', 'default')
    expect(key).toBe('rule-1::cluster-a::default::my-pod')
  })

  it('pod_crash keys differ by namespace', () => {
    const key1 = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'my-pod', 'ns-1')
    const key2 = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'my-pod', 'ns-2')
    expect(key1).not.toBe(key2)
  })

  it('pod_crash keys differ by resource', () => {
    const key1 = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'pod-a', 'default')
    const key2 = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'pod-b', 'default')
    expect(key1).not.toBe(key2)
  })

  it('non-pod_crash uses ruleId and cluster only', () => {
    const key = alertDedupKey('rule-1', 'node_not_ready', 'cluster-a', 'some-resource', 'default')
    expect(key).toBe('rule-1::cluster-a')
  })

  it('non-pod_crash keys are equal regardless of resource/namespace', () => {
    const key1 = alertDedupKey('rule-1', 'memory_pressure', 'cluster-a', 'pod-a', 'ns-1')
    const key2 = alertDedupKey('rule-1', 'memory_pressure', 'cluster-a', 'pod-b', 'ns-2')
    expect(key1).toBe(key2)
  })

  it('handles missing cluster gracefully', () => {
    const key = alertDedupKey('rule-1', 'node_not_ready', undefined)
    expect(key).toBe('rule-1::')
  })

  it('handles missing resource and namespace for pod_crash', () => {
    const key = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', undefined, undefined)
    expect(key).toBe('rule-1::cluster-a::::')
  })
})

// --- deduplicateAlerts ---

describe('deduplicateAlerts', () => {
  it('returns empty array when given empty input', () => {
    expect(deduplicateAlerts([], [])).toEqual([])
  })

  it('keeps a single alert unchanged', () => {
    const rules = [makeRule()]
    const alerts = [makeAlert()]
    const result = deduplicateAlerts(alerts, rules)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('alert-1')
  })

  it('deduplicates non-pod_crash alerts by ruleId + cluster', () => {
    const rules = [makeRule({ id: 'rule-1', condition: { type: 'node_not_ready' } })]
    const older = makeAlert({ id: 'alert-old', firedAt: '2024-01-01T00:00:00Z', cluster: 'cluster-a' })
    const newer = makeAlert({ id: 'alert-new', firedAt: '2024-01-02T00:00:00Z', cluster: 'cluster-a' })
    const result = deduplicateAlerts([older, newer], rules)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('alert-new')
  })

  it('keeps most-recently-fired when duplicates exist', () => {
    const rules = [makeRule({ id: 'rule-1', condition: { type: 'node_not_ready' } })]
    const a1 = makeAlert({ id: 'a1', firedAt: '2024-01-03T00:00:00Z', cluster: 'cluster-a' })
    const a2 = makeAlert({ id: 'a2', firedAt: '2024-01-01T00:00:00Z', cluster: 'cluster-a' })
    const a3 = makeAlert({ id: 'a3', firedAt: '2024-01-02T00:00:00Z', cluster: 'cluster-a' })
    const result = deduplicateAlerts([a1, a2, a3], rules)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a1')
  })

  it('does not deduplicate pod_crash alerts in different namespaces', () => {
    const rules = [makeRule({ id: 'rule-1', condition: { type: 'pod_crash' } })]
    const a1 = makeAlert({ id: 'a1', cluster: 'cluster-a', namespace: 'ns-1', resource: 'my-pod' })
    const a2 = makeAlert({ id: 'a2', cluster: 'cluster-a', namespace: 'ns-2', resource: 'my-pod' })
    const result = deduplicateAlerts([a1, a2], rules)
    expect(result).toHaveLength(2)
  })

  it('deduplicates pod_crash alerts with same cluster/namespace/resource', () => {
    const rules = [makeRule({ id: 'rule-1', condition: { type: 'pod_crash' } })]
    const a1 = makeAlert({ id: 'a1', firedAt: '2024-01-01T00:00:00Z', cluster: 'cluster-a', namespace: 'default', resource: 'crash-pod' })
    const a2 = makeAlert({ id: 'a2', firedAt: '2024-01-02T00:00:00Z', cluster: 'cluster-a', namespace: 'default', resource: 'crash-pod' })
    const result = deduplicateAlerts([a1, a2], rules)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a2')
  })

  it('keeps separate entries for different clusters', () => {
    const rules = [makeRule({ id: 'rule-1', condition: { type: 'node_not_ready' } })]
    const a1 = makeAlert({ id: 'a1', cluster: 'cluster-a' })
    const a2 = makeAlert({ id: 'a2', cluster: 'cluster-b' })
    const result = deduplicateAlerts([a1, a2], rules)
    expect(result).toHaveLength(2)
  })

  it('treats unknown ruleId conditionType as non-pod_crash', () => {
    // Rule not in rules array → condType = '' → uses (ruleId::cluster) key
    const rules: AlertRule[] = []
    const a1 = makeAlert({ id: 'a1', firedAt: '2024-01-01T00:00:00Z', cluster: 'cluster-a', namespace: 'ns-1', resource: 'pod-a' })
    const a2 = makeAlert({ id: 'a2', firedAt: '2024-01-02T00:00:00Z', cluster: 'cluster-a', namespace: 'ns-2', resource: 'pod-b' })
    const result = deduplicateAlerts([a1, a2], rules)
    // Both map to 'rule-1::cluster-a' → only newest kept
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a2')
  })
})
