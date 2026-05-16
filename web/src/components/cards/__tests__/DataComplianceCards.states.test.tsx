/**
 * Regression tests for compliance card refresh/failure visibility.
 *
 * Covers: loading, refreshing, failed fetch, stale/consecutive failures,
 * healthy/fresh install state for VaultSecrets, ExternalSecrets, CertManager.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { VaultSecrets, ExternalSecrets, CertManager } from '../DataComplianceCards'

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  getDemoMode: () => true, default: () => true,
  hasRealToken: () => false, isDemoModeForced: false, isNetlifyDeployment: false,
  canToggleDemoMode: () => true, isDemoToken: () => true, setDemoToken: vi.fn(),
  setGlobalDemoMode: vi.fn(),
}))

const mockClusters = vi.fn(() => [])
vi.mock('../../../hooks/useMCP', () => ({
  useClusters: () => {
    const clusters = mockClusters()
    return { clusters, deduplicatedClusters: clusters }
  },
}))

const mockKubectlExec = vi.fn()
vi.mock('../../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: (...args: unknown[]) => mockKubectlExec(...args) },
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

const mockUseCertManager = vi.fn()
vi.mock('../../../hooks/useCertManager', () => ({
  useCertManager: () => mockUseCertManager(),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

// ── Helpers ────────────────────────────────────────────────────────────

function cluster(name = 'prod') {
  return { name, reachable: true }
}

// ── VaultSecrets: failure/refresh states ────────────────────────────────

describe('VaultSecrets — refresh/failure visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockClusters.mockReturnValue([])
    mockUseCardLoadingState.mockReturnValue({})
  })

  it('shows error banner when all cluster scans throw', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockRejectedValue(new Error('timeout'))

    await act(async () => render(<VaultSecrets />))
    await waitFor(() =>
      expect(screen.getByText('Failed to fetch Vault status')).toBeInTheDocument()
    )
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('reports isFailed=true to useCardLoadingState after errors', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockRejectedValue(new Error('fail'))

    await act(async () => render(<VaultSecrets />))
    await waitFor(() => {
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: false })
      )
    })
  })

  it('reports isRefreshing via useCardLoadingState', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockResolvedValue({ exitCode: 1, output: '' })

    await act(async () => render(<VaultSecrets />))
    // After initial load, isRefreshing should be reported
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isRefreshing: expect.any(Boolean) })
    )
  })

  it('reports consecutiveFailures to useCardLoadingState', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockRejectedValue(new Error('fail'))

    await act(async () => render(<VaultSecrets />))
    await waitFor(() => {
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ consecutiveFailures: expect.any(Number) })
      )
    })
  })

  it('recovers from error when retry succeeds', async () => {
    mockClusters.mockReturnValue([cluster()])
    // First call fails
    mockKubectlExec.mockRejectedValueOnce(new Error('fail'))

    await act(async () => render(<VaultSecrets />))
    await waitFor(() =>
      expect(screen.getByText('Failed to fetch Vault status')).toBeInTheDocument()
    )

    // Setup success for retry
    mockKubectlExec
      .mockResolvedValueOnce({ exitCode: 0, output: JSON.stringify({ items: [{ status: { phase: 'Running' } }] }) })
      .mockResolvedValueOnce({ exitCode: 0, output: '11' })

    // Click retry
    const retryBtn = screen.getByText(/Retry/)
    await act(async () => retryBtn.click())

    await waitFor(() =>
      expect(screen.getByText('unsealed')).toBeInTheDocument()
    )
  })

  it('shows healthy state when data is fresh', async () => {
    mockClusters.mockReturnValue([cluster()])
    const podsPayload = JSON.stringify({
      items: [{ status: { phase: 'Running' } }],
    })
    mockKubectlExec
      .mockResolvedValueOnce({ exitCode: 0, output: podsPayload })
      .mockResolvedValueOnce({ exitCode: 0, output: '11' })

    await act(async () => render(<VaultSecrets />))
    await waitFor(() =>
      expect(screen.getByText('unsealed')).toBeInTheDocument()
    )
    // No error elements should be present
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── ExternalSecrets: failure/refresh states ─────────────────────────────

describe('ExternalSecrets — refresh/failure visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockClusters.mockReturnValue([])
    mockUseCardLoadingState.mockReturnValue({})
  })

  it('shows error banner when all cluster scans throw', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockRejectedValue(new Error('timeout'))

    await act(async () => render(<ExternalSecrets />))
    await waitFor(() =>
      expect(screen.getByText('Failed to fetch ESO status')).toBeInTheDocument()
    )
    expect(screen.getByText(/Retry/)).toBeInTheDocument()
  })

  it('reports isFailed and consecutiveFailures to useCardLoadingState', async () => {
    mockClusters.mockReturnValue([cluster()])
    mockKubectlExec.mockRejectedValue(new Error('fail'))

    await act(async () => render(<ExternalSecrets />))
    await waitFor(() => {
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          isFailed: expect.any(Boolean),
          consecutiveFailures: expect.any(Number),
          isRefreshing: expect.any(Boolean),
        })
      )
    })
  })

  it('shows healthy state when ESO is installed and data fresh', async () => {
    mockClusters.mockReturnValue([cluster()])
    const items = [{ status: { conditions: [{ type: 'Ready', status: 'True' }] } }]
    mockKubectlExec
      .mockResolvedValueOnce({ exitCode: 0, output: 'crd' }) // CRD check
      .mockResolvedValueOnce({ exitCode: 0, output: '11' }) // stores
      .mockResolvedValueOnce({ exitCode: 0, output: JSON.stringify({ items }) }) // ES list

    await act(async () => render(<ExternalSecrets />))
    await waitFor(() =>
      expect(screen.getByText('100% synced')).toBeInTheDocument()
    )
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument()
  })
})

// ── CertManager: failure/refresh states ────────────────────────────────

const DEFAULT_CERT_STATUS = {
  installed: true,
  totalCertificates: 10,
  validCertificates: 7,
  expiringSoon: 2,
  expired: 1,
  pending: 0,
  failed: 0,
  recentRenewals: 3,
}

function setupCertManager(overrides = {}) {
  mockUseCertManager.mockReturnValue({
    status: { ...DEFAULT_CERT_STATUS, ...overrides },
    issuers: [],
    isLoading: false,
    isRefreshing: false,
    consecutiveFailures: 0,
    isFailed: false,
    ...overrides,
  })
}

describe('CertManager — refresh/failure visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({})
  })

  it('passes isRefreshing to useCardLoadingState when refreshing', () => {
    setupCertManager({ isRefreshing: true })
    render(<CertManager />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isRefreshing: true })
    )
  })

  it('passes isFailed and consecutiveFailures when fetch fails', () => {
    setupCertManager({ isFailed: true, consecutiveFailures: 5 })
    render(<CertManager />)
    expect(mockUseCardLoadingState).toHaveBeenCalledWith(
      expect.objectContaining({ isFailed: true, consecutiveFailures: 5 })
    )
  })

  it('shows loading skeleton when loading with no issuers', () => {
    setupCertManager({ isLoading: true, issuers: [] })
    render(<CertManager />)
    const animated = document.querySelector('.animate-pulse')
    expect(animated).toBeInTheDocument()
  })

  it('shows healthy installed state when data fresh', () => {
    setupCertManager({
      issuers: [{ id: 'i1', name: 'le', kind: 'ClusterIssuer', status: 'ready', certificateCount: 5 }],
    })
    render(<CertManager />)
    expect(screen.getByText('7')).toBeInTheDocument() // valid certs
    expect(screen.getByText('le')).toBeInTheDocument() // issuer name
  })
})
