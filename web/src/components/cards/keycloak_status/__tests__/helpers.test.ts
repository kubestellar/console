import { describe, it, expect } from 'vitest'
import { isKeycloakOperatorPod, isPodReady, parseKeycloakInstance } from '../useKeycloakStatus'

// ---------------------------------------------------------------------------
// isKeycloakOperatorPod
// ---------------------------------------------------------------------------

describe('isKeycloakOperatorPod', () => {
  it('matches pod with app=keycloak-operator label', () => {
    expect(isKeycloakOperatorPod({ labels: { app: 'keycloak-operator' } })).toBe(true)
  })

  it('matches pod with app.kubernetes.io/name=keycloak-operator label', () => {
    expect(isKeycloakOperatorPod({
      labels: { 'app.kubernetes.io/name': 'keycloak-operator' },
    })).toBe(true)
  })

  it('matches pod with app.kubernetes.io/part-of=keycloak-operator label', () => {
    expect(isKeycloakOperatorPod({
      labels: { 'app.kubernetes.io/part-of': 'keycloak-operator' },
    })).toBe(true)
  })

  it('matches pod whose name starts with keycloak-operator', () => {
    expect(isKeycloakOperatorPod({ name: 'keycloak-operator-abc123-xyz' })).toBe(true)
  })

  it('does NOT match a plain keycloak app pod (too broad)', () => {
    expect(isKeycloakOperatorPod({
      name: 'keycloak-0',
      labels: { app: 'keycloak', 'app.kubernetes.io/name': 'keycloak' },
    })).toBe(false)
  })

  it('does NOT match unrelated keycloak-adjacent workloads', () => {
    expect(isKeycloakOperatorPod({ name: 'keycloak-ui-deployment-abc' })).toBe(false)
    expect(isKeycloakOperatorPod({ name: 'keycloak-proxy-xyz' })).toBe(false)
  })

  it('does NOT match a pod with no labels and unrelated name', () => {
    expect(isKeycloakOperatorPod({ name: 'nginx-abc123', labels: {} })).toBe(false)
  })

  it('handles missing name and labels gracefully', () => {
    expect(isKeycloakOperatorPod({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isPodReady
// ---------------------------------------------------------------------------

describe('isPodReady', () => {
  it('returns true for Running pod with all containers ready', () => {
    expect(isPodReady({ status: 'Running', ready: '1/1' })).toBe(true)
    expect(isPodReady({ status: 'Running', ready: '2/2' })).toBe(true)
  })

  it('returns false for Running pod with partial readiness', () => {
    expect(isPodReady({ status: 'Running', ready: '0/1' })).toBe(false)
    expect(isPodReady({ status: 'Running', ready: '1/2' })).toBe(false)
  })

  it('returns false for non-Running pod even if ready string looks good', () => {
    expect(isPodReady({ status: 'Pending', ready: '1/1' })).toBe(false)
    expect(isPodReady({ status: 'CrashLoopBackOff', ready: '1/1' })).toBe(false)
  })

  it('returns false for malformed ready string', () => {
    expect(isPodReady({ status: 'Running', ready: 'bad' })).toBe(false)
    expect(isPodReady({ status: 'Running', ready: '' })).toBe(false)
  })

  it('returns false when ready count is 0', () => {
    expect(isPodReady({ status: 'Running', ready: '0/0' })).toBe(false)
  })

  it('handles missing fields gracefully', () => {
    expect(isPodReady({})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseKeycloakInstance
// ---------------------------------------------------------------------------

const BASE_ITEM = {
  name: 'keycloak-sample',
  namespace: 'keycloak',
  cluster: 'local',
}

describe('parseKeycloakInstance', () => {
  it('returns ready when Ready condition is True', () => {
    const result = parseKeycloakInstance({
      ...BASE_ITEM,
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
    })
    expect(result.status).toBe('ready')
    expect(result.name).toBe('keycloak-sample')
    expect(result.namespace).toBe('keycloak')
  })

  it('returns error when Ready condition is False', () => {
    const result = parseKeycloakInstance({
      ...BASE_ITEM,
      status: { conditions: [{ type: 'Ready', status: 'False' }] },
    })
    expect(result.status).toBe('error')
  })

  it('returns degraded when HasErrors condition is True', () => {
    const result = parseKeycloakInstance({
      ...BASE_ITEM,
      status: { conditions: [{ type: 'HasErrors', status: 'True' }] },
    })
    expect(result.status).toBe('degraded')
  })

  it('returns provisioning when no conditions exist yet', () => {
    const result = parseKeycloakInstance({
      ...BASE_ITEM,
      status: { conditions: [] },
    })
    expect(result.status).toBe('provisioning')
  })

  it('returns provisioning when status is absent entirely', () => {
    const result = parseKeycloakInstance({ ...BASE_ITEM })
    expect(result.status).toBe('provisioning')
  })

  it('defaults enabled to true and numeric fields to 0', () => {
    const result = parseKeycloakInstance({ ...BASE_ITEM })
    expect(result.enabled).toBe(true)
    expect(result.clients).toBe(0)
    expect(result.users).toBe(0)
    expect(result.activeSessions).toBe(0)
  })

  it('falls back namespace to empty string when absent', () => {
    const result = parseKeycloakInstance({ name: 'test', cluster: 'local' })
    expect(result.namespace).toBe('')
  })
})
