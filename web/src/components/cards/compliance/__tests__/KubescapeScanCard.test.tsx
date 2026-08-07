import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KubescapeScanCard } from '../KubescapeScanCard'
import type { KubescapeClusterStatus } from '../../../../hooks/useKubescape'

type TranslationOptions = {
  checked?: number
  total?: number
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: TranslationOptions) => {
      if (opts?.checked != null && opts?.total != null) {
        return `checking-${opts.checked}-${opts.total}`
      }
      return key
    },
  }),
}))

const mockUseKubescape = vi.fn()
vi.mock('../../../../hooks/useKubescape', () => ({
  useKubescape: () => mockUseKubescape(),
}))

const mockStartMission = vi.fn()
vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

const mockSelectedClusters = vi.fn(() => [] as string[])
vi.mock('../../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters() }),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

vi.mock('../../kubescape/KubescapeDetailModal', () => ({
  KubescapeDetailModal: ({ isOpen, clusterName }: { isOpen: boolean; clusterName: string }) =>
    isOpen ? <div data-testid="kubescape-detail-modal">{clusterName}</div> : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKubescapeStatus(overrides: Partial<KubescapeClusterStatus> = {}): KubescapeClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    overallScore: 80,
    frameworks: [{ name: 'CIS', score: 80, passCount: 8, failCount: 2 }],
    totalControls: 10,
    passedControls: 8,
    failedControls: 2,
    controls: [],
    ...overrides,
  }
}

function setupKubescape(overrides: Record<string, unknown> = {}, selectedClusters: string[] = []) {
  mockUseKubescape.mockReturnValue({
    statuses: {},
    aggregated: { overallScore: 0, frameworks: [], totalControls: 0, passedControls: 0, failedControls: 0 },
    isLoading: false,
    isRefreshing: false,
    installed: false,
    hasErrors: false,
    isDemoData: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: undefined,
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue(selectedClusters)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KubescapeScanCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKubescape()
  })

  describe('loading state', () => {
    it('shows a spinner with cluster progress while checking clusters and no data yet', () => {
      setupKubescape({ isLoading: true, totalClusters: 2, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('checking-1-2')).toBeInTheDocument()
    })
  })

  describe('empty / install state', () => {
    it('shows install prompt when kubescape is not installed', () => {
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.integration')).toBeInTheDocument()
      expect(screen.getByText(/cards:kubescapeScan.installWithMission/)).toBeInTheDocument()
    })

    it('starts a deploy mission when install link is clicked', async () => {
      render(<KubescapeScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:kubescapeScan.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy', title: 'Install Kubescape' }),
      )
    })
  })

  describe('representative mock data', () => {
    it('renders overall score, framework breakdown, and cluster badges', () => {
      const statuses = { prod: makeKubescapeStatus() }
      setupKubescape({
        installed: true,
        statuses,
        aggregated: { overallScore: 80, frameworks: [{ name: 'CIS', score: 80, passCount: 8, failCount: 2 }], totalControls: 10, passedControls: 8, failedControls: 2 },
      })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
      expect(screen.getByText('CIS Benchmark')).toBeInTheDocument()
      expect(screen.getByTestId('status-badge')).toHaveTextContent('prod: 80%')
    })

    it('opens the detail modal for a cluster when its badge is clicked', async () => {
      const statuses = { prod: makeKubescapeStatus() }
      setupKubescape({
        installed: true,
        statuses,
        aggregated: { overallScore: 80, frameworks: [], totalControls: 10, passedControls: 8, failedControls: 2 },
      })
      render(<KubescapeScanCard config={{}} />)
      await userEvent.click(screen.getByTestId('status-badge'))
      expect(screen.getByTestId('kubescape-detail-modal')).toHaveTextContent('prod')
    })

    it('shows degraded warning when installed clusters report zero controls', () => {
      const statuses = { prod: makeKubescapeStatus({ totalControls: 0, passedControls: 0, failedControls: 0 }) }
      setupKubescape({
        installed: true,
        statuses,
        aggregated: { overallScore: 0, frameworks: [], totalControls: 0, passedControls: 0, failedControls: 0 },
      })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.noScanData')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the unavailable placeholder when unavailableReason is set', () => {
      setupKubescape({ unavailableReason: 'no-agent' })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('Security posture scanning not available')).toBeInTheDocument()
    })

    it('shows an error banner with retry when fetch fails', async () => {
      const refetch = vi.fn()
      setupKubescape({ hasErrors: true, refetch })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.failedToFetch')).toBeInTheDocument()
      await userEvent.click(screen.getByText(/cards:kubescapeScan.retry/))
      expect(refetch).toHaveBeenCalled()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes hasAnyData=true when installed', () => {
      setupKubescape({ installed: true })
      render(<KubescapeScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes isFailed=true when hasErrors is set', () => {
      setupKubescape({ hasErrors: true })
      render(<KubescapeScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })
})
