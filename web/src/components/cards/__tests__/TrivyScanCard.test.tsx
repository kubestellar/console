import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrivyScanCard } from '../compliance/TrivyScanCard'
import { CARD_UI_STRINGS } from '../strings'
import type { TrivyClusterStatus, TrivyVulnSummary } from '../../../hooks/useTrivy'
import type { CardConfig } from '../compliance/cardTypes'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseTrivy = vi.fn()
vi.mock('../../../hooks/useTrivy', () => ({
  useTrivy: () => mockUseTrivy(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters() }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>
      {children}
    </span>
  ),
}))

vi.mock('../trivy/TrivyDetailModal', () => ({
  TrivyDetailModal: ({
    isOpen,
    onClose,
    clusterName,
  }: {
    isOpen: boolean
    onClose: () => void
    clusterName: string
  }) =>
    isOpen ? (
      <div data-testid="trivy-detail-modal">
        <span>{clusterName}</span>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_CONFIG: CardConfig = {}

const EMPTY_AGGREGATE: TrivyVulnSummary = {
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  unknown: 0,
}

function makeVulnerabilities(overrides: Partial<TrivyVulnSummary> = {}): TrivyVulnSummary {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    ...overrides,
  }
}

function makeTrivyStatus(overrides: Partial<TrivyClusterStatus> = {}): TrivyClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    vulnerabilities: makeVulnerabilities(),
    totalReports: 5,
    scannedImages: 3,
    images: [],
    ...overrides,
  }
}

function setupDefaults({
  installed = false,
  isLoading = false,
  isRefreshing = false,
  isDemoData = false,
  hasErrors = false,
  statuses = {} as Record<string, TrivyClusterStatus>,
  clustersChecked = 0,
  totalClusters = 1,
  unavailableReason = null as string | null,
  aggregated = EMPTY_AGGREGATE,
  refetch = vi.fn(),
} = {}) {
  mockUseTrivy.mockReturnValue({
    statuses,
    aggregated,
    isLoading,
    isRefreshing,
    lastRefresh: null,
    installed,
    hasErrors,
    isDemoData,
    refetch,
    clustersChecked,
    totalClusters,
    unavailableReason,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrivyScanCard', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    user = userEvent.setup()
    vi.clearAllMocks()
    setupDefaults()
  })

  describe('unavailable state', () => {
    // Unavailable UI uses CARD_UI_STRINGS (not t()), so English literals are correct with key-returning i18n mock.
    it('shows unavailable message when scanner is not reachable', () => {
      setupDefaults({ unavailableReason: 'in-cluster' })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText(CARD_UI_STRINGS.compliance.trivyUnavailable)).toBeInTheDocument()
      expect(screen.getByText(CARD_UI_STRINGS.compliance.requiresLocalAgent)).toBeInTheDocument()
    })
  })

  describe('loading skeleton', () => {
    it('shows loading shell when loading with no cached statuses', () => {
      setupDefaults({ isLoading: true, totalClusters: 0 })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:trivyScan.integration')).not.toBeInTheDocument()
      expect(screen.queryByText('common.critical')).not.toBeInTheDocument()
    })

    it('shows cluster check progress while loading', () => {
      setupDefaults({ isLoading: true, totalClusters: 3, clustersChecked: 1 })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:trivyScan.checkingClusters')).toBeInTheDocument()
    })

    it('renders severity grid when statuses exist during refresh', () => {
      setupDefaults({
        isLoading: true,
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 2, high: 5, medium: 10, low: 20 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error banner when hasErrors=true and not demo data', () => {
      setupDefaults({ hasErrors: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:trivyScan.failedToFetch')).toBeInTheDocument()
    })

    it('error banner includes a Retry button', () => {
      setupDefaults({ hasErrors: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:trivyScan.retry →')).toBeInTheDocument()
    })

    it('calls refetch when Retry is clicked', async () => {
      const refetch = vi.fn()
      setupDefaults({ hasErrors: true, refetch })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:trivyScan.retry →'))
      expect(refetch).toHaveBeenCalled()
    })

    it('does not show error banner when isDemoData=true', () => {
      setupDefaults({ hasErrors: true, isDemoData: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:trivyScan.failedToFetch')).not.toBeInTheDocument()
    })
  })

  describe('install prompt', () => {
    it('shows install prompt when Trivy is not installed and scan is done', () => {
      setupDefaults({ installed: false, isLoading: false, isRefreshing: false, hasErrors: false })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:trivyScan.integration')).toBeInTheDocument()
    })

    it('calls startMission with install config when Install button is clicked', async () => {
      setupDefaults({ installed: false, isLoading: false })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:trivyScan.installWithMission →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Install Trivy Operator', type: 'deploy' }),
      )
    })

    it('hides install prompt when Trivy is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeTrivyStatus() } })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:trivyScan.integration')).not.toBeInTheDocument()
    })
  })

  describe('severity badges', () => {
    it('renders critical, high, medium, and low severity counts', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 3, high: 7, medium: 12, low: 25 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('25')).toBeInTheDocument()
    })

    it('renders severity labels from i18n keys', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 1, high: 2, medium: 3, low: 4 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('common.critical')).toBeInTheDocument()
      expect(screen.getByText('cards:trivyScan.high')).toBeInTheDocument()
      expect(screen.getByText('cards:trivyScan.medium')).toBeInTheDocument()
      expect(screen.getByText('cards:trivyScan.low')).toBeInTheDocument()
    })

    it('renders severity descriptions from TRIVY_SEVERITY constants', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 1 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('Actively exploited CVEs with public exploits')).toBeInTheDocument()
      expect(screen.getByText('Serious vulnerabilities that could lead to compromise')).toBeInTheDocument()
    })

    it('shows critical action hint when critical count is greater than zero', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 2 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(
        screen.getByText('Patch immediately — these have known exploits in the wild'),
      ).toBeInTheDocument()
    })

    it('hides critical action hint when critical count is zero', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus() },
        aggregated: makeVulnerabilities({ critical: 0 }),
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(
        screen.queryByText('Patch immediately — these have known exploits in the wild'),
      ).not.toBeInTheDocument()
    })
  })

  describe('cluster badges', () => {
    it('renders one badge per installed cluster', () => {
      const statuses = {
        'cluster-a': makeTrivyStatus({
          cluster: 'cluster-a',
          vulnerabilities: makeVulnerabilities({ critical: 1, high: 2 }),
        }),
        'cluster-b': makeTrivyStatus({
          cluster: 'cluster-b',
          vulnerabilities: makeVulnerabilities({ critical: 0, high: 5 }),
        }),
      }
      setupDefaults({ installed: true, statuses })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getAllByTestId('status-badge')).toHaveLength(2)
    })

    it('badge uses red color when cluster has critical vulnerabilities', () => {
      setupDefaults({
        installed: true,
        statuses: {
          prod: makeTrivyStatus({
            cluster: 'prod',
            vulnerabilities: makeVulnerabilities({ critical: 3, high: 1 }),
          }),
        },
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByTestId('status-badge')).toHaveAttribute('data-color', 'red')
      expect(screen.getByText('prod: 3C/1H')).toBeInTheDocument()
    })

    it('badge uses green color when cluster has zero critical vulnerabilities', () => {
      setupDefaults({
        installed: true,
        statuses: {
          prod: makeTrivyStatus({
            cluster: 'prod',
            vulnerabilities: makeVulnerabilities({ critical: 0, high: 4 }),
          }),
        },
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByTestId('status-badge')).toHaveAttribute('data-color', 'green')
    })

    it('opens detail modal when a cluster badge is clicked', async () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus({ cluster: 'prod' }) },
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByTestId('status-badge'))
      const modal = screen.getByTestId('trivy-detail-modal')
      expect(modal).toBeInTheDocument()
      expect(modal.textContent).toContain('prod')
    })
  })

  describe('empty scan result state', () => {
    it('shows degraded banner when installed but all clusters have zero reports', () => {
      const statuses = {
        prod: makeTrivyStatus({
          cluster: 'prod',
          installed: true,
          totalReports: 0,
          vulnerabilities: makeVulnerabilities(),
        }),
      }
      setupDefaults({ installed: true, statuses })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:trivyScan.noScanData')).toBeInTheDocument()
    })

    it('calls startMission with troubleshoot config when fix button is clicked', async () => {
      const statuses = {
        prod: makeTrivyStatus({
          cluster: 'prod',
          installed: true,
          totalReports: 0,
          vulnerabilities: makeVulnerabilities(),
        }),
      }
      setupDefaults({ installed: true, statuses })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:trivyScan.fixWithMission →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Troubleshoot Trivy Operator', type: 'troubleshoot' }),
      )
    })

    it('does not show degraded banner when vulnerability reports exist', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeTrivyStatus({ totalReports: 10 }) },
      })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:trivyScan.noScanData')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns isDemoData', () => {
      setupDefaults({ isDemoData: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes hasAnyData=true when Trivy is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeTrivyStatus() } })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes hasAnyData=true when isDemoData is true even without installation', () => {
      setupDefaults({ installed: false, isDemoData: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes isFailed when hasErrors is true', () => {
      setupDefaults({ hasErrors: true })
      render(<TrivyScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })
})
