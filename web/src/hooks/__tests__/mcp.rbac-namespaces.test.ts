/**
 * Unit tests for RBAC & namespace MCP hook modules (Issue #21039)
 *  - hooks/mcp/rbac       (useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts)
 *  - hooks/mcp/namespaces (useNamespaces, useNamespaceStats)
 *  - hooks/mcp/config     (useConfigMaps, useSecrets, useServiceAccounts)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockIsDemoMode, mockUseDemoMode, mockIsAgentUnavailable } = vi.hoisted(() => ({
  mockIsDemoMode: vi.fn(() => false),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockIsAgentUnavailable: vi.fn(() => true),
}))

// ---------------------------------------------------------------------------
// Module mocks — must appear before module imports
// ---------------------------------------------------------------------------

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
  isDemoToken: vi.fn(() => Promise.resolve(false)),
  isNetlifyDeployment: false,
  subscribeDemoMode: vi.fn(() => () => {}),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../lib/api', () => ({
  api: {
    get: vi.fn(() => Promise.reject(new Error('api-unavailable'))),
  },
  isBackendUnavailable: vi.fn(() => false),
  authFetch: vi.fn(() => Promise.reject(new Error('api-unavailable'))),
}))

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => () => {}),
  clearAllRegisteredCaches: vi.fn(),
  triggerAllRefetches: vi.fn(),
  registerCacheReset: vi.fn(() => () => {}),
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    RBAC_QUERY_TIMEOUT_MS: 10_000,
    MCP_HOOK_TIMEOUT_MS: 10_000,
    LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
    isLocalAgentSuppressed: vi.fn(() => false),
  }
})

vi.mock('../useLocalAgent', () => ({
  reportAgentDataSuccess: vi.fn(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
  triggerAggressiveDetection: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    getNamespaces: vi.fn(),
    getPods: vi.fn(),
    exec: vi.fn(),
  },
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(() => Promise.reject(new Error('agent-unavailable'))),
  getLocalAgentURL: vi.fn(() => 'http://127.0.0.1:8585'),
  clusterCacheRef: { clusters: [] },
}))

vi.mock('../../lib/sseClient', () => ({
  fetchSSE: vi.fn(() => Promise.reject(new Error('sse-unavailable'))),
}))

vi.mock('../../lib/authToken', () => ({
  getStoredAuthToken: vi.fn(() => Promise.resolve('')),
  getStoredAuthTokenSync: vi.fn(() => ''),
  setStoredAuthToken: vi.fn(),
}))

vi.mock('../../lib/cache/fetcherUtils', () => ({
  getClusterModeBaseUrl: vi.fn(() => ''),
  isClusterModeBackend: vi.fn(() => false),
}))

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

import { useK8sRoles, useK8sRoleBindings, useK8sServiceAccounts } from '../mcp/rbac'
import { useNamespaces, useNamespaceStats } from '../mcp/namespaces'
import { useConfigMaps, useSecrets, useServiceAccounts } from '../mcp/config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enableDemoMode(): void {
  mockIsDemoMode.mockReturnValue(true)
  mockUseDemoMode.mockReturnValue({ isDemoMode: true })
}

function disableDemoMode(): void {
  mockIsDemoMode.mockReturnValue(false)
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
}

// ---------------------------------------------------------------------------
// useK8sRoles — demo mode
// ---------------------------------------------------------------------------

describe('useK8sRoles – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns a non-empty roles list', async () => {
    const { result } = renderHook(() => useK8sRoles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters roles by cluster', async () => {
    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = new Set(result.current.roles.map(r => r.cluster))
    expect([...clusterNames]).toEqual(['eks-prod-us-east-1'])
  })

  it('returns empty list for an unknown cluster', async () => {
    const { result } = renderHook(() => useK8sRoles('no-such-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })

  it('exposes a callable refetch function', async () => {
    const { result } = renderHook(() => useK8sRoles())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.refetch).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// useK8sRoles — no cluster (live mode)
// ---------------------------------------------------------------------------

describe('useK8sRoles – no cluster', () => {
  beforeEach(() => disableDemoMode())

  it('returns empty roles and stops loading when cluster is undefined', async () => {
    const { result } = renderHook(() => useK8sRoles(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.roles).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// useK8sRoles — API error falls back to demo data
// ---------------------------------------------------------------------------

describe('useK8sRoles – API error fallback', () => {
  beforeEach(() => disableDemoMode())

  it('falls back to demo data and clears error when API rejects', async () => {
    // api.get mock always rejects (set in vi.mock factory above)
    const { result } = renderHook(() => useK8sRoles('eks-prod-us-east-1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.roles.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// useK8sRoleBindings — demo mode
// ---------------------------------------------------------------------------

describe('useK8sRoleBindings – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns a non-empty bindings list', async () => {
    const { result } = renderHook(() => useK8sRoleBindings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters bindings by cluster', async () => {
    const { result } = renderHook(() => useK8sRoleBindings('gke-staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = new Set(result.current.bindings.map(b => b.cluster))
    expect([...clusterNames]).toEqual(['gke-staging'])
  })

  it('only returns namespace-scoped bindings for the requested namespace', async () => {
    const { result } = renderHook(() =>
      useK8sRoleBindings('eks-prod-us-east-1', 'default')
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Namespace-scoped bindings should all be in 'default' or be cluster-wide
    const nsBindings = result.current.bindings.filter(b => !b.isCluster)
    expect(nsBindings.every(b => b.namespace === 'default')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// useK8sRoleBindings — no cluster
// ---------------------------------------------------------------------------

describe('useK8sRoleBindings – no cluster', () => {
  beforeEach(() => disableDemoMode())

  it('returns empty bindings when cluster is undefined', async () => {
    const { result } = renderHook(() => useK8sRoleBindings(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.bindings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// useK8sServiceAccounts — demo mode
// ---------------------------------------------------------------------------

describe('useK8sServiceAccounts – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns service accounts in demo mode', async () => {
    const { result } = renderHook(() => useK8sServiceAccounts())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters service accounts by cluster', async () => {
    const { result } = renderHook(() => useK8sServiceAccounts('gke-staging'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = new Set(result.current.serviceAccounts.map(sa => sa.cluster))
    expect([...clusterNames]).toEqual(['gke-staging'])
  })

  it('filters service accounts by namespace', async () => {
    const { result } = renderHook(() =>
      useK8sServiceAccounts('eks-prod-us-east-1', 'monitoring')
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const namespaces = new Set(result.current.serviceAccounts.map(sa => sa.namespace))
    expect([...namespaces]).toEqual(['monitoring'])
  })
})

// ---------------------------------------------------------------------------
// useNamespaces — demo mode
// ---------------------------------------------------------------------------

describe('useNamespaces – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns synthetic namespaces including "default" and "kube-system"', async () => {
    const { result } = renderHook(() => useNamespaces('my-cluster'))
    // Wait for namespaces to be populated (isLoading starts false in this hook)
    await waitFor(() => expect(result.current.namespaces.length).toBeGreaterThan(0))
    expect(result.current.namespaces).toContain('default')
    expect(result.current.namespaces).toContain('kube-system')
    expect(result.current.error).toBeNull()
  })

  it('returns empty namespaces when cluster is undefined', async () => {
    const { result } = renderHook(() => useNamespaces(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// useNamespaces — no cluster, live mode
// ---------------------------------------------------------------------------

describe('useNamespaces – no cluster (live)', () => {
  beforeEach(() => disableDemoMode())

  it('returns empty and not loading when cluster is undefined', async () => {
    const { result } = renderHook(() => useNamespaces(undefined))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.namespaces).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// useNamespaceStats
// ---------------------------------------------------------------------------

describe('useNamespaceStats', () => {
  beforeEach(() => disableDemoMode())

  it('returns empty stats when cluster is undefined', async () => {
    const { result } = renderHook(() => useNamespaceStats(undefined))
    // No cluster → setStats([]) synchronously, isLoading stays false
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.stats).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('falls back to demo stats on agent fetch error', async () => {
    // agentFetch mock rejects → catch → getDemoNamespaceStats()
    const { result } = renderHook(() => useNamespaceStats('my-cluster'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.stats.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// useConfigMaps — demo mode
// ---------------------------------------------------------------------------

describe('useConfigMaps – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns configmaps in demo mode', async () => {
    const { result } = renderHook(() => useConfigMaps())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.configmaps.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters configmaps by cluster', async () => {
    const { result } = renderHook(() => useConfigMaps('prod-east'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusterNames = new Set(result.current.configmaps.map(cm => cm.cluster))
    expect([...clusterNames]).toEqual(['prod-east'])
  })

  it('filters configmaps by namespace', async () => {
    const { result } = renderHook(() => useConfigMaps('prod-east', 'default'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const namespaces = new Set(result.current.configmaps.map(cm => cm.namespace))
    expect([...namespaces]).toEqual(['default'])
  })
})

// ---------------------------------------------------------------------------
// useSecrets — demo mode
// ---------------------------------------------------------------------------

describe('useSecrets – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns secrets in demo mode', async () => {
    const { result } = renderHook(() => useSecrets())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.secrets.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })

  it('filters secrets by cluster and namespace', async () => {
    const { result } = renderHook(() => useSecrets('prod-east', 'production'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const clusters = new Set(result.current.secrets.map(s => s.cluster))
    const namespaces = new Set(result.current.secrets.map(s => s.namespace))
    expect([...clusters]).toEqual(['prod-east'])
    expect([...namespaces]).toEqual(['production'])
  })
})

// ---------------------------------------------------------------------------
// useServiceAccounts (config.ts) — demo mode
// ---------------------------------------------------------------------------

describe('useServiceAccounts (config) – demo mode', () => {
  beforeEach(() => {
    enableDemoMode()
    vi.clearAllMocks()
    enableDemoMode()
  })

  it('returns service accounts in demo mode', async () => {
    const { result } = renderHook(() => useServiceAccounts())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.serviceAccounts.length).toBeGreaterThan(0)
    expect(result.current.error).toBeNull()
  })
})
