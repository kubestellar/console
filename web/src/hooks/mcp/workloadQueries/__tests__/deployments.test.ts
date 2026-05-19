/**
 * Unit tests for workloadQueries/deployments.ts
 *
 * Covers pure/exported functions:
 *   getDemoDeploymentIssues, getDemoDeployments, resetDeploymentsCache
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDemoDeploymentIssues,
  getDemoDeployments,
  resetDeploymentsCache,
} from '../deployments'

// ---------------------------------------------------------------------------
// Mocks required by deployments.ts React hook imports (not under test)
// ---------------------------------------------------------------------------
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [init, vi.fn()]),
    useRef: vi.fn((init: unknown) => ({ current: init })),
    useEffect: vi.fn(),
    useCallback: vi.fn((fn: unknown) => fn),
  }
})
vi.mock('../../../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))
vi.mock('../../../../lib/demoMode', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, isDemoMode: vi.fn(() => false) }
})
vi.mock('../../../../lib/kubectlProxy', () => ({ kubectlProxy: vi.fn() }))
vi.mock('../../../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 10_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))
vi.mock('../../../../lib/sseClient', () => ({ fetchSSE: vi.fn() }))
vi.mock('../../../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: vi.fn(() => 'http://localhost:8080'),
  isClusterModeBackend: vi.fn(() => false),
}))
vi.mock('../../../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: vi.fn(() => false),
}))
vi.mock('../shared', () => ({
  REFRESH_INTERVAL_MS: 30_000,
  MIN_REFRESH_INDICATOR_MS: 500,
  getEffectiveInterval: vi.fn(() => 30_000),
  clusterCacheRef: { current: null },
  fetchWithRetry: vi.fn(),
}))
vi.mock('../pollingManager', () => ({ subscribePolling: vi.fn(() => () => {}) }))
vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: vi.fn(() => () => {}),
}))
vi.mock('./shared', () => ({
  fetchInClusterCollection: vi.fn(),
}))

// ---------------------------------------------------------------------------
// getDemoDeploymentIssues
// ---------------------------------------------------------------------------
describe('getDemoDeploymentIssues', () => {
  it('returns an array of DeploymentIssue objects', () => {
    const issues = getDemoDeploymentIssues()
    expect(Array.isArray(issues)).toBe(true)
    expect(issues.length).toBeGreaterThan(0)
  })

  it('each issue has required fields', () => {
    const issues = getDemoDeploymentIssues()
    for (const issue of issues) {
      expect(typeof issue.name).toBe('string')
      expect(typeof issue.namespace).toBe('string')
      expect(typeof issue.cluster).toBe('string')
      expect(typeof issue.replicas).toBe('number')
      expect(typeof issue.readyReplicas).toBe('number')
      expect(typeof issue.reason).toBe('string')
      expect(typeof issue.message).toBe('string')
    }
  })

  it('readyReplicas < replicas for issue pods', () => {
    const issues = getDemoDeploymentIssues()
    for (const issue of issues) {
      expect(issue.readyReplicas).toBeLessThan(issue.replicas)
    }
  })

  it('returns fresh array on each call', () => {
    const a = getDemoDeploymentIssues()
    const b = getDemoDeploymentIssues()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('reason field is a non-empty string', () => {
    const issues = getDemoDeploymentIssues()
    for (const issue of issues) {
      expect(issue.reason.length).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// getDemoDeployments
// ---------------------------------------------------------------------------
describe('getDemoDeployments', () => {
  it('returns an array of Deployment objects', () => {
    const deployments = getDemoDeployments()
    expect(Array.isArray(deployments)).toBe(true)
    expect(deployments.length).toBeGreaterThan(0)
  })

  it('each deployment has required fields', () => {
    const deployments = getDemoDeployments()
    for (const d of deployments) {
      expect(typeof d.name).toBe('string')
      expect(typeof d.namespace).toBe('string')
      expect(typeof d.cluster).toBe('string')
      expect(typeof d.status).toBe('string')
      expect(typeof d.replicas).toBe('number')
      expect(typeof d.readyReplicas).toBe('number')
      expect(typeof d.updatedReplicas).toBe('number')
      expect(typeof d.availableReplicas).toBe('number')
      expect(typeof d.progress).toBe('number')
      expect(typeof d.image).toBe('string')
      expect(typeof d.age).toBe('string')
    }
  })

  it('progress is in [0, 100]', () => {
    const deployments = getDemoDeployments()
    for (const d of deployments) {
      expect(d.progress).toBeGreaterThanOrEqual(0)
      expect(d.progress).toBeLessThanOrEqual(100)
    }
  })

  it('status values are valid', () => {
    const valid = new Set(['running', 'deploying', 'failed', 'pending'])
    const deployments = getDemoDeployments()
    for (const d of deployments) {
      expect(valid.has(d.status)).toBe(true)
    }
  })

  it('running deployments have readyReplicas === replicas', () => {
    const deployments = getDemoDeployments()
    const running = deployments.filter((d) => d.status === 'running')
    expect(running.length).toBeGreaterThan(0)
    for (const d of running) {
      expect(d.readyReplicas).toBe(d.replicas)
      expect(d.progress).toBe(100)
    }
  })

  it('image field contains a colon (name:tag format)', () => {
    const deployments = getDemoDeployments()
    for (const d of deployments) {
      expect(d.image).toContain(':')
    }
  })

  it('returns fresh array on each call', () => {
    const a = getDemoDeployments()
    const b = getDemoDeployments()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// ---------------------------------------------------------------------------
// resetDeploymentsCache
// ---------------------------------------------------------------------------
describe('resetDeploymentsCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('does not throw', () => {
    expect(() => resetDeploymentsCache()).not.toThrow()
  })

  it('can be called multiple times without error', () => {
    resetDeploymentsCache()
    resetDeploymentsCache()
    resetDeploymentsCache()
  })
})
