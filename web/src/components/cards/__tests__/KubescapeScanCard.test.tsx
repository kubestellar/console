import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KubescapeScanCard } from '../compliance/KubescapeScanCard'
import { CARD_UI_STRINGS } from '../strings'
import type { KubescapeClusterStatus, KubescapeFrameworkScore } from '../../../hooks/useKubescape'
import type { CardConfig } from '../compliance/cardTypes'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

const mockUseKubescape = vi.fn()
vi.mock('../../../hooks/useKubescape', () => ({
  useKubescape: () => mockUseKubescape(),
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

vi.mock('../kubescape/KubescapeDetailModal', () => ({
  KubescapeDetailModal: ({
    isOpen,
    onClose,
    clusterName,
  }: {
    isOpen: boolean
    onClose: () => void
    clusterName: string
  }) =>
    isOpen ? (
      <div data-testid="kubescape-detail-modal">
        <span>{clusterName}</span>
        <button onClick={onClose}>close</button>
      </div>
    ) : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CARD_CONFIG: CardConfig = {}

function makeFramework(overrides: Partial<KubescapeFrameworkScore> = {}): KubescapeFrameworkScore {
  return {
    name: 'CIS',
    score: 85,
    passCount: 40,
    failCount: 5,
    ...overrides,
  }
}

function makeKubescapeStatus(overrides: Partial<KubescapeClusterStatus> = {}): KubescapeClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    overallScore: 82,
    frameworks: [makeFramework()],
    totalControls: 100,
    passedControls: 90,
    failedControls: 10,
    controls: [],
    ...overrides,
  }
}

function setupDefaults({
  installed = false,
  isLoading = false,
  isRefreshing = false,
  isDemoData = false,
  hasErrors = false,
  statuses = {} as Record<string, KubescapeClusterStatus>,
  clustersChecked = 0,
  totalClusters = 1,
  unavailableReason = null as string | null,
  aggregated = {
    overallScore: 0,
    frameworks: [] as KubescapeFrameworkScore[],
    totalControls: 0,
    passedControls: 0,
    failedControls: 0,
  },
  refetch = vi.fn(),
} = {}) {
  mockUseKubescape.mockReturnValue({
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

describe('KubescapeScanCard', () => {
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
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText(CARD_UI_STRINGS.compliance.kubescapeUnavailable)).toBeInTheDocument()
      expect(screen.getByText(CARD_UI_STRINGS.compliance.requiresLocalAgent)).toBeInTheDocument()
    })
  })

  describe('loading skeleton', () => {
    it('shows loading shell when loading with no cached statuses', () => {
      setupDefaults({ isLoading: true, totalClusters: 0 })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:kubescapeScan.integration')).not.toBeInTheDocument()
      expect(screen.queryByText(/cards:kubescapeScan\.passed/)).not.toBeInTheDocument()
    })

    it('shows cluster check progress while loading', () => {
      setupDefaults({ isLoading: true, totalClusters: 3, clustersChecked: 1 })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:kubescapeScan.checkingClusters')).toBeInTheDocument()
    })

    it('does not show full-page loader when statuses already exist', () => {
      setupDefaults({
        isLoading: true,
        installed: true,
        statuses: { prod: makeKubescapeStatus() },
        aggregated: {
          overallScore: 82,
          frameworks: [makeFramework()],
          totalControls: 100,
          passedControls: 90,
          failedControls: 10,
        },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('82%')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error banner when hasErrors=true and not demo data', () => {
      setupDefaults({ hasErrors: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:kubescapeScan.failedToFetch')).toBeInTheDocument()
    })

    it('error banner includes a Retry button', () => {
      setupDefaults({ hasErrors: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:kubescapeScan.retry →')).toBeInTheDocument()
    })

    it('calls refetch when Retry is clicked', async () => {
      const refetch = vi.fn()
      setupDefaults({ hasErrors: true, refetch })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:kubescapeScan.retry →'))
      expect(refetch).toHaveBeenCalled()
    })

    it('does not show error banner when isDemoData=true', () => {
      setupDefaults({ hasErrors: true, isDemoData: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:kubescapeScan.failedToFetch')).not.toBeInTheDocument()
    })
  })

  describe('install prompt', () => {
    it('shows install prompt when Kubescape is not installed and scan is done', () => {
      setupDefaults({ installed: false, isLoading: false, isRefreshing: false, hasErrors: false })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:kubescapeScan.integration')).toBeInTheDocument()
    })

    it('calls startMission with install config when Install button is clicked', async () => {
      setupDefaults({ installed: false, isLoading: false })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:kubescapeScan.installWithMission →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Install Kubescape', type: 'deploy' }),
      )
    })

    it('hides install prompt when Kubescape is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeKubescapeStatus() } })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:kubescapeScan.integration')).not.toBeInTheDocument()
    })
  })

  describe('scan results', () => {
    it('renders overall score percentage', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ overallScore: 82 }) },
        aggregated: {
          overallScore: 82,
          frameworks: [makeFramework()],
          totalControls: 100,
          passedControls: 90,
          failedControls: 10,
        },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('82%')).toBeInTheDocument()
    })

    it('renders passed, failed, and total control counts', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus() },
        aggregated: {
          overallScore: 82,
          frameworks: [makeFramework()],
          totalControls: 100,
          passedControls: 90,
          failedControls: 10,
        },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      const statsRow = screen.getByText(/cards:kubescapeScan\.passed/).closest('.flex')
      expect(statsRow?.textContent).toContain('90')
      expect(statsRow?.textContent).toContain('10')
      expect(statsRow?.textContent).toContain('100')
    })

    it('renders framework rows with labels and scores', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ frameworks: [makeFramework({ name: 'CIS', score: 85 })] }) },
        aggregated: {
          overallScore: 85,
          frameworks: [makeFramework({ name: 'CIS', score: 85 })],
          totalControls: 50,
          passedControls: 45,
          failedControls: 5,
        },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('CIS Benchmark')).toBeInTheDocument()
      expect(screen.getByText('Industry-standard Kubernetes hardening rules')).toBeInTheDocument()
      const frameworkScores = screen.getAllByText('85%', { exact: false })
      expect(frameworkScores.length).toBeGreaterThanOrEqual(1)
    })

    it('shows score context label for the overall score', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ overallScore: 82 }) },
        aggregated: {
          overallScore: 82,
          frameworks: [makeFramework()],
          totalControls: 100,
          passedControls: 90,
          failedControls: 10,
        },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('Good')).toBeInTheDocument()
    })
  })

  describe('cluster badges', () => {
    it('renders one badge per installed cluster', () => {
      const statuses = {
        'cluster-a': makeKubescapeStatus({ cluster: 'cluster-a', overallScore: 80 }),
        'cluster-b': makeKubescapeStatus({ cluster: 'cluster-b', overallScore: 70 }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getAllByTestId('status-badge')).toHaveLength(2)
    })

    it('badge uses green color when score is at least 80', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ cluster: 'prod', overallScore: 85 }) },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByTestId('status-badge')).toHaveAttribute('data-color', 'green')
    })

    it('badge uses red color when score is below 60', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ cluster: 'prod', overallScore: 45 }) },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByTestId('status-badge')).toHaveAttribute('data-color', 'red')
    })

    it('opens detail modal when a cluster badge is clicked', async () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ cluster: 'prod' }) },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByTestId('status-badge'))
      const modal = screen.getByTestId('kubescape-detail-modal')
      expect(modal).toBeInTheDocument()
      expect(modal.textContent).toContain('prod')
    })
  })

  describe('empty scan result state', () => {
    it('shows degraded banner when installed but all clusters have zero controls', () => {
      const statuses = {
        prod: makeKubescapeStatus({
          cluster: 'prod',
          installed: true,
          totalControls: 0,
          passedControls: 0,
          failedControls: 0,
          frameworks: [],
        }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.getByText('cards:kubescapeScan.noScanData')).toBeInTheDocument()
    })

    it('calls startMission with troubleshoot config when fix button is clicked', async () => {
      const statuses = {
        prod: makeKubescapeStatus({
          cluster: 'prod',
          installed: true,
          totalControls: 0,
          passedControls: 0,
          failedControls: 0,
          frameworks: [],
        }),
      }
      setupDefaults({ installed: true, statuses })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      await user.click(screen.getByText('cards:kubescapeScan.fixWithMission →'))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Troubleshoot Kubescape Operator', type: 'troubleshoot' }),
      )
    })

    it('does not show degraded banner when scan data exists', () => {
      setupDefaults({
        installed: true,
        statuses: { prod: makeKubescapeStatus({ totalControls: 50 }) },
      })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(screen.queryByText('cards:kubescapeScan.noScanData')).not.toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns isDemoData', () => {
      setupDefaults({ isDemoData: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true }),
      )
    })

    it('passes hasAnyData=true when Kubescape is installed', () => {
      setupDefaults({ installed: true, statuses: { prod: makeKubescapeStatus() } })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes hasAnyData=true when isDemoData is true even without installation', () => {
      setupDefaults({ installed: false, isDemoData: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes isFailed when hasErrors is true', () => {
      setupDefaults({ hasErrors: true })
      render(<KubescapeScanCard config={CARD_CONFIG} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })
})
