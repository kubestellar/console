import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrivyScanCard } from '../TrivyScanCard'
import type { TrivyClusterStatus } from '../../../../hooks/useTrivy'

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

const mockUseTrivy = vi.fn()
vi.mock('../../../../hooks/useTrivy', () => ({
  useTrivy: () => mockUseTrivy(),
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

vi.mock('../../trivy/TrivyDetailModal', () => ({
  TrivyDetailModal: ({ isOpen, clusterName }: { isOpen: boolean; clusterName: string }) =>
    isOpen ? <div data-testid="trivy-detail-modal">{clusterName}</div> : null,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrivyStatus(overrides: Partial<TrivyClusterStatus> = {}): TrivyClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    vulnerabilities: { critical: 1, high: 2, medium: 3, low: 4, unknown: 0 },
    totalReports: 5,
    scannedImages: 5,
    images: [],
    ...overrides,
  }
}

function setupTrivy(overrides: Record<string, unknown> = {}, selectedClusters: string[] = []) {
  mockUseTrivy.mockReturnValue({
    statuses: {},
    aggregated: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
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

describe('TrivyScanCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTrivy()
  })

  describe('loading state', () => {
    it('shows a spinner with cluster progress while checking clusters and no data yet', () => {
      setupTrivy({ isLoading: true, totalClusters: 2, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('checking-1-2')).toBeInTheDocument()
    })
  })

  describe('empty / install state', () => {
    it('shows install prompt when trivy is not installed', () => {
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.integration')).toBeInTheDocument()
      expect(screen.getByText(/cards:trivyScan.installWithMission/)).toBeInTheDocument()
    })

    it('starts a deploy mission when install link is clicked', async () => {
      render(<TrivyScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:trivyScan.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy', title: 'Install Trivy Operator' }),
      )
    })
  })

  describe('representative mock data', () => {
    it('renders severity counts and cluster badges', () => {
      const statuses = { prod: makeTrivyStatus() }
      setupTrivy({
        installed: true,
        statuses,
        aggregated: { critical: 1, high: 2, medium: 3, low: 4, unknown: 0 },
      })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('common.critical')).toBeInTheDocument()
      expect(screen.getByTestId('status-badge')).toHaveTextContent('prod: 1C/2H')
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('opens the detail modal for a cluster when its badge is clicked', async () => {
      const statuses = { prod: makeTrivyStatus() }
      setupTrivy({
        installed: true,
        statuses,
        aggregated: { critical: 1, high: 2, medium: 3, low: 4, unknown: 0 },
      })
      render(<TrivyScanCard config={{}} />)
      await userEvent.click(screen.getByTestId('status-badge'))
      expect(screen.getByTestId('trivy-detail-modal')).toHaveTextContent('prod')
    })

    it('shows a critical vulnerability action hint when critical count > 0', () => {
      const statuses = { prod: makeTrivyStatus() }
      setupTrivy({
        installed: true,
        statuses,
        aggregated: { critical: 1, high: 2, medium: 3, low: 4, unknown: 0 },
      })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText(/Patch immediately/i)).toBeInTheDocument()
    })

    it('shows degraded warning when installed clusters report zero reports', () => {
      const statuses = { prod: makeTrivyStatus({ totalReports: 0, vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 } }) }
      setupTrivy({
        installed: true,
        statuses,
        aggregated: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
      })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.noScanData')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the unavailable placeholder when unavailableReason is set', () => {
      setupTrivy({ unavailableReason: 'no-agent' })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('Vulnerability scanning not available')).toBeInTheDocument()
    })

    it('shows an error banner with retry when fetch fails', async () => {
      const refetch = vi.fn()
      setupTrivy({ hasErrors: true, refetch })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.failedToFetch')).toBeInTheDocument()
      await userEvent.click(screen.getByText(/cards:trivyScan.retry/))
      expect(refetch).toHaveBeenCalled()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes hasAnyData=true when installed', () => {
      setupTrivy({ installed: true })
      render(<TrivyScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ hasAnyData: true }),
      )
    })

    it('passes isFailed=true when hasErrors is set', () => {
      setupTrivy({ hasErrors: true })
      render(<TrivyScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })
})
