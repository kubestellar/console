import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KubescapeScanCard } from '../KubescapeScanCard'
import type { KubescapeClusterStatus } from '../../../../hooks/useKubescape'

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

vi.mock('../../ui/StatusBadge', () => ({
  StatusBadge: ({ children, color }: { children: ReactNode; color: string }) => (
    <span data-testid="status-badge" data-color={color}>{children}</span>
  ),
}))

vi.mock('../../kubescape/KubescapeDetailModal', () => ({
  KubescapeDetailModal: ({ isOpen, clusterName }: { isOpen: boolean; clusterName: string }) =>
    isOpen ? <div data-testid="kubescape-modal">{clusterName}</div> : null,
}))

vi.mock('../../../../lib/constants/compliance', () => ({
  getFrameworkInfo: vi.fn((name: string) => ({
    label: name,
    description: `${name} framework`,
    url: `https://example.com/${name}`,
  })),
  getScoreContext: vi.fn((score: number) => ({
    label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor',
    color: score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400',
    description: 'Security posture overview',
  })),
}))

vi.mock('../../../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStatus(overrides: Partial<KubescapeClusterStatus> = {}): KubescapeClusterStatus {
  return {
    cluster: 'prod',
    installed: true,
    loading: false,
    overallScore: 78,
    frameworks: [{ name: 'NSA-CISA', score: 82, passCount: 45, failCount: 10 }],
    totalControls: 55,
    passedControls: 45,
    failedControls: 10,
    controls: [],
    ...overrides,
  }
}

function setupKubescape(overrides: Record<string, unknown> = {}) {
  mockUseKubescape.mockReturnValue({
    statuses: {},
    aggregated: { overallScore: 78, frameworks: [], totalControls: 55, passedControls: 45, failedControls: 10 },
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

describe('KubescapeScanCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupKubescape()
  })

  describe('unavailable state', () => {
    it('shows unavailable message when unavailableReason is set', () => {
      setupKubescape({ unavailableReason: 'in-cluster mode' })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('Security posture scanning not available')).toBeInTheDocument()
      expect(screen.getByText('Requires kc-agent (local agent mode)')).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows spinner while loading with no statuses', () => {
      setupKubescape({ isLoading: true, statuses: {} })
      render(<KubescapeScanCard config={{}} />)
      // Loader2 spinner is rendered — no crash
      expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('shows cluster progress text during initial load', () => {
      setupKubescape({ isLoading: true, statuses: {}, totalClusters: 3, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('checking-1-3')).toBeInTheDocument()
    })
  })

  describe('install prompt', () => {
    it('shows install prompt when not installed and not loading', () => {
      setupKubescape({ installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.integration')).toBeInTheDocument()
      expect(screen.getByText(/cards:kubescapeScan.installWithMission/)).toBeInTheDocument()
    })

    it('starts deploy mission when install button is clicked', async () => {
      setupKubescape({ installed: false, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:kubescapeScan.installWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'deploy', title: 'Install Kubescape' }),
      )
    })
  })

  describe('error state', () => {
    it('shows error banner when fetch fails', () => {
      setupKubescape({ hasErrors: true, installed: false })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.failedToFetch')).toBeInTheDocument()
      expect(screen.getByText(/cards:kubescapeScan.retry/)).toBeInTheDocument()
    })

    it('triggers refetch when retry is clicked', async () => {
      const mockRefetch = vi.fn()
      setupKubescape({ hasErrors: true, installed: false, refetch: mockRefetch })
      render(<KubescapeScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:kubescapeScan.retry/))
      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe('degraded state', () => {
    it('shows troubleshoot prompt when installed but no scan data', () => {
      const statuses = {
        prod: makeStatus({ totalControls: 0, frameworks: [] }),
      }
      setupKubescape({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('cards:kubescapeScan.noScanData')).toBeInTheDocument()
      expect(screen.getByText(/cards:kubescapeScan.fixWithMission/)).toBeInTheDocument()
    })

    it('starts troubleshoot mission when fix button is clicked', async () => {
      const statuses = {
        prod: makeStatus({ totalControls: 0, frameworks: [] }),
      }
      setupKubescape({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      await userEvent.click(screen.getByText(/cards:kubescapeScan.fixWithMission/))
      expect(mockStartMission).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'troubleshoot' }),
      )
    })
  })

  describe('scan results display', () => {
    it('renders cluster score badges for installed clusters', () => {
      const statuses = { prod: makeStatus() }
      setupKubescape({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      const badges = screen.getAllByTestId('status-badge')
      expect(badges.some((b) => b.textContent?.includes('prod'))).toBe(true)
    })

    it('renders framework scores from aggregated data', () => {
      const aggregated = {
        overallScore: 78,
        frameworks: [{ name: 'NSA-CISA', score: 82, passCount: 45, failCount: 10 }],
        totalControls: 55,
        passedControls: 45,
        failedControls: 10,
      }
      setupKubescape({ installed: true, statuses: {}, aggregated, totalClusters: 0, clustersChecked: 0 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('NSA-CISA')).toBeInTheDocument()
      expect(screen.getByText('82%')).toBeInTheDocument()
    })

    it('renders passed and failed control counts', () => {
      const aggregated = {
        overallScore: 78,
        frameworks: [],
        totalControls: 55,
        passedControls: 45,
        failedControls: 10,
      }
      setupKubescape({ installed: true, statuses: {}, aggregated, totalClusters: 0, clustersChecked: 0 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText(/45/)).toBeInTheDocument()
      expect(screen.getByText(/10/)).toBeInTheDocument()
    })

    it('opens cluster detail modal when cluster badge is clicked', async () => {
      const statuses = { prod: makeStatus() }
      setupKubescape({ installed: true, statuses, totalClusters: 1, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      const badge = screen.getByTestId('status-badge')
      await userEvent.click(badge)
      expect(screen.getByTestId('kubescape-modal')).toBeInTheDocument()
    })
  })

  describe('useCardLoadingState integration', () => {
    it('passes isDemoData=true when hook returns demo data', () => {
      setupKubescape({ isDemoData: true })
      render(<KubescapeScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isDemoData: true, hasAnyData: true }),
      )
    })

    it('passes isFailed=true when fetch errors occur', () => {
      setupKubescape({ hasErrors: true })
      render(<KubescapeScanCard config={{}} />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith(
        expect.objectContaining({ isFailed: true }),
      )
    })
  })

  describe('progress indicator', () => {
    it('shows checking progress when not all clusters checked', () => {
      const statuses = { prod: makeStatus() }
      setupKubescape({ installed: true, statuses, totalClusters: 3, clustersChecked: 1 })
      render(<KubescapeScanCard config={{}} />)
      expect(screen.getByText('checking-1-3')).toBeInTheDocument()
    })
  })
})
