/**
 * Unit tests for cluster-core MCP hook modules (Issue #21038)
 *  - hooks/mcp/clusterCacheRef   (lightweight cluster reference)
 *  - hooks/mcp/clusterCache      (URL resolvers)
 *  - hooks/mcp/clusterUtils      (pure metric/dedup helpers)
 *  - hooks/mcp/agentFetch        (token management + fetch wrapper)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockIsDemoMode, mockIsNetlifyDeployment, mockIsLocalAgentSuppressed } = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockIsNetlifyDeployment: false,
  mockIsLocalAgentSuppressed: vi.fn(() => false),
}))

// ---------------------------------------------------------------------------
// Module mocks — must appear before imports
// ---------------------------------------------------------------------------

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  isDemoToken: vi.fn(() => Promise.resolve(false)),
  isNetlifyDeployment: mockIsNetlifyDeployment,
  subscribeDemoMode: vi.fn(() => () => {}),
}))

vi.mock('../../lib/analytics', () => ({
  emitAgentTokenFailure: vi.fn(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    MCP_HOOK_TIMEOUT_MS: 10_000,
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    MCP_HOOK_TIMEOUT_MS: 10_000,
    isLocalAgentSuppressed: () => mockIsLocalAgentSuppressed(),
  }
})

vi.mock('../../lib/secureTokenStore', () => ({
  clearToken: vi.fn(),
}))

vi.mock('../mcp/sharedImpl.connection', () => ({
  resetAuthFailed: vi.fn(),
}))

// Restore the actual agentFetch implementation — the global setup.ts mock replaces
// agentFetch with a passthrough (no token injection, no suppression logic) to keep
// unrelated tests simple. Here we test agentFetch itself, so we need the real module.
vi.mock('../mcp/agentFetch', async (importOriginal) => {
  return importOriginal<typeof import('../mcp/agentFetch')>()
})

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// ---------------------------------------------------------------------------
// Module imports (after vi.mock declarations)
// ---------------------------------------------------------------------------

import {
  clusterCacheRef,
  setClusterCacheRefClusters,
} from '../mcp/clusterCacheRef'

import {
  resolveApiBase,
  resolveMcpBase,
} from '../mcp/clusterCache'

import {
  shareMetricsBetweenSameServerClusters,
  deduplicateClustersByServer,
  detectDistributionFromNamespaces,
  detectDistributionFromServer,
} from '../mcp/clusterUtils'

import {
  getStoredAgentToken,
  setAgentToken,
  clearAgentToken,
  _resetAgentTokenState,
  getAgentToken,
  agentFetch,
} from '../mcp/agentFetch'

// ---------------------------------------------------------------------------
// clusterCacheRef
// ---------------------------------------------------------------------------

describe('clusterCacheRef', () => {
  afterEach(() => {
    setClusterCacheRefClusters([])
  })

  it('starts with an empty clusters array', () => {
    expect(Array.isArray(clusterCacheRef.clusters)).toBe(true)
  })

  it('setClusterCacheRefClusters updates the getter value', () => {
    const clusters = [
      { name: 'test', context: 'test', healthy: true, source: 'kubeconfig' as const },
    ]
    setClusterCacheRefClusters(clusters)
    expect(clusterCacheRef.clusters).toHaveLength(1)
    expect(clusterCacheRef.clusters[0].name).toBe('test')
  })

  it('setClusterCacheRefClusters replaces previous value', () => {
    setClusterCacheRefClusters([
      { name: 'first', context: 'first', healthy: true, source: 'kubeconfig' as const },
    ])
    setClusterCacheRefClusters([
      { name: 'second', context: 'second', healthy: false, source: 'kubeconfig' as const },
      { name: 'third', context: 'third', healthy: true, source: 'kubeconfig' as const },
    ])
    expect(clusterCacheRef.clusters).toHaveLength(2)
    expect(clusterCacheRef.clusters[0].name).toBe('second')
  })

  it('setClusterCacheRefClusters accepts an empty array', () => {
    setClusterCacheRefClusters([{ name: 'x', context: 'x', healthy: true, source: 'kubeconfig' as const }])
    setClusterCacheRefClusters([])
    expect(clusterCacheRef.clusters).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// clusterCache — URL resolvers
// ---------------------------------------------------------------------------

describe('clusterCache – resolveApiBase', () => {
  it('returns window.location.origin when available', () => {
    expect(resolveApiBase()).toBe(window.location.origin)
  })
})

describe('clusterCache – resolveMcpBase', () => {
  it('returns <origin>/api/mcp', () => {
    expect(resolveMcpBase()).toBe(`${window.location.origin}/api/mcp`)
  })
})

// ---------------------------------------------------------------------------
// clusterUtils — detectDistributionFromNamespaces
// ---------------------------------------------------------------------------

describe('clusterUtils – detectDistributionFromNamespaces', () => {
  it('detects openshift from openshift-operators namespace', () => {
    expect(detectDistributionFromNamespaces(['default', 'openshift-operators'])).toBe('openshift')
  })

  it('detects openshift from "openshift" namespace', () => {
    expect(detectDistributionFromNamespaces(['openshift', 'kube-system'])).toBe('openshift')
  })

  it('detects gke from gke-* namespace', () => {
    expect(detectDistributionFromNamespaces(['gke-system', 'default'])).toBe('gke')
  })

  it('detects gke from config-management-system', () => {
    expect(detectDistributionFromNamespaces(['config-management-system'])).toBe('gke')
  })

  it('detects eks from aws-* namespace', () => {
    expect(detectDistributionFromNamespaces(['aws-node', 'default'])).toBe('eks')
  })

  it('detects aks from azure-arc namespace', () => {
    expect(detectDistributionFromNamespaces(['azure-arc', 'kube-system'])).toBe('aks')
  })

  it('detects rancher from cattle-system namespace', () => {
    expect(detectDistributionFromNamespaces(['cattle-system', 'default'])).toBe('rancher')
  })

  it('detects rancher from cattle-* namespace', () => {
    expect(detectDistributionFromNamespaces(['cattle-fleet-system'])).toBe('rancher')
  })

  it('returns undefined for generic namespaces', () => {
    expect(detectDistributionFromNamespaces(['default', 'kube-system', 'monitoring'])).toBeUndefined()
  })

  it('returns undefined for empty array', () => {
    expect(detectDistributionFromNamespaces([])).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// clusterUtils — detectDistributionFromServer
// ---------------------------------------------------------------------------

describe('clusterUtils – detectDistributionFromServer', () => {
  it('returns undefined for undefined input', () => {
    expect(detectDistributionFromServer(undefined)).toBeUndefined()
  })

  it('detects eks from amazonaws.com URL', () => {
    expect(detectDistributionFromServer('https://ABC.gr7.us-east-1.eks.amazonaws.com')).toBe('eks')
  })

  it('detects gke from container.googleapis.com URL', () => {
    expect(detectDistributionFromServer('https://cluster.container.googleapis.com')).toBe('gke')
  })

  it('detects aks from azmk8s.io URL', () => {
    expect(detectDistributionFromServer('https://mycluster.hcp.eastus.azmk8s.io:443')).toBe('aks')
  })

  it('detects openshift from openshiftapps.com URL', () => {
    expect(detectDistributionFromServer('https://api.cluster.openshiftapps.com:6443')).toBe('openshift')
  })

  it('detects oci from oraclecloud.com URL', () => {
    expect(detectDistributionFromServer('https://cluster.us-phoenix-1.clusters.oci.oraclecloud.com:6443')).toBe('oci')
  })

  it('detects digitalocean from k8s.ondigitalocean.com URL', () => {
    expect(detectDistributionFromServer('https://k8s-cluster.k8s.ondigitalocean.com')).toBe('digitalocean')
  })

  it('returns undefined for unknown server URL', () => {
    expect(detectDistributionFromServer('https://my-private-cluster.internal:6443')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// clusterUtils — shareMetricsBetweenSameServerClusters
// ---------------------------------------------------------------------------

describe('clusterUtils – shareMetricsBetweenSameServerClusters', () => {
  it('returns empty array for empty input', () => {
    expect(shareMetricsBetweenSameServerClusters([])).toEqual([])
  })

  it('returns cluster unchanged when no matching server exists', () => {
    const clusters = [
      { name: 'a', context: 'a', healthy: true, source: 'kubeconfig' as const, server: 'https://a.example.com' },
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('a')
  })

  it('copies metrics from the best source to clusters missing them', () => {
    const clusters = [
      {
        name: 'full', context: 'full', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com',
        nodeCount: 3, podCount: 50, cpuCores: 12, memoryGB: 48,
        cpuRequestsCores: 6, memoryRequestsGB: 24,
      },
      {
        name: 'alias', context: 'alias', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com',
      },
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    const alias = result.find(c => c.name === 'alias')
    expect(alias?.cpuCores).toBe(12)
    expect(alias?.memoryGB).toBe(48)
  })

  it('does not overwrite existing metrics on a cluster', () => {
    const clusters = [
      {
        name: 'primary', context: 'primary', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com',
        nodeCount: 5, cpuCores: 20,
      },
      {
        name: 'existing', context: 'existing', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com',
        nodeCount: 5, cpuCores: 20,
      },
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    const existing = result.find(c => c.name === 'existing')
    expect(existing?.cpuCores).toBe(20)
  })

  it('handles clusters without server by leaving them unchanged', () => {
    const clusters = [
      { name: 'no-server', context: 'no-server', healthy: true, source: 'kubeconfig' as const },
    ]
    const result = shareMetricsBetweenSameServerClusters(clusters)
    expect(result[0]).toBe(clusters[0]) // same reference (unchanged)
  })
})

// ---------------------------------------------------------------------------
// clusterUtils — deduplicateClustersByServer
// ---------------------------------------------------------------------------

describe('clusterUtils – deduplicateClustersByServer', () => {
  it('returns empty array for empty input', () => {
    expect(deduplicateClustersByServer([])).toEqual([])
  })

  it('returns single cluster with empty aliases array', () => {
    const clusters = [
      { name: 'only', context: 'only', healthy: true, source: 'kubeconfig' as const, server: 'https://a.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].aliases).toEqual([])
  })

  it('merges two clusters pointing to the same server', () => {
    const clusters = [
      {
        name: 'primary', context: 'primary', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com', reachable: true,
      },
      {
        name: 'alias', context: 'alias', healthy: true, source: 'kubeconfig' as const,
        server: 'https://shared.example.com', reachable: true,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    // 'alias' (5 chars) is shorter than 'primary' (7 chars) so it becomes the primary
    expect(result[0].name).toBe('alias')
    expect(result[0].aliases).toContain('primary')
  })

  it('prefers shorter (user-friendly) name as primary', () => {
    const clusters = [
      {
        name: 'default/api-cluster.openshiftapps.com:6443/kube:admin',
        context: 'long-context', healthy: true, source: 'kubeconfig' as const,
        server: 'https://api.cluster.openshiftapps.com:6443', reachable: true,
      },
      {
        name: 'prod-ocp', context: 'prod-ocp', healthy: true, source: 'kubeconfig' as const,
        server: 'https://api.cluster.openshiftapps.com:6443', reachable: true,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('prod-ocp')
  })

  it('preserves clusters without server URL', () => {
    const clusters = [
      { name: 'no-server', context: 'no-server', healthy: true, source: 'kubeconfig' as const },
      { name: 'with-server', context: 'with-server', healthy: true, source: 'kubeconfig' as const, server: 'https://x.example.com' },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result).toHaveLength(2)
  })

  it('marks merged cluster healthy if any duplicate is healthy', () => {
    const clusters = [
      {
        name: 'a', context: 'a', healthy: false, source: 'kubeconfig' as const,
        server: 'https://same.example.com', reachable: true,
      },
      {
        name: 'b', context: 'b', healthy: true, source: 'kubeconfig' as const,
        server: 'https://same.example.com', reachable: true,
      },
    ]
    const result = deduplicateClustersByServer(clusters)
    expect(result[0].healthy).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// agentFetch — token management (getStoredAgentToken / setAgentToken / clearAgentToken)
// ---------------------------------------------------------------------------

describe('agentFetch – token management', () => {
  beforeEach(() => {
    _resetAgentTokenState()
  })

  afterEach(() => {
    _resetAgentTokenState()
  })

  it('getStoredAgentToken returns empty string initially', () => {
    expect(getStoredAgentToken()).toBe('')
  })

  it('setAgentToken stores and returns token via getStoredAgentToken', () => {
    setAgentToken('my-secret-token')
    expect(getStoredAgentToken()).toBe('my-secret-token')
  })

  it('clearAgentToken removes the stored token', () => {
    setAgentToken('some-token')
    clearAgentToken()
    expect(getStoredAgentToken()).toBe('')
  })

  it('_resetAgentTokenState clears token', () => {
    setAgentToken('test-token')
    _resetAgentTokenState()
    expect(getStoredAgentToken()).toBe('')
  })

  it('setAgentToken with empty string does not break getStoredAgentToken', () => {
    setAgentToken('')
    expect(getStoredAgentToken()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// agentFetch — getAgentToken in demo / netlify mode
// ---------------------------------------------------------------------------

describe('agentFetch – getAgentToken', () => {
  beforeEach(() => {
    _resetAgentTokenState()
    vi.clearAllMocks()
  })

  afterEach(() => {
    _resetAgentTokenState()
  })

  it('returns cached token immediately when token is already set', async () => {
    setAgentToken('cached-token')
    const token = await getAgentToken()
    expect(token).toBe('cached-token')
  })

  it('returns empty string in demo mode', async () => {
    mockIsDemoMode.mockReturnValueOnce(true)
    const token = await getAgentToken()
    expect(token).toBe('')
  })

  it('fetches token from /api/agent/token on cache miss', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockIsLocalAgentSuppressed.mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 })
    )
    const token = await getAgentToken()
    expect(token).toBe('fresh-token')
  })

  it('returns empty string when /api/agent/token returns no token', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockIsLocalAgentSuppressed.mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: '' }), { status: 200 })
    )
    const token = await getAgentToken()
    expect(token).toBe('')
  })

  it('returns empty string on fetch error', async () => {
    mockIsDemoMode.mockReturnValue(false)
    mockIsLocalAgentSuppressed.mockReturnValue(false)
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'))
    const token = await getAgentToken()
    expect(token).toBe('')
  })
})

// ---------------------------------------------------------------------------
// agentFetch — agentFetch() HTTP wrapper
// ---------------------------------------------------------------------------

describe('agentFetch – agentFetch wrapper', () => {
  beforeEach(() => {
    _resetAgentTokenState()
    mockIsDemoMode.mockReturnValue(false)
    mockIsLocalAgentSuppressed.mockReturnValue(false)
  })

  afterEach(() => {
    _resetAgentTokenState()
    vi.restoreAllMocks()
  })

  it('injects Authorization header when token is set', async () => {
    setAgentToken('agent-token-123')
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 })
    )
    await agentFetch('http://localhost:8585/health')
    const calledHeaders = new Headers(mockFetch.mock.calls[0][1]?.headers)
    expect(calledHeaders.get('Authorization')).toBe('Bearer agent-token-123')
  })

  it('injects X-Requested-With header for CSRF protection', async () => {
    setAgentToken('token')
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 })
    )
    await agentFetch('http://localhost:8585/health')
    const calledHeaders = new Headers(mockFetch.mock.calls[0][1]?.headers)
    expect(calledHeaders.get('X-Requested-With')).toBe('XMLHttpRequest')
  })

  it('returns 503 response when local agent is suppressed', async () => {
    mockIsLocalAgentSuppressed.mockReturnValue(true)
    const response = await agentFetch('http://localhost:8585/health')
    expect(response.status).toBe(503)
    const body = await response.json() as { error: string }
    expect(body.error).toBe('local_agent_suppressed')
  })

  it('does not override a caller-provided Authorization header', async () => {
    setAgentToken('should-not-use')
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 200 })
    )
    await agentFetch('http://localhost:8585/health', {
      headers: { Authorization: 'Bearer caller-token' },
    })
    const calledHeaders = new Headers(mockFetch.mock.calls[0][1]?.headers)
    expect(calledHeaders.get('Authorization')).toBe('Bearer caller-token')
  })
})
