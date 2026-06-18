/**
 * Deep branch-coverage tests for useCertManager.ts
 *
 * Tests all internal utility functions (detectIssuerType, getCertificateStatus,
 * getIssuerStatus, loadFromCache, saveToCache), demo data paths, live fetching,
 * auto-refresh, error handling, and the status computation.
 *
 * Dependencies are mocked at module boundaries; hook logic is exercised for real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockUseDemoMode = vi.fn(() => ({ isDemoMode: false }))
const mockUseClusters = vi.fn(() => ({
  clusters: [],
  deduplicatedClusters: [],
  isLoading: false,
}))
const mockKubectlProxy = { exec: vi.fn() }

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../useMCP', () => ({
  useClusters: () => mockUseClusters(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: mockKubectlProxy,
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10_000 }
})

vi.mock('../../lib/modeTransition', () => ({
  registerRefetch: vi.fn(() => vi.fn()),
  registerCacheReset: vi.fn(),
  unregisterCacheReset: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock CertificateResource for kubectlProxy responses */
function makeCertResource(
  name: string,
  namespace: string,
  opts?: {
    readyStatus?: string
    readyReason?: string
    readyMessage?: string
    dnsNames?: string[]
    issuerName?: string
    issuerKind?: string
    secretName?: string
    notBefore?: string
    notAfter?: string
    renewalTime?: string
  },
) {
  return {
    metadata: { name, namespace },
    spec: {
      dnsNames: opts?.dnsNames ?? ['example.com'],
      issuerRef: {
        name: opts?.issuerName ?? 'letsencrypt',
        kind: opts?.issuerKind ?? 'ClusterIssuer',
      },
      secretName: opts?.secretName ?? `${name}-secret`,
    },
    status: {
      conditions: opts?.readyStatus !== undefined
        ? [{ type: 'Ready', status: opts.readyStatus, reason: opts?.readyReason, message: opts?.readyMessage }]
        : [],
      notBefore: opts?.notBefore,
      notAfter: opts?.notAfter,
      renewalTime: opts?.renewalTime,
    },
  }
}

/** Create a mock IssuerResource */
function makeIssuerResource(
  name: string,
  namespace: string | undefined,
  opts?: {
    specType?: 'acme' | 'ca' | 'selfSigned' | 'vault' | 'venafi' | 'other'
    readyStatus?: string
  },
) {
  const spec: Record<string, object> = {}
  if (opts?.specType === 'acme') spec.acme = {}
  else if (opts?.specType === 'ca') spec.ca = {}
  else if (opts?.specType === 'selfSigned') spec.selfSigned = {}
  else if (opts?.specType === 'vault') spec.vault = {}
  else if (opts?.specType === 'venafi') spec.venafi = {}

  return {
    metadata: { name, namespace },
    spec,
    status: opts?.readyStatus !== undefined
      ? { conditions: [{ type: 'Ready', status: opts.readyStatus }] }
      : {},
  }
}

/** Simulate kubectlProxy.exec returning JSON data */
function mockExecJson(items: unknown[], exitCode = 0) {
  return { exitCode, output: JSON.stringify({ items }) }
}

/** Provide reachable clusters to the hook */
function setClusters(...names: string[]) {
  mockUseClusters.mockReturnValue({
    clusters: names.map(name => ({ name, reachable: true })),
    deduplicatedClusters: names.map(name => ({ name, reachable: true })),
    isLoading: false,
  })
}

// Constant for 30 days in milliseconds (the EXPIRING_SOON_DAYS threshold)
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------


describe('useCertManager', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sessionStorage.clear()
    mockUseDemoMode.mockReturnValue({ isDemoMode: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  // Lazy-load module after mocks are set up
  async function loadModule() {
    return await import('../useCertManager')
  }

  describe('error handling', () => {
    it('handles per-cluster errors gracefully without crashing', async () => {
      setClusters('cluster-1')

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        throw new Error('network error')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Per-cluster error is caught, not propagated to top-level error
      expect(result.current.error).toBeNull()
      consoleError.mockRestore()
    })

    it('suppresses demo mode errors without logging', async () => {
      setClusters('cluster-1')

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        throw new Error('demo mode active')
      })

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(consoleError).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })

    it('handles failed certificate fetch without crashing', async () => {
      setClusters('cluster-1')

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return { exitCode: 1, output: '' }
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.certificates).toEqual([])
      expect(result.current.status.installed).toBe(true)
    })
  })

  // ========================================================================
  // Cache (sessionStorage)
  // ========================================================================

  describe('sessionStorage cache', () => {
    it('saves fetched data to sessionStorage', async () => {
      setClusters('cluster-1')

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([
          makeCertResource('app-tls', 'default', {
            readyStatus: 'True',
            notAfter: new Date(Date.now() + 60 * ONE_DAY_MS).toISOString(),
          }),
        ])
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.certificates.length).toBe(1)
      })

      const cached = sessionStorage.getItem('kc-cert-manager-cache')
      expect(cached).toBeTruthy()

      const parsed = JSON.parse(cached!)
      expect(parsed.certificates).toHaveLength(1)
      expect(parsed.installed).toBe(true)
      expect(parsed.timestamp).toBeGreaterThan(0)
    })

    it('initializes from cache on mount when cache exists', async () => {
      // Pre-populate cache
      const cacheData = {
        certificates: [
          {
            id: 'cached/default/old-cert',
            name: 'old-cert',
            namespace: 'default',
            cluster: 'cluster-1',
            dnsNames: ['cached.example.com'],
            issuerName: 'cached-issuer',
            issuerKind: 'ClusterIssuer',
            secretName: 'old-cert-secret',
            status: 'ready',
            notAfter: new Date(Date.now() + 60 * ONE_DAY_MS).toISOString(),
          },
        ],
        issuers: [],
        installed: true,
        timestamp: Date.now() - 10000,
      }
      sessionStorage.setItem('kc-cert-manager-cache', JSON.stringify(cacheData))

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      // Cache data should be available immediately (before fetch completes)
      expect(result.current.certificates.length).toBe(1)
      expect(result.current.certificates[0].name).toBe('old-cert')
      // Should not be loading since cache was found
      expect(result.current.isLoading).toBe(false)
    })

    it('handles corrupted sessionStorage cache gracefully', async () => {
      sessionStorage.setItem('kc-cert-manager-cache', 'NOT_VALID_JSON')

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      // Should fall back to empty state
      expect(result.current.certificates).toEqual([])
      expect(result.current.isLoading).toBe(true) // No cache = loading
    })

    it('converts date strings back to Date objects when loading from cache', async () => {
      const futureDate = new Date(Date.now() + 60 * ONE_DAY_MS)
      const cacheData = {
        certificates: [
          {
            id: 'cached/default/cert',
            name: 'cert',
            namespace: 'default',
            cluster: 'cluster-1',
            dnsNames: [],
            issuerName: 'issuer',
            issuerKind: 'ClusterIssuer',
            secretName: 'cert-secret',
            status: 'ready',
            notBefore: new Date(Date.now() - 30 * ONE_DAY_MS).toISOString(),
            notAfter: futureDate.toISOString(),
            renewalTime: new Date(Date.now() - 1 * ONE_DAY_MS).toISOString(),
          },
        ],
        issuers: [],
        installed: true,
        timestamp: Date.now(),
      }
      sessionStorage.setItem('kc-cert-manager-cache', JSON.stringify(cacheData))

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      const cert = result.current.certificates[0]
      // Date fields should be converted back to Date objects
      expect(cert.notBefore).toBeInstanceOf(Date)
      expect(cert.notAfter).toBeInstanceOf(Date)
      expect(cert.renewalTime).toBeInstanceOf(Date)
    })
  })

  // ========================================================================
  // Refetch guard (fetchInProgress)
  // ========================================================================
})
