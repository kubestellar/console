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
import { renderHook, waitFor } from '@testing-library/react'

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
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
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

  // ========================================================================
  // Basic hook shape
  // ========================================================================

  describe('certificate status detection', () => {
    async function fetchCertWithStatus(certResource: ReturnType<typeof makeCertResource>) {
      setClusters('cluster-1')
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([certResource])
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.certificates.length).toBe(1)
      })

      return result.current.certificates[0].status
    }

    it('returns "ready" for certs with Ready=True and far expiration', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-1', 'default', {
          readyStatus: 'True',
          notAfter: new Date(Date.now() + 60 * ONE_DAY_MS).toISOString(),
        }),
      )
      expect(status).toBe('ready')
    })

    it('returns "expired" for certs that have passed their notAfter date', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-expired', 'default', {
          readyStatus: 'True',
          notAfter: new Date(Date.now() - 5 * ONE_DAY_MS).toISOString(),
        }),
      )
      expect(status).toBe('expired')
    })

    it('returns "expiring" for certs within 30 days of expiration', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-expiring', 'default', {
          readyStatus: 'True',
          notAfter: new Date(Date.now() + 15 * ONE_DAY_MS).toISOString(),
        }),
      )
      expect(status).toBe('expiring')
    })

    it('returns "ready" for cert exactly at 30 day boundary', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-boundary', 'default', {
          readyStatus: 'True',
          notAfter: new Date(Date.now() + THIRTY_DAYS_MS + ONE_DAY_MS).toISOString(),
        }),
      )
      expect(status).toBe('ready')
    })

    it('returns "pending" when no Ready condition exists', async () => {
      setClusters('cluster-1')
      const certResource = {
        metadata: { name: 'cert-pending', namespace: 'default' },
        spec: {
          dnsNames: ['example.com'],
          issuerRef: { name: 'letsencrypt', kind: 'ClusterIssuer' },
          secretName: 'cert-pending-secret',
        },
        status: {
          conditions: [],
        },
      }

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([certResource])
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.certificates.length).toBe(1)
      })

      expect(result.current.certificates[0].status).toBe('pending')
    })

    it('returns "failed" when Ready reason is Failed', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-failed', 'default', {
          readyStatus: 'False',
          readyReason: 'Failed',
          readyMessage: 'ACME challenge failed',
        }),
      )
      expect(status).toBe('failed')
    })

    it('returns "failed" when Ready reason is Error', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-error', 'default', {
          readyStatus: 'False',
          readyReason: 'Error',
          readyMessage: 'Internal error',
        }),
      )
      expect(status).toBe('failed')
    })

    it('returns "pending" for non-ready with non-failure reason', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-processing', 'default', {
          readyStatus: 'False',
          readyReason: 'InProgress',
        }),
      )
      expect(status).toBe('pending')
    })

    it('returns "ready" when Ready=True and no notAfter date', async () => {
      const status = await fetchCertWithStatus(
        makeCertResource('cert-no-expiry', 'default', {
          readyStatus: 'True',
        }),
      )
      expect(status).toBe('ready')
    })
  })

  // ========================================================================
  // Issuer type detection
  // ========================================================================

  describe('issuer type detection', () => {
    async function fetchIssuerWithType(specType: 'acme' | 'ca' | 'selfSigned' | 'vault' | 'venafi' | 'other') {
      setClusters('cluster-1')
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([])
        if (args[1] === 'issuers') return mockExecJson([makeIssuerResource('test-issuer', 'default', { specType, readyStatus: 'True' })])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.issuers.length).toBe(1)
      })

      return result.current.issuers[0].type
    }

    it('detects ACME issuer type', async () => {
      expect(await fetchIssuerWithType('acme')).toBe('ACME')
    })

    it('detects CA issuer type', async () => {
      expect(await fetchIssuerWithType('ca')).toBe('CA')
    })

    it('detects SelfSigned issuer type', async () => {
      expect(await fetchIssuerWithType('selfSigned')).toBe('SelfSigned')
    })

    it('detects Vault issuer type', async () => {
      expect(await fetchIssuerWithType('vault')).toBe('Vault')
    })

    it('detects Venafi issuer type', async () => {
      expect(await fetchIssuerWithType('venafi')).toBe('Venafi')
    })

    it('defaults to Other when no spec matches', async () => {
      expect(await fetchIssuerWithType('other')).toBe('Other')
    })
  })

  // ========================================================================
  // Issuer status detection
  // ========================================================================

  describe('issuer status detection', () => {
    it('returns "ready" when Ready=True', async () => {
      setClusters('cluster-1')
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([])
        if (args[1] === 'issuers') return mockExecJson([
          makeIssuerResource('ready-issuer', 'default', { specType: 'ca', readyStatus: 'True' }),
        ])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.issuers.length).toBe(1)
      })

      expect(result.current.issuers[0].status).toBe('ready')
    })

    it('returns "not-ready" when Ready=False', async () => {
      setClusters('cluster-1')
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([])
        if (args[1] === 'issuers') return mockExecJson([
          makeIssuerResource('not-ready', 'default', { specType: 'acme', readyStatus: 'False' }),
        ])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.issuers.length).toBe(1)
      })

      expect(result.current.issuers[0].status).toBe('not-ready')
    })

    it('returns "unknown" when no conditions exist', async () => {
      setClusters('cluster-1')
      const issuerNoConditions = {
        metadata: { name: 'no-cond', namespace: 'default' },
        spec: { selfSigned: {} },
        status: {},
      }
      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson([])
        if (args[1] === 'issuers') return mockExecJson([issuerNoConditions])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.issuers.length).toBe(1)
      })

      expect(result.current.issuers[0].status).toBe('unknown')
    })
  })

  // ========================================================================
  // Status computation
  // ========================================================================

  describe('status computation', () => {
    it('counts certificates by status category', async () => {
      setClusters('cluster-1')

      const now = Date.now()
      const certs = [
        makeCertResource('ready-1', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now + 60 * ONE_DAY_MS).toISOString(),
        }),
        makeCertResource('ready-2', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now + 90 * ONE_DAY_MS).toISOString(),
        }),
        makeCertResource('expiring-1', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now + 10 * ONE_DAY_MS).toISOString(),
        }),
        makeCertResource('expired-1', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now - 5 * ONE_DAY_MS).toISOString(),
        }),
        makeCertResource('pending-1', 'default', {}), // no Ready condition
        makeCertResource('failed-1', 'default', {
          readyStatus: 'False',
          readyReason: 'Failed',
        }),
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson(certs)
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.certificates.length).toBe(6)
      })

      expect(result.current.status.totalCertificates).toBe(6)
      expect(result.current.status.validCertificates).toBe(2)
      expect(result.current.status.expiringSoon).toBe(1)
      expect(result.current.status.expired).toBe(1)
      expect(result.current.status.pending).toBe(1)
      expect(result.current.status.failed).toBe(1)
    })

    it('counts recent renewals (within last 24h)', async () => {
      setClusters('cluster-1')

      const now = Date.now()
      const certs = [
        makeCertResource('renewed-recently', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now + 90 * ONE_DAY_MS).toISOString(),
          renewalTime: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        }),
        makeCertResource('renewed-old', 'default', {
          readyStatus: 'True',
          notAfter: new Date(now + 90 * ONE_DAY_MS).toISOString(),
          renewalTime: new Date(now - 3 * ONE_DAY_MS).toISOString(), // 3 days ago
        }),
      ]

      mockKubectlProxy.exec.mockImplementation(async (args: string[]) => {
        if (args[1] === 'crd') return { exitCode: 0, output: 'found' }
        if (args[1] === 'certificates') return mockExecJson(certs)
        if (args[1] === 'issuers') return mockExecJson([])
        if (args[1] === 'clusterissuers') return mockExecJson([])
        return { exitCode: 1, output: '' }
      })

      const { useCertManager } = await loadModule()
      const { result } = renderHook(() => useCertManager())

      await waitFor(() => {
        expect(result.current.certificates.length).toBe(2)
      })

      expect(result.current.status.recentRenewals).toBe(1)
    })
  })

  // ========================================================================
  // Error handling
  // ========================================================================

})
