/**
 * Tests for applyMutations — the pure mutation-processing function in alertRulesEngine.ts.
 * Covers: create, update, resolve mutations, deduplication, MAX_ALERTS trimming.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../alertStorage', () => ({
  DEFAULT_TEMPERATURE_THRESHOLD_F: 100,
  DEFAULT_WIND_SPEED_THRESHOLD_MPH: 40,
  MAX_ALERTS: 500,
}))

vi.mock('../notifications', () => ({
  isClusterUnreachable: vi.fn(() => false),
}))

vi.mock('../alerts/deduplication', () => ({
  alertDedupKey: (...args: unknown[]) => args.filter(Boolean).join('|'),
}))

import { applyMutations } from '../alertRulesEngine'
import type { Alert, AlertRule } from '../../types/alerts'
import type { CreateMutation, UpdateMutation, ResolveMutation } from '../AlertsContext.types'

// ── helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0
function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: `id-${++idCounter}`,
    ruleId: 'rule1',
    ruleName: 'Rule 1',
    severity: 'warning',
    status: 'firing',
    message: 'Test alert',
    details: {},
    cluster: 'cluster-a',
    firedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: 'rule1',
    name: 'Rule 1',
    description: '',
    enabled: true,
    condition: { type: 'node_not_ready' },
    severity: 'warning',
    channels: [],
    aiDiagnose: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeCreateMutation(alert: Partial<Alert> = {}, rule = makeRule()): CreateMutation {
  return { type: 'create', rule, alert: makeAlert(alert) }
}

// ── applyMutations ────────────────────────────────────────────────────────────

describe('applyMutations', () => {
  it('returns prev unchanged (same reference) when mutations is empty', () => {
    const prev = [makeAlert()]
    const result = applyMutations(prev, [], [])
    expect(result).toBe(prev)
  })

  describe('create mutation', () => {
    it('prepends a new alert to the list', () => {
      const existing = makeAlert({ id: 'existing', cluster: 'cluster-a' })
      const mutation = makeCreateMutation({ id: 'new', cluster: 'cluster-b' })
      const result = applyMutations([existing], [mutation], [makeRule()])
      expect(result[0].id).toBe('new')
      expect(result[1].id).toBe('existing')
    })

    it('deduplicates: keeps existing id when same dedup key already firing', () => {
      const existing = makeAlert({ id: 'old-id', ruleId: 'rule1', cluster: 'cluster-a' })
      // older firedAt → should NOT replace existing
      const older = makeAlert({ id: 'discard', ruleId: 'rule1', cluster: 'cluster-a', firedAt: new Date(0).toISOString() })
      const mutation = makeCreateMutation({ ...older, id: 'discard' })
      const result = applyMutations([existing], [mutation], [makeRule()])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('old-id')
    })

    it('deduplicates: updates message in-place when newer firedAt, preserves existing id', () => {
      const oldDate = new Date('2024-01-01').toISOString()
      const newDate = new Date('2024-06-01').toISOString()
      const existing = makeAlert({ id: 'keep-id', ruleId: 'rule1', cluster: 'cluster-a', firedAt: oldDate })
      const mutation = makeCreateMutation({ ruleId: 'rule1', cluster: 'cluster-a', firedAt: newDate, message: 'updated msg' })
      const result = applyMutations([existing], [mutation], [makeRule()])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('keep-id')
      expect(result[0].message).toBe('updated msg')
    })

    it('does not update when incoming firedAt is older than existing', () => {
      const newDate = new Date('2024-06-01').toISOString()
      const oldDate = new Date('2024-01-01').toISOString()
      const existing = makeAlert({ id: 'keep', ruleId: 'rule1', cluster: 'cluster-a', firedAt: newDate, message: 'current' })
      const mutation = makeCreateMutation({ ruleId: 'rule1', cluster: 'cluster-a', firedAt: oldDate, message: 'stale' })
      const result = applyMutations([existing], [mutation], [makeRule()])
      expect(result).toHaveLength(1)
      expect(result[0].message).toBe('current')
    })

    it('creates new alert when rule is missing from rules array (empty conditionType key)', () => {
      const mutation = makeCreateMutation({ id: 'new-alert', cluster: 'cluster-z' })
      // No rule in array — ruleTypeMap has no entry, so conditionType = ''
      const result = applyMutations([], [mutation], [])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('new-alert')
    })
  })

  describe('update mutation', () => {
    // With mock alertDedupKey: 'rule1|node_not_ready|cluster-a'
    const DEDUP_KEY = 'rule1|node_not_ready|cluster-a'

    it('updates message and details when they differ', () => {
      const alert = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', message: 'old msg', details: {} })
      const mutation: UpdateMutation = {
        type: 'update',
        dedupKey: DEDUP_KEY,
        conditionType: 'node_not_ready',
        message: 'new msg',
        details: { extra: 'info' },
      }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].message).toBe('new msg')
      expect(result[0].details).toEqual({ extra: 'info' })
    })

    it('updates resource and namespace fields', () => {
      const alert = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a' })
      const mutation: UpdateMutation = {
        type: 'update',
        dedupKey: DEDUP_KEY,
        conditionType: 'node_not_ready',
        message: 'updated',
        details: {},
        resource: 'pod-abc',
        namespace: 'default',
        resourceKind: 'Pod',
      }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].resource).toBe('pod-abc')
      expect(result[0].namespace).toBe('default')
      expect(result[0].resourceKind).toBe('Pod')
    })

    it('skips update when no matching dedupKey in index', () => {
      const alert = makeAlert({ id: 'a1', ruleId: 'rule1', cluster: 'cluster-a', message: 'unchanged' })
      const mutation: UpdateMutation = {
        type: 'update',
        dedupKey: 'no-such-key',
        conditionType: 'node_not_ready',
        message: 'new msg',
        details: {},
      }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].message).toBe('unchanged')
    })

    it('skips update when all fields are identical (no-op)', () => {
      const alert = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', message: 'same', details: { x: 1 } })
      const mutation: UpdateMutation = {
        type: 'update',
        dedupKey: DEDUP_KEY,
        conditionType: 'node_not_ready',
        message: 'same',
        details: { x: 1 },
        resource: undefined,
        namespace: undefined,
        resourceKind: undefined,
      }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].message).toBe('same')
    })

    it('does not update resolved alerts (dedupIndex only indexes firing alerts)', () => {
      const resolved = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', status: 'resolved', message: 'original' })
      const mutation: UpdateMutation = {
        type: 'update',
        dedupKey: DEDUP_KEY,
        conditionType: 'node_not_ready',
        message: 'should not apply',
        details: {},
      }
      const result = applyMutations([resolved], [mutation], [makeRule()])
      expect(result[0].message).toBe('original')
    })
  })

  describe('resolve mutation', () => {
    it('resolves all matching alerts when matchAny=true', () => {
      const a1 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', status: 'firing' })
      const a2 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-b', status: 'firing' })
      const a3 = makeAlert({ ruleId: 'rule2', cluster: 'cluster-a', status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', matchAny: true }

      const result = applyMutations([a1, a2, a3], [mutation], [makeRule()])
      expect(result.find(a => a.id === a1.id)?.status).toBe('resolved')
      expect(result.find(a => a.id === a2.id)?.status).toBe('resolved')
      expect(result.find(a => a.id === a3.id)?.status).toBe('firing')
    })

    it('resolves only cluster-matching alerts when matchAny=false', () => {
      const a1 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', status: 'firing' })
      const a2 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-b', status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', cluster: 'cluster-a' }

      const result = applyMutations([a1, a2], [mutation], [makeRule()])
      expect(result.find(a => a.id === a1.id)?.status).toBe('resolved')
      expect(result.find(a => a.id === a2.id)?.status).toBe('firing')
    })

    it('narrows resolve to specific resource when resource is set', () => {
      const a1 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', resource: 'pod-1', status: 'firing' })
      const a2 = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', resource: 'pod-2', status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', cluster: 'cluster-a', resource: 'pod-1' }

      const result = applyMutations([a1, a2], [mutation], [makeRule()])
      expect(result.find(a => a.id === a1.id)?.status).toBe('resolved')
      expect(result.find(a => a.id === a2.id)?.status).toBe('firing')
    })

    it('skips resolve entirely when no cluster and matchAny is falsy', () => {
      const alert = makeAlert({ status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1' }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].status).toBe('firing')
    })

    it('adds resolvedAt timestamp to resolved alerts', () => {
      const alert = makeAlert({ ruleId: 'rule1', cluster: 'cluster-a', status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', cluster: 'cluster-a' }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].resolvedAt).toBeDefined()
      expect(() => new Date(result[0].resolvedAt!)).not.toThrow()
    })

    it('does not resolve alerts with non-matching ruleId', () => {
      const alert = makeAlert({ ruleId: 'rule2', status: 'firing' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', matchAny: true }
      const result = applyMutations([alert], [mutation], [makeRule()])
      expect(result[0].status).toBe('firing')
    })

    it('does not re-resolve already-resolved alerts', () => {
      const resolved = makeAlert({ ruleId: 'rule1', status: 'resolved', resolvedAt: '2024-01-01T00:00:00Z' })
      const mutation: ResolveMutation = { type: 'resolve', ruleId: 'rule1', matchAny: true }
      const result = applyMutations([resolved], [mutation], [makeRule()])
      expect(result[0].status).toBe('resolved')
    })
  })

  describe('MAX_ALERTS trimming', () => {
    it('trims resolved alerts when total exceeds MAX_ALERTS (500)', () => {
      // 490 firing + 20 resolved = 510; add 1 more firing → 511 → trim to 500
      const firing = Array.from({ length: 490 }, (_, i) =>
        makeAlert({ status: 'firing', ruleId: 'rule1', cluster: `c-${i}` }),
      )
      const resolved = Array.from({ length: 20 }, (_, i) =>
        makeAlert({ status: 'resolved', ruleId: 'rule1', cluster: `r-${i}`, resolvedAt: new Date().toISOString() }),
      )
      const extra = makeAlert({ id: 'extra-new', status: 'firing', cluster: 'cluster-extra' })
      const mutation: CreateMutation = { type: 'create', rule: makeRule(), alert: extra }

      const result = applyMutations([...resolved, ...firing], [mutation], [makeRule()])
      expect(result.length).toBeLessThanOrEqual(500)
      const firingCount = result.filter(a => a.status === 'firing').length
      expect(firingCount).toBe(491)
    })

    it('returns full list without trimming when total <= MAX_ALERTS', () => {
      const alerts = Array.from({ length: 5 }, (_, i) =>
        makeAlert({ cluster: `c-${i}` }),
      )
      const newAlert = makeAlert({ cluster: 'cluster-new' })
      const mutation: CreateMutation = { type: 'create', rule: makeRule(), alert: newAlert }
      const result = applyMutations(alerts, [mutation], [makeRule()])
      expect(result.length).toBe(6)
    })
  })

  describe('multiple mutations in sequence', () => {
    it('applies create then resolve in order', () => {
      const newAlert = makeAlert({ id: 'seq-alert', ruleId: 'rule1', cluster: 'cluster-a', status: 'firing' })
      const createMut: CreateMutation = { type: 'create', rule: makeRule(), alert: newAlert }
      const resolveMut: ResolveMutation = { type: 'resolve', ruleId: 'rule1', matchAny: true }

      const result = applyMutations([], [createMut, resolveMut], [makeRule()])
      // After create: 1 alert; after resolve: status=resolved
      // Note: resolve is applied AFTER create, so the created alert is resolved
      const found = result.find(a => a.ruleId === 'rule1')
      expect(found?.status).toBe('resolved')
    })
  })
})
