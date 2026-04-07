import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { VaultSecrets, ExternalSecrets, CertManager } from '../DataComplianceCards'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
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
  useClusters: () => ({ clusters: mockClusters() }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reachableCluster(name = 'prod') {
  return { name, reachable: true }
}

function unreachableCluster(name = 'dev') {
  return { name, reachable: false }
}

function kubectlSuccess(output: string) {
  return Promise.resolve({ exitCode: 0, output })
}

function kubectlFailure() {
  return Promise.resolve({ exitCode: 1, output: '' })
}

// ---------------------------------------------------------------------------
// VaultSecrets
// ---------------------------------------------------------------------------

describe('VaultSecrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockClusters.mockReturnValue([])
    mockUseCardLoadingState.mockReturnValue({})
  })

  describe('demo / no clusters', () => {
    it('shows not-installed UI when in demo mode', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByText('Vault Integration')).toBeInTheDocument()
    })

    it('shows not-installed UI when no clusters connected', async () => {
      mockClusters.mockReturnValue([])
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByText('No clusters connected')).toBeInTheDocument()
    })

    it('shows install guide link', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<VaultSecrets />))
      expect(screen.getByRole('link', { name: /Install guide/i })).toHaveAttribute(
        'href',
        'https://developer.hashicorp.com/vault/docs/platform/k8s'
      )
    })

    it('filters unreachable clusters before scanning', async () => {
      mockClusters.mockReturnValue([unreachableCluster()])
      await act(async () => render(<VaultSecrets />))
      expect(mockKubectlExec).not.toHaveBeenCalled()
      expect(screen.getByText('No clusters connected')).toBeInTheDocument()
    })
  })

  describe('vault not found', () => {
    it('shows scanned-cluster count when vault not found', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1'), reachableCluster('c2')])
      mockKubectlExec.mockResolvedValue(kubectlFailure())
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText(/Scanned 2 clusters/i)).toBeInTheDocument()
      )
    })

    it('shows singular "cluster" when only 1 scanned', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1')])
      mockKubectlExec.mockResolvedValue(kubectlFailure())
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText(/Scanned 1 cluster —/i)).toBeInTheDocument()
      )
    })

    it('shows opaque secret count when secrets found but vault absent', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      mockKubectlExec
        .mockResolvedValueOnce(kubectlFailure()) // vault pods
        .mockResolvedValueOnce(kubectlSuccess('111')) // 3 opaque secrets
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText('3')).toBeInTheDocument()
      )
      expect(screen.getByText(/Opaque/i)).toBeInTheDocument()
    })

    it('does NOT show secret count block when no opaque secrets found', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      mockKubectlExec
        .mockResolvedValueOnce(kubectlFailure()) // vault pods
        .mockResolvedValueOnce(kubectlSuccess('')) // 0 secrets
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText(/Scanned 1 cluster/i)).toBeInTheDocument()
      )
      expect(screen.queryByText(/Opaque/i)).not.toBeInTheDocument()
    })
  })

  describe('vault installed', () => {
    it('shows unsealed badge when pods are running', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      const podsPayload = JSON.stringify({
        items: [
          { status: { phase: 'Running' } },
          { status: { phase: 'Running' } },
        ],
      })
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess(podsPayload))
        .mockResolvedValueOnce(kubectlSuccess('11'))
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText('unsealed')).toBeInTheDocument()
      )
    })

    it('shows sealed badge when no pods are running', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      const podsPayload = JSON.stringify({
        items: [{ status: { phase: 'Pending' } }],
      })
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess(podsPayload))
        .mockResolvedValueOnce(kubectlSuccess(''))
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText('sealed')).toBeInTheDocument()
      )
    })

    it('shows pod ready count', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      const podsPayload = JSON.stringify({
        items: [
          { status: { phase: 'Running' } },
          { status: { phase: 'Pending' } },
        ],
      })
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess(podsPayload))
        .mockResolvedValueOnce(kubectlSuccess('1'))
      await act(async () => render(<VaultSecrets />))
      await waitFor(() =>
        expect(screen.getByText('1/2')).toBeInTheDocument()
      )
    })

    it('accumulates data across multiple clusters', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1'), reachableCluster('c2')])
      const onePod = JSON.stringify({ items: [{ status: { phase: 'Running' } }] })
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess(onePod))   // c1 pods
        .mockResolvedValueOnce(kubectlSuccess('11'))     // c1 secrets
        .mockResolvedValueOnce(kubectlSuccess(onePod))   // c2 pods
        .mockResolvedValueOnce(kubectlSuccess('111'))    // c2 secrets
      await act(async () => render(<VaultSecrets />))
      await waitFor(() => expect(screen.getByText('2/2')).toBeInTheDocument())
      expect(screen.getByText('5')).toBeInTheDocument() // 2+3 secrets
    })

    it('continues to next cluster on kubectl exception', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1'), reachableCluster('c2')])
      // c1: pods call fails -> catch skips to c2 (secrets call for c1 never runs)
      // c2: pods call succeeds, secrets call succeeds
      mockKubectlExec
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(kubectlSuccess(JSON.stringify({ items: [{ status: { phase: 'Running' } }] })))
        .mockResolvedValueOnce(kubectlSuccess('1'))
      await act(async () => render(<VaultSecrets />))
      await waitFor(() => expect(screen.getByText('unsealed')).toBeInTheDocument())
    })
  })

  describe('useCardLoadingState', () => {
    it('reports isDemoData=true in demo mode', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<VaultSecrets />))
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true })
      )
    })
  })
})

// ---------------------------------------------------------------------------
// ExternalSecrets
// ---------------------------------------------------------------------------

describe('ExternalSecrets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    mockClusters.mockReturnValue([])
    mockUseCardLoadingState.mockReturnValue({})
  })

  describe('demo / no clusters', () => {
    it('shows ESO install notice in demo mode', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<ExternalSecrets />))
      expect(screen.getByText('External Secrets Integration')).toBeInTheDocument()
    })

    it('shows install guide link', async () => {
      mockIsDemoMode.mockReturnValue(true)
      await act(async () => render(<ExternalSecrets />))
      expect(screen.getByRole('link', { name: /Install guide/i })).toHaveAttribute(
        'href',
        'https://external-secrets.io/latest/introduction/getting-started/'
      )
    })

    it('shows no-clusters message when no reachable clusters', async () => {
      mockClusters.mockReturnValue([])
      await act(async () => render(<ExternalSecrets />))
      expect(screen.getByText('No clusters connected')).toBeInTheDocument()
    })
  })

  describe('ESO not found', () => {
    it('shows scanned count when ESO CRD absent', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1')])
      mockKubectlExec.mockResolvedValue(kubectlFailure())
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() =>
        expect(screen.getByText(/no ESO installation detected/i)).toBeInTheDocument()
      )
    })

    it('shows plural clusters text when multiple clusters scanned', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1'), reachableCluster('c2')])
      mockKubectlExec.mockResolvedValue(kubectlFailure())
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() =>
        expect(screen.getByText(/Scanned 2 clusters/i)).toBeInTheDocument()
      )
    })
  })

  describe('ESO installed', () => {
    function setupESOInstalled({
      synced = 3,
      failed = 1,
      pending = 0,
      stores = 2,
    } = {}) {
      mockClusters.mockReturnValue([reachableCluster()])

      // Build ExternalSecrets items
      const items = [
        ...Array(synced).fill(null).map(() => ({
          status: { conditions: [{ type: 'Ready', status: 'True' }] },
        })),
        ...Array(failed).fill(null).map(() => ({
          status: { conditions: [{ type: 'Ready', status: 'False', reason: 'SecretSyncedError' }] },
        })),
        ...Array(pending).fill(null).map(() => ({
          status: { conditions: [] },
        })),
      ]

      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess('externalsecrets.external-secrets.io')) // CRD check
        .mockResolvedValueOnce(kubectlSuccess('1'.repeat(stores)))                    // stores
        .mockResolvedValueOnce(kubectlSuccess(JSON.stringify({ items })))              // ES list
    }

    it('shows synced percentage', async () => {
      setupESOInstalled({ synced: 3, failed: 1, pending: 0 })
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('75% synced')).toBeInTheDocument())
    })

    it('shows 100% synced when no external secrets exist', async () => {
      mockClusters.mockReturnValue([reachableCluster()])
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess('externalsecrets.external-secrets.io'))
        .mockResolvedValueOnce(kubectlSuccess(''))
        .mockResolvedValueOnce(kubectlSuccess(JSON.stringify({ items: [] })))
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('100% synced')).toBeInTheDocument())
    })

    it('shows synced count', async () => {
      setupESOInstalled({ synced: 3, failed: 1 })
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    })

    it('shows failed count', async () => {
      setupESOInstalled({ synced: 3, failed: 2, stores: 1 })
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    })

    it('shows store count', async () => {
      setupESOInstalled({ stores: 4 })
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument())
    })

    it('shows pending count', async () => {
      setupESOInstalled({ synced: 2, failed: 0, pending: 3 })
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    })

    it('accumulates across clusters', async () => {
      mockClusters.mockReturnValue([reachableCluster('c1'), reachableCluster('c2')])
      const oneItem = JSON.stringify({
        items: [{ status: { conditions: [{ type: 'Ready', status: 'True' }] } }],
      })
      mockKubectlExec
        .mockResolvedValueOnce(kubectlSuccess('crd')) // c1 CRD
        .mockResolvedValueOnce(kubectlSuccess('11')) // c1 stores = 2
        .mockResolvedValueOnce(kubectlSuccess(oneItem)) // c1 ES
        .mockResolvedValueOnce(kubectlSuccess('crd')) // c2 CRD
        .mockResolvedValueOnce(kubectlSuccess('1'))  // c2 stores = 1
        .mockResolvedValueOnce(kubectlSuccess(oneItem)) // c2 ES
      await act(async () => render(<ExternalSecrets />))
      await waitFor(() => expect(screen.getByText('100% synced')).toBeInTheDocument())
      expect(screen.getByText('3')).toBeInTheDocument() // 2+1 stores
    })
  })
})

// ---------------------------------------------------------------------------
// CertManager
// ---------------------------------------------------------------------------

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

describe('CertManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({})
  })

  describe('not installed', () => {
    it('shows install notice when cert-manager not detected', () => {
      setupCertManager({ status: { ...DEFAULT_CERT_STATUS, installed: false }, isLoading: false })
      render(<CertManager />)
      expect(screen.getByText('Cert-Manager Integration')).toBeInTheDocument()
    })

    it('shows install guide link', () => {
      setupCertManager({ status: { ...DEFAULT_CERT_STATUS, installed: false }, isLoading: false })
      render(<CertManager />)
      expect(screen.getByRole('link', { name: /Install guide/i })).toHaveAttribute(
        'href',
        'https://cert-manager.io/docs/installation/'
      )
    })

    it('shows no-installation detected text', () => {
      setupCertManager({ status: { ...DEFAULT_CERT_STATUS, installed: false }, isLoading: false })
      render(<CertManager />)
      expect(screen.getByText(/No cert-manager installation detected/i)).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows pulse skeleton while loading and no issuers', () => {
      setupCertManager({ isLoading: true, issuers: [] })
      render(<CertManager />)
      // Skeleton divs with animate-pulse class
      const animated = document.querySelector('.animate-pulse')
      expect(animated).toBeInTheDocument()
    })

    it('does NOT show skeleton when issuers exist even if loading', () => {
      setupCertManager({
        isLoading: true,
        issuers: [{ id: 'i1', name: 'letsencrypt', kind: 'ClusterIssuer', status: 'ready', certificateCount: 5 }],
      })
      render(<CertManager />)
      expect(screen.getByText('letsencrypt')).toBeInTheDocument()
    })
  })

  describe('installed — stats', () => {
    it('renders valid certificate count', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.getByText('7')).toBeInTheDocument()
    })

    it('renders expiring soon count', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('renders expired count', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('renders total certificate count', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.getByText('10')).toBeInTheDocument()
    })

    it('renders renewals per 24h', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.getByText('3 renewals/24h')).toBeInTheDocument()
    })
  })

  describe('installed — pending/failed badges', () => {
    it('shows pending badge when pending > 0', () => {
      setupCertManager({ status: { ...DEFAULT_CERT_STATUS, pending: 4 } })
      render(<CertManager />)
      expect(screen.getByText(/4 pending/i)).toBeInTheDocument()
    })

    it('shows failed badge when failed > 0', () => {
      setupCertManager({ status: { ...DEFAULT_CERT_STATUS, failed: 2 } })
      render(<CertManager />)
      expect(screen.getByText(/2 failed/i)).toBeInTheDocument()
    })

    it('does NOT show badges when pending=0 and failed=0', () => {
      setupCertManager()
      render(<CertManager />)
      expect(screen.queryByTestId('status-badge')).not.toBeInTheDocument()
    })
  })

  describe('installed — issuers', () => {
    it('shows issuer count in section header', () => {
      setupCertManager({
        issuers: [
          { id: 'i1', name: 'letsencrypt', kind: 'ClusterIssuer', status: 'ready', certificateCount: 5 },
        ],
      })
      render(<CertManager />)
      expect(screen.getByText('Issuers (1)')).toBeInTheDocument()
    })

    it('renders issuer name and kind', () => {
      setupCertManager({
        issuers: [
          { id: 'i1', name: 'letsencrypt', kind: 'ClusterIssuer', status: 'ready', certificateCount: 5 },
        ],
      })
      render(<CertManager />)
      expect(screen.getByText('letsencrypt')).toBeInTheDocument()
      expect(screen.getByText('ClusterIssuer')).toBeInTheDocument()
    })

    it('renders certificate count per issuer', () => {
      setupCertManager({
        issuers: [
          { id: 'i1', name: 'letsencrypt', kind: 'ClusterIssuer', status: 'ready', certificateCount: 12 },
        ],
      })
      render(<CertManager />)
      expect(screen.getByText('12')).toBeInTheDocument()
    })

    it('shows top 3 issuers sorted by certificateCount descending', () => {
      setupCertManager({
        issuers: [
          { id: 'a', name: 'small', kind: 'Issuer', status: 'ready', certificateCount: 1 },
          { id: 'b', name: 'large', kind: 'ClusterIssuer', status: 'ready', certificateCount: 50 },
          { id: 'c', name: 'medium', kind: 'Issuer', status: 'ready', certificateCount: 20 },
          { id: 'd', name: 'tiny', kind: 'Issuer', status: 'ready', certificateCount: 0 },
        ],
      })
      render(<CertManager />)
      expect(screen.getByText('large')).toBeInTheDocument()
      expect(screen.getByText('medium')).toBeInTheDocument()
      expect(screen.getByText('small')).toBeInTheDocument()
      expect(screen.queryByText('tiny')).not.toBeInTheDocument()
    })

    it('shows "No issuers found" when issuers list is empty', () => {
      setupCertManager({ issuers: [] })
      render(<CertManager />)
      expect(screen.getByText('No issuers found')).toBeInTheDocument()
    })

    it('applies green shield icon for ready issuer', () => {
      setupCertManager({
        issuers: [{ id: 'i1', name: 'ready-issuer', kind: 'Issuer', status: 'ready', certificateCount: 3 }],
      })
      render(<CertManager />)
      // Shield SVG inside the issuer row should have text-green-400
      const row = screen.getByText('ready-issuer').closest('div')
      const shield = row?.querySelector('svg')
      expect(shield?.getAttribute('class')).toContain('text-green-400')
    })

    it('applies red shield icon for not-ready issuer', () => {
      setupCertManager({
        issuers: [{ id: 'i1', name: 'bad-issuer', kind: 'Issuer', status: 'not-ready', certificateCount: 0 }],
      })
      render(<CertManager />)
      const row = screen.getByText('bad-issuer').closest('div')
      const shield = row?.querySelector('svg')
      expect(shield?.getAttribute('class')).toContain('text-red-400')
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isFailed and consecutiveFailures to useCardLoadingState', () => {
      setupCertManager({ isFailed: true, consecutiveFailures: 5 })
      render(<CertManager />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true, consecutiveFailures: 5 })
      )
    })

    it('passes hasAnyData=true when issuers exist', () => {
      setupCertManager({
        issuers: [{ id: 'i1', name: 'n', kind: 'Issuer', status: 'ready', certificateCount: 1 }],
      })
      render(<CertManager />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true })
      )
    })
  })
})