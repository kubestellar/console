import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrivyScanCard } from '../TrivyScanCard'
import type { TrivyClusterStatus } from '../../../../hooks/useTrivy'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: { checked?: number; total?: number }) => {
      if (opts?.checked != null && opts?.total != null) return `checking-${opts.checked}-${opts.total}`
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

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../../trivy/TrivyDetailModal', () => ({
  TrivyDetailModal: ({ isOpen, clusterName }: { isOpen: boolean; clusterName: string }) =>
    isOpen ? <div data-testid="trivy-modal">{clusterName}</div> : null,
}))

vi.mock('../../../../lib/constants/compliance', () => ({
  TRIVY_SEVERITY: {
    critical: { description: 'Actively exploited vulnerabilities', action: 'Patch immediately' },
    high: { description: 'Likely exploitable vulnerabilities' },
    medium: { description: 'Potentially exploitable vulnerabilities' },
    low: { description: 'Limited exploitability' },
    unknown: { description: 'Unknown severity' },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<TrivyClusterStatus> = {}): TrivyClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    vulnerabilities: { critical: 2, high: 5, medium: 10, low: 20, unknown: 1 },
    totalReports: 38,
    scannedImages: 38,
    images: [],
    ...overrides,
  }
}

function setupTrivy(overrides: Record<string, unknown> = {}) {
  mockUseTrivy.mockReturnValue({
    statuses: {},
    aggregated: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    installed: false,
    hasErrors: false,
    clustersChecked: 0,
    totalClusters: 0,
    unavailableReason: null,
    refetch: vi.fn(),
    ...overrides,
  })
  mockUseCardLoadingState.mockReturnValue({})
  mockSelectedClusters.mockReturnValue([])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrivyScanCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTrivy()
  })

  describe('unavailable state', () => {
    it('shows unavailable message when unavailableReason is set', () => {
      setupTrivy({ unavailableReason: 'in-cluster mode' })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('Vulnerability scanning not available')).toBeInTheDocument()
      expect(screen.getByText('Requires kc-agent (local agent mode)')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows spinner while loading with no statuses', () => {
      setupTrivy({ isLoading: true, statuses: {} })
      render(<TrivyScanCard config={{}} />)
      expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('shows cluster progress text during initial load', () => {
      setupTrivy({ isLoading: true, statuses: {}, totalClusters: 2, clustersChecked: 0 })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('checking-0-2')).toBeInTheDocument()
    })
  })

  describe('install prompt', () => {
    it('shows install prompt when not installed and not loading', () => {
      setupTrivy({ installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.integration')).toBeInTheDocument()
      expect(screen.getByText(/cards:trivyScan.installWithMission/)).toBeInTheDocument()
    })

    it('starts deploy mission when install button is clicked', async () => {
      setupTrivy({ installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:trivyScan.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy', title: 'Install Trivy Operator' }),
      )
    })
  })

  describe('error state', () => {
    it('shows error banner when fetch fails', () => {
      setupTrivy({ hasErrors: true, installed: false })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.failedToFetch')).toBeInTheDocument()
      expect(screen.getByText(/cards:trivyScan.retry/)).toBeInTheDocument()
    })

    it('triggers refetch when retry is clicked', async () => {
      const mockRefetch = vi.fn()
      setupTrivy({ hasErrors: true, installed: false, refetch: mockRefetch })
      render(<TrivyScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:trivyScan.retry/))
      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('degraded state', () => {
    it('shows troubleshoot prompt when installed but no scan reports', () => {
      const statuses = {
        prod: makeStatus({ totalReports: 0 }),
      }
      setupTrivy({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('cards:trivyScan.noScanData')).toBeInTheDocument()
      expect(screen.getByText(/cards:trivyScan.fixWithMission/)).toBeInTheDocument()
    })

    it('starts troubleshoot mission when fix button is clicked', async () => {
      const statuses = {
        prod: makeStatus({ totalReports: 0 }),
      }
      setupTrivy({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:trivyScan.fixWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'troubleshoot' }),
      )
    })
  })

  describe('vulnerability counts', () => {
    it('renders severity cards with vulnerability counts', () => {
      const aggregated = { critical: 3, high: 7, medium: 12, low: 25, unknown: 2 }
      setupTrivy({ installed: true, statuses: {}, aggregated, totalClusters: 0, clustersChecked: 0 })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('25')).toBeInTheDocument()
    })

    it('renders cluster badges for installed clusters', () => {
      const statuses = {
        prod: makeStatus({ vulnerabilities: { critical: 2, high: 5, medium: 10, low: 20, unknown: 1 } }),
      }
      setupTrivy({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      const badges = screen.getAllByTestId('status-badge')
      expect(badges.some((b) => b.textContent?.includes('prod'))).toBe(true)
    })

    it('shows critical action text when critical vulnerabilities exist', () => {
      const aggregated = { critical: 3, high: 0, medium: 0, low: 0, unknown: 0 }
      setupTrivy({ installed: true, statuses: {}, aggregated })
      render(<TrivyScanCard config={{}} />)
      expect(screen.getByText('Patch immediately')).toBeInTheDocument()
    })

    it('does not show critical action text when no critical vulnerabilities', () => {
      const aggregated = { critical: 0, high: 2, medium: 0, low: 0, unknown: 0 }
      setupTrivy({ installed: true, statuses: {}, aggregated })
      render(<TrivyScanCard config={{}} />)
      expect(screen.queryByText('Patch immediately')).not.toBeInTheDocument()
    })

    it('opens cluster detail modal when cluster badge is clicked', async () => {
      const statuses = { prod: makeStatus() }
      setupTrivy({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<TrivyScanCard config={{}} />)
      const badge = screen.getByTestId('status-badge')
      await userEvent.click(badge)
      expect(screen.getByTestId('trivy-modal')).toBeInTheDocument()
    })
  })

  describe('cluster filter', () => {
    it('aggregates only selected cluster vulnerabilities', () => {
      const statuses = {
        prod: makeStatus({ cluster: 'prod', vulnerabilities: { critical: 5, high: 0, medium: 0, low: 0, unknown: 0 } }),
        staging: makeStatus({ cluster: 'staging', vulnerabilities: { critical: 3, high: 0, medium: 0, low: 0, unknown: 0 } }),
      }
      // aggregated shows full sum, filter selects only prod
      const aggregated = { critical: 8, high: 0, medium: 0, low: 0, unknown: 0 }
      setupTrivy({ installed: true, statuses, aggregated, totalClusters: 2, clustersChecked: 2 })
      mockSelectedClusters.mockReturnValue(['prod'])
      render(<TrivyScanCard config={{}} />)
      // When filter is active, only prod's critical=5 should show
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns demo data', () => {
      setupTrivy({ isDemoData: true })
      render(<TrivyScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })

    it('passes isFailed=true when fetch errors occur', () => {
      setupTrivy({ hasErrors: true })
      render(<TrivyScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })
})
