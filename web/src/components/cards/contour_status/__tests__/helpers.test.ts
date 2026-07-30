import { describe, expect, it } from 'vitest'
import { __testables } from '../useContourStatus'
import type { ContourProxyStatus, ContourEnvoyFleet } from '../demoData'

const mockEnvoyFleet: ContourEnvoyFleet = { total: 3, ready: 2, notReady: 1 }

const validProxy: ContourProxyStatus = {
  name: 'test-proxy',
  namespace: 'default',
  cluster: 'dev',
  fqdn: 'app.example.com',
  status: 'Valid',
  conditions: [],
}

const invalidProxy: ContourProxyStatus = {
  name: 'broken-proxy',
  namespace: 'staging',
  cluster: 'dev',
  fqdn: 'broken.example.com',
  status: 'Invalid',
  conditions: ['IncompleteRule'],
}

describe('contour_status helpers', () => {
  it('marks proxy with Valid status as valid', () => {
    expect(__testables.isProxyValid('Valid')).toBe(true)
    expect(__testables.isProxyValid('valid')).toBe(true)
    expect(__testables.isProxyValid('Invalid')).toBe(false)
    expect(__testables.isProxyValid(undefined)).toBe(false)
  })

  it('extracts Valid condition status and reason', () => {
    const ready = __testables.getReadyCondition({
      conditions: [{ type: 'Valid', status: 'True', reason: 'Valid' }],
    })
    expect(ready).toEqual({ ready: true, reason: 'Valid' })

    const notReady = __testables.getReadyCondition({
      conditions: [{ type: 'Valid', status: 'False', reason: 'IncompleteRule' }],
    })
    expect(notReady).toEqual({ ready: false, reason: 'IncompleteRule' })
  })

  it('builds not-installed status when proxies array is empty', () => {
    const data = __testables.buildContourStatus([], mockEnvoyFleet)
    expect(data.health).toBe('not-installed')
    expect(data.summary.totalProxies).toBe(0)
    expect(data.summary.validProxies).toBe(0)
    expect(data.summary.invalidProxies).toBe(0)
  })

  it('builds healthy status when all proxies are valid', () => {
    const data = __testables.buildContourStatus([validProxy], mockEnvoyFleet)
    expect(data.health).toBe('healthy')
    expect(data.summary.totalProxies).toBe(1)
    expect(data.summary.validProxies).toBe(1)
    expect(data.summary.invalidProxies).toBe(0)
  })

  it('builds degraded status when any proxy is invalid', () => {
    const data = __testables.buildContourStatus([validProxy, invalidProxy], mockEnvoyFleet)
    expect(data.health).toBe('degraded')
    expect(data.summary.totalProxies).toBe(2)
    expect(data.summary.validProxies).toBe(1)
    expect(data.summary.invalidProxies).toBe(1)
  })
})
