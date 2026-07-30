import { describe, it, expect } from 'vitest'
import type { Alert, AlertRule } from '../../types/alerts'

const { __alertsTestables } = await import('../AlertsContext')

const {
  shallowEqualRecords,
  alertDedupKey,
  deduplicateAlerts,
  applyMutations,
} = __alertsTestables

// ── shallowEqualRecords ──

describe('shallowEqualRecords', () => {
  it('returns true for both null', () => {
    expect(shallowEqualRecords(null, null)).toBe(true)
  })

  it('returns true for both undefined', () => {
    expect(shallowEqualRecords(undefined, undefined)).toBe(true)
  })

  it('returns true for null and undefined', () => {
    expect(shallowEqualRecords(null, undefined)).toBe(true)
  })

  it('returns false for null vs object', () => {
    expect(shallowEqualRecords(null, { a: 1 })).toBe(false)
  })

  it('returns false for object vs null', () => {
    expect(shallowEqualRecords({ a: 1 }, null)).toBe(false)
  })

  it('returns true for identical objects', () => {
    const obj = { a: 1, b: 'hello' }
    expect(shallowEqualRecords(obj, obj)).toBe(true)
  })

  it('returns true for equal objects', () => {
    expect(shallowEqualRecords({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
  })

  it('returns false for different values', () => {
    expect(shallowEqualRecords({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('returns false for different keys count', () => {
    expect(shallowEqualRecords({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('returns false for different keys', () => {
    expect(shallowEqualRecords({ a: 1 }, { b: 1 })).toBe(false)
  })

  it('returns true for empty objects', () => {
    expect(shallowEqualRecords({}, {})).toBe(true)
  })
})

// ── alertDedupKey ──

describe('alertDedupKey', () => {
  it('uses full key for pod_crash condition', () => {
    const key = alertDedupKey('rule-1', 'pod_crash', 'cluster-a', 'pod-1', 'ns-1')
    expect(key).toBe('rule-1::cluster-a::ns-1::pod-1')
  })

  it('uses cluster-only key for non pod_crash conditions', () => {
    const key = alertDedupKey('rule-1', 'node_ready', 'cluster-a', 'node-1', 'ns-1')
    expect(key).toBe('rule-1::cluster-a')
  })

  it('handles undefined cluster', () => {
    const key = alertDedupKey('rule-1', 'weather')
    expect(key).toBe('rule-1::')
  })

  it('handles undefined resource and namespace for pod_crash', () => {
    const key = alertDedupKey('rule-1', 'pod_crash', 'cluster-a')
    expect(key).toBe('rule-1::cluster-a::::')
  })
})

// ── deduplicateAlerts ──

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'alert-1',
  ruleId: 'rule-1',
  message: 'test alert',
  severity: 'warning',
  status: 'firing',
  firedAt: '2026-01-01T00:00:00Z',
  cluster: 'cluster-a',
  ...overrides,
})

const makeRule = (overrides: Partial<AlertRule> = {}): AlertRule => ({
  id: 'rule-1',
  name: 'Test Rule',
  enabled: true,
  severity: 'warning',
  condition: { type: 'node_ready', threshold: 1 },
  channels: [],
  ...overrides,
} as AlertRule)

describe('deduplicateAlerts', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateAlerts([], [])).toEqual([])
  })

  it('returns single alert unchanged', () => {
    const alert = makeAlert()
    const result = deduplicateAlerts([alert], [makeRule()])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(alert)
  })

  it('deduplicates alerts with same dedup key keeping most recent', () => {
    const older = makeAlert({ id: 'a1', firedAt: '2026-01-01T00:00:00Z' })
    const newer = makeAlert({ id: 'a2', firedAt: '2026-01-02T00:00:00Z' })
    const result = deduplicateAlerts([older, newer], [makeRule()])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a2')
  })

  it('keeps alerts with different clusters as separate', () => {
    const a1 = makeAlert({ id: 'a1', cluster: 'cluster-a' })
    const a2 = makeAlert({ id: 'a2', cluster: 'cluster-b' })
    const result = deduplicateAlerts([a1, a2], [makeRule()])
    expect(result).toHaveLength(2)
  })

  it('deduplicates pod_crash by namespace and resource', () => {
    const rule = makeRule({ id: 'rule-pc', condition: { type: 'pod_crash', threshold: 1 } as AlertRule['condition'] })
    const a1 = makeAlert({ id: 'a1', ruleId: 'rule-pc', namespace: 'ns1', resource: 'pod-1', firedAt: '2026-01-01T00:00:00Z' })
    const a2 = makeAlert({ id: 'a2', ruleId: 'rule-pc', namespace: 'ns1', resource: 'pod-1', firedAt: '2026-01-02T00:00:00Z' })
    const a3 = makeAlert({ id: 'a3', ruleId: 'rule-pc', namespace: 'ns2', resource: 'pod-1', firedAt: '2026-01-01T00:00:00Z' })
    const result = deduplicateAlerts([a1, a2, a3], [rule])
    expect(result).toHaveLength(2)
  })

  it('handles unknown rule type gracefully', () => {
    const alert = makeAlert({ ruleId: 'unknown-rule' })
    const result = deduplicateAlerts([alert], [])
    expect(result).toHaveLength(1)
  })
})

// ── applyMutations ──

describe('applyMutations', () => {
  it('returns same array for empty mutations', () => {
    const alerts = [makeAlert()]
    const result = applyMutations(alerts, [], [makeRule()])
    expect(result).toBe(alerts)
  })

  it('creates a new alert', () => {
    const newAlert = makeAlert({ id: 'new-1', cluster: 'cluster-b' })
    const result = applyMutations(
      [],
      [{ type: 'create', rule: makeRule(), alert: newAlert }],
      [makeRule()],
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-1')
  })

  it('updates existing firing alert on create with same dedup key', () => {
    const existing = makeAlert({ id: 'existing-1', message: 'old' })
    const updated = makeAlert({ id: 'updated-1', message: 'new', firedAt: '2026-06-01T00:00:00Z' })
    const result = applyMutations(
      [existing],
      [{ type: 'create', rule: makeRule(), alert: updated }],
      [makeRule()],
    )
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('existing-1')
    expect(result[0].message).toBe('new')
  })

  it('does not update if new alert is older', () => {
    const existing = makeAlert({ id: 'existing-1', message: 'old', firedAt: '2026-06-01T00:00:00Z' })
    const older = makeAlert({ id: 'older-1', message: 'older', firedAt: '2026-01-01T00:00:00Z' })
    const result = applyMutations(
      [existing],
      [{ type: 'create', rule: makeRule(), alert: older }],
      [makeRule()],
    )
    expect(result).toHaveLength(1)
    expect(result[0].message).toBe('old')
  })

  it('resolves alerts with matchAny', () => {
    const a1 = makeAlert({ id: 'a1', cluster: 'c1' })
    const a2 = makeAlert({ id: 'a2', cluster: 'c2' })
    const result = applyMutations(
      [a1, a2],
      [{ type: 'resolve', ruleId: 'rule-1', matchAny: true }],
      [makeRule()],
    )
    expect(result.every(a => a.status === 'resolved')).toBe(true)
  })

  it('resolves alerts by cluster', () => {
    const a1 = makeAlert({ id: 'a1', cluster: 'c1' })
    const a2 = makeAlert({ id: 'a2', cluster: 'c2' })
    const result = applyMutations(
      [a1, a2],
      [{ type: 'resolve', ruleId: 'rule-1', cluster: 'c1' }],
      [makeRule()],
    )
    expect(result[0].status).toBe('resolved')
    expect(result[1].status).toBe('firing')
  })

  it('resolves alerts by cluster and resource', () => {
    const a1 = makeAlert({ id: 'a1', cluster: 'c1', resource: 'pod-1' })
    const a2 = makeAlert({ id: 'a2', cluster: 'c1', resource: 'pod-2' })
    const result = applyMutations(
      [a1, a2],
      [{ type: 'resolve', ruleId: 'rule-1', cluster: 'c1', resource: 'pod-1' }],
      [makeRule()],
    )
    expect(result[0].status).toBe('resolved')
    expect(result[1].status).toBe('firing')
  })

  it('applies update mutation', () => {
    const existing = makeAlert({ id: 'a1', message: 'old', status: 'firing' })
    const rule = makeRule()
    const dedupKey = 'rule-1::cluster-a'
    const result = applyMutations(
      [existing],
      [{
        type: 'update',
        dedupKey,
        conditionType: 'node_ready',
        message: 'updated message',
        details: { cpu: 90 },
        resource: 'node-1',
        namespace: 'default',
        resourceKind: 'Node',
      }],
      [rule],
    )
    expect(result[0].message).toBe('updated message')
    expect(result[0].resource).toBe('node-1')
  })

  it('skips update when nothing changed', () => {
    const existing = makeAlert({
      id: 'a1',
      message: 'same',
      resource: 'pod-1',
      namespace: 'ns1',
      resourceKind: 'Pod',
      details: { cpu: 50 },
      status: 'firing',
    })
    const rule = makeRule()
    const dedupKey = 'rule-1::cluster-a'
    const result = applyMutations(
      [existing],
      [{
        type: 'update',
        dedupKey,
        conditionType: 'node_ready',
        message: 'same',
        details: { cpu: 50 },
        resource: 'pod-1',
        namespace: 'ns1',
        resourceKind: 'Pod',
      }],
      [rule],
    )
    expect(result[0]).toBe(existing)
  })
})
