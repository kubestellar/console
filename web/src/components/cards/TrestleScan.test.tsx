/**
 * Unit tests for the TrestleScan (Compliance Trestle / OSCAL) card component.
 *
 * Covers: loading state, not-installed state, degraded state, healthy render,
 * profile expansion, cluster filtering, refresh indicators, and card loading
 * lifecycle integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrestleScan } from './TrestleScan'
import type { TrestleClusterStatus, OscalProfile } from '../../hooks/useTrestle'

// ── Mock dependencies ────────────────────────────────────────────────────

const mockStartMission = vi.fn()
const mockUseCardLoadingState = vi.fn()

vi.mock('../../hooks/useTrestle', () => ({
  useTrestle: vi.fn(),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({ selectedClusters: mockSelectedClusters }),
}))

vi.mock('./CardDataContext', () => ({
  useCardLoadingState: (args: unknown) => mockUseCardLoadingState(args),
}))

vi.mock('../ui/RefreshIndicator', () => ({
  RefreshIndicator: ({ isRefreshing }: { isRefreshing: boolean }) =>
    isRefreshing ? <div data-testid="refresh-indicator">Refreshing...</div> : null,
}))

vi.mock('../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="status-badge">{children}</span>
  ),
}))

// ── Helpers ──────────────────────────────────────────────────────────────

import { useTrestle } from '../../hooks/useTrestle'
const mockUseTrestle = vi.mocked(useTrestle)

let mockSelectedClusters: string[] = []

function makeProfile(overrides: Partial<OscalProfile> = {}): OscalProfile {
  return {
    name: 'NIST 800-53 rev5',
    totalControls: 100,
    controlsPassed: 85,
    controlsFailed: 10,
    controlsOther: 5,
    ...overrides,
  }
}

function makeClusterStatus(overrides: Partial<TrestleClusterStatus> = {}): TrestleClusterStatus {
  return {
    cluster: 'cluster-1',
    installed: true,
    loading: false,
    overallScore: 85,
    profiles: [makeProfile()],
    totalControls: 100,
    passedControls: 85,
    failedControls: 10,
    otherControls: 5,
    controlResults: [],
    lastAssessment: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

function setTrestleReturn(overrides: Partial<ReturnType<typeof useTrestle>> = {}) {
  const defaults: ReturnType<typeof useTrestle> = {
    statuses: { 'cluster-1': makeClusterStatus() },
    aggregated: { totalControls: 100, passedControls: 85, failedControls: 10, otherControls: 5, overallScore: 85 },
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    installed: true,
    isDemoData: false,
    clustersChecked: 1,
    totalClusters: 1,
    refetch: vi.fn(),
  }
  mockUseTrestle.mockReturnValue({ ...defaults, ...overrides })
}

// ── Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockSelectedClusters = []
})

// ── Tests ────────────────────────────────────────────────────────────────

describe('TrestleScan', () => {
  // ── 1) Loading state ─────────────────────────────────────────────────

  describe('loading state', () => {
    it('renders spinner when isLoading and statuses is empty', () => {
      setTrestleReturn({
        isLoading: true,
        statuses: {},
        installed: false,
        totalClusters: 0,
        clustersChecked: 0,
      })

      const { container } = render(<TrestleScan />)
      // Should show a spinner (Loader2 renders an svg with animate-spin class)
      const spinner = container.querySelector('.animate-spin')
      expect(spinner).toBeTruthy()
    })

    it('shows cluster progress text when totalClusters > 0', () => {
      setTrestleReturn({
        isLoading: true,
        statuses: {},
        installed: false,
        totalClusters: 5,
        clustersChecked: 2,
      })

      render(<TrestleScan />)
      expect(screen.getByText('Checking clusters... 2/5')).toBeInTheDocument()
    })

    it('does not show progress text when totalClusters is 0', () => {
      setTrestleReturn({
        isLoading: true,
        statuses: {},
        installed: false,
        totalClusters: 0,
        clustersChecked: 0,
      })

      render(<TrestleScan />)
      expect(screen.queryByText(/Checking clusters/)).not.toBeInTheDocument()
    })
  })

  // ── 2) Not installed state ───────────────────────────────────────────

  describe('not installed state', () => {
    it('renders install prompt when not installed and not demo data', () => {
      setTrestleReturn({
        statuses: {},
        installed: false,
        isDemoData: false,
        isLoading: false,
        aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 },
      })

      render(<TrestleScan />)
      expect(screen.getByText('Compliance Trestle (CNCF Sandbox)')).toBeInTheDocument()
      expect(screen.getByText(/Compliance-as-code using NIST OSCAL/)).toBeInTheDocument()
      expect(screen.getByText(/Install with AI Mission/)).toBeInTheDocument()
      expect(screen.getByText('Docs')).toBeInTheDocument()
    })

    it('clicking Install with AI Mission calls startMission with deploy payload', async () => {
      const user = userEvent.setup()
      setTrestleReturn({
        statuses: {},
        installed: false,
        isDemoData: false,
        isLoading: false,
        aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 },
      })

      render(<TrestleScan />)
      await user.click(screen.getByText(/Install with AI Mission/))

      expect(mockStartMission).toHaveBeenCalledTimes(1)
      const callArgs = mockStartMission.mock.calls[0][0]
      expect(callArgs.title).toBe('Install Compliance Trestle')
      expect(callArgs.type).toBe('deploy')
      expect(callArgs.context).toEqual({})
    })
  })

  // ── 3) Degraded state ────────────────────────────────────────────────

  describe('degraded state', () => {
    it('renders degraded warning when installed clusters have totalControls=0', () => {
      setTrestleReturn({
        statuses: {
          'cluster-1': makeClusterStatus({ installed: true, totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0, profiles: [] }),
        },
        installed: true,
        isDemoData: false,
        isLoading: false,
        aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 },
      })

      render(<TrestleScan />)
      expect(screen.getByText(/Trestle Installed — No Assessments/)).toBeInTheDocument()
      expect(screen.getByText(/no OSCAL assessment results/)).toBeInTheDocument()
    })

    it('clicking Troubleshoot with AI calls startMission with troubleshoot payload', async () => {
      const user = userEvent.setup()
      setTrestleReturn({
        statuses: {
          'cluster-1': makeClusterStatus({ installed: true, totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0, profiles: [] }),
        },
        installed: true,
        isDemoData: false,
        isLoading: false,
        aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 },
      })

      render(<TrestleScan />)
      await user.click(screen.getByText(/Troubleshoot with AI/))

      expect(mockStartMission).toHaveBeenCalledTimes(1)
      const callArgs = mockStartMission.mock.calls[0][0]
      expect(callArgs.title).toBe('Troubleshoot Compliance Trestle')
      expect(callArgs.type).toBe('troubleshoot')
      expect(callArgs.context).toEqual({})
    })
  })

  // ── 4) Healthy/normal render state ───────────────────────────────────

  describe('healthy render state', () => {
    it('renders overall score, score label, and pass/fail/other counters', () => {
      setTrestleReturn()

      render(<TrestleScan />)
      // Overall score appears in both the main display and profile row — use getAllByText
      const scoreElements = screen.getAllByText('85%')
      expect(scoreElements.length).toBeGreaterThanOrEqual(1)
      // The main score has the text-3xl class
      const mainScore = scoreElements.find(el => el.className.includes('text-3xl'))
      expect(mainScore).toBeTruthy()
      expect(screen.getByText('Good')).toBeInTheDocument()
      expect(screen.getByText('85 passed')).toBeInTheDocument()
      expect(screen.getByText('10 failed')).toBeInTheDocument()
      expect(screen.getByText('5 other')).toBeInTheDocument()
    })

    it('renders profile list entries', () => {
      setTrestleReturn()

      render(<TrestleScan />)
      expect(screen.getByText('NIST 800-53 rev5')).toBeInTheDocument()
    })

    it('renders multiple profiles', () => {
      const statuses = {
        'cluster-1': makeClusterStatus({
          profiles: [
            makeProfile({ name: 'NIST 800-53 rev5' }),
            makeProfile({ name: 'FedRAMP Moderate', totalControls: 50, controlsPassed: 40, controlsFailed: 8, controlsOther: 2 }),
          ],
        }),
      }
      setTrestleReturn({ statuses })

      render(<TrestleScan />)
      expect(screen.getByText('NIST 800-53 rev5')).toBeInTheDocument()
      expect(screen.getByText('FedRAMP Moderate')).toBeInTheDocument()
    })

    it('renders OSCAL context banner', () => {
      setTrestleReturn()

      render(<TrestleScan />)
      expect(screen.getByText('OSCAL Compliance')).toBeInTheDocument()
      expect(screen.getByText(/NIST OSCAL framework/)).toBeInTheDocument()
    })

    it('renders CNCF badge and OSCAL Compass link', () => {
      setTrestleReturn()

      render(<TrestleScan />)
      expect(screen.getByText('CNCF Sandbox')).toBeInTheDocument()
      expect(screen.getByText('OSCAL Compass')).toBeInTheDocument()
    })

    it('shows "Needs Attention" label for scores between 60-79', () => {
      setTrestleReturn({
        aggregated: { totalControls: 100, passedControls: 70, failedControls: 20, otherControls: 10, overallScore: 70 },
      })

      render(<TrestleScan />)
      expect(screen.getByText('70%')).toBeInTheDocument()
      expect(screen.getByText('Needs Attention')).toBeInTheDocument()
    })

    it('shows "Critical" label for scores below 60', () => {
      setTrestleReturn({
        aggregated: { totalControls: 100, passedControls: 40, failedControls: 50, otherControls: 10, overallScore: 40 },
      })

      render(<TrestleScan />)
      expect(screen.getByText('40%')).toBeInTheDocument()
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })

    it('hides other counter when otherControls is 0', () => {
      setTrestleReturn({
        aggregated: { totalControls: 100, passedControls: 90, failedControls: 10, otherControls: 0, overallScore: 90 },
      })

      render(<TrestleScan />)
      expect(screen.queryByText(/other$/)).not.toBeInTheDocument()
    })

    it('shows total controls count in status badge', () => {
      setTrestleReturn()

      render(<TrestleScan />)
      expect(screen.getByText('100 controls')).toBeInTheDocument()
    })
  })

  // ── 5) Profile interaction ───────────────────────────────────────────

  describe('profile interaction', () => {
    it('clicking a profile row expands details showing pass/fail/other breakdown', async () => {
      const user = userEvent.setup()
      setTrestleReturn()

      render(<TrestleScan />)

      // Before click, expanded details should not be visible
      // Note: "85 passed" is the summary counter; "85 pass" is the expanded detail
      expect(screen.queryByText('85 pass')).not.toBeInTheDocument()

      // Click to expand (use the profile name button)
      await user.click(screen.getByText('NIST 800-53 rev5'))
      expect(screen.getByText('85 pass')).toBeInTheDocument()
      expect(screen.getByText('10 fail')).toBeInTheDocument()
      // "5 other" appears both in the summary and expanded detail — use getAllByText
      const otherElements = screen.getAllByText('5 other')
      expect(otherElements.length).toBeGreaterThanOrEqual(1)
    })

    it('clicking an expanded profile again collapses it (toggle)', async () => {
      const user = userEvent.setup()
      setTrestleReturn()

      render(<TrestleScan />)

      // Expand
      await user.click(screen.getByText('NIST 800-53 rev5'))
      expect(screen.getByText('85 pass')).toBeInTheDocument()

      // Collapse
      await user.click(screen.getByText('NIST 800-53 rev5'))
      expect(screen.queryByText('85 pass')).not.toBeInTheDocument()
    })

    it('expanding one profile and clicking another switches expanded profile', async () => {
      const user = userEvent.setup()
      const statuses = {
        'cluster-1': makeClusterStatus({
          profiles: [
            makeProfile({ name: 'Profile A', controlsPassed: 50, controlsFailed: 30, controlsOther: 20 }),
            makeProfile({ name: 'Profile B', controlsPassed: 80, controlsFailed: 15, controlsOther: 5 }),
          ],
        }),
      }
      setTrestleReturn({ statuses })

      render(<TrestleScan />)

      // Expand Profile A
      await user.click(screen.getByText('Profile A'))
      expect(screen.getByText('50 pass')).toBeInTheDocument()

      // Click Profile B — should expand B and collapse A
      await user.click(screen.getByText('Profile B'))
      expect(screen.getByText('80 pass')).toBeInTheDocument()
      expect(screen.queryByText('50 pass')).not.toBeInTheDocument()
    })
  })

  // ── 6) Cluster filtering ─────────────────────────────────────────────

  describe('cluster filtering', () => {
    it('recomputes aggregated values from selected clusters only', () => {
      const statuses = {
        'cluster-1': makeClusterStatus({
          cluster: 'cluster-1',
          installed: true,
          totalControls: 100,
          passedControls: 90,
          failedControls: 5,
          otherControls: 5,
          overallScore: 90,
        }),
        'cluster-2': makeClusterStatus({
          cluster: 'cluster-2',
          installed: true,
          totalControls: 100,
          passedControls: 40,
          failedControls: 50,
          otherControls: 10,
          overallScore: 40,
        }),
      }

      // Select only cluster-1
      mockSelectedClusters = ['cluster-1']
      setTrestleReturn({
        statuses,
        aggregated: { totalControls: 200, passedControls: 130, failedControls: 55, otherControls: 15, overallScore: 65 },
        totalClusters: 2,
        clustersChecked: 2,
      })

      render(<TrestleScan />)
      // Filtered score should be from cluster-1 only: 90/100 = 90%
      expect(screen.getByText('90%')).toBeInTheDocument()
      expect(screen.getByText('Good')).toBeInTheDocument()
    })

    it('per-cluster badges only show selected clusters', () => {
      const statuses = {
        'cluster-1': makeClusterStatus({
          cluster: 'cluster-1',
          installed: true,
          overallScore: 90,
        }),
        'cluster-2': makeClusterStatus({
          cluster: 'cluster-2',
          installed: true,
          overallScore: 40,
        }),
      }

      mockSelectedClusters = ['cluster-1']
      setTrestleReturn({
        statuses,
        aggregated: { totalControls: 200, passedControls: 130, failedControls: 55, otherControls: 15, overallScore: 65 },
        totalClusters: 2,
        clustersChecked: 2,
      })

      render(<TrestleScan />)
      // Per-cluster badges: only cluster-1 should be shown
      expect(screen.getByText('cluster-1: 90%')).toBeInTheDocument()
      expect(screen.queryByText('cluster-2: 40%')).not.toBeInTheDocument()
    })

    it('shows all cluster badges when no clusters are selected', () => {
      const statuses = {
        'cluster-1': makeClusterStatus({
          cluster: 'cluster-1',
          installed: true,
          overallScore: 90,
        }),
        'cluster-2': makeClusterStatus({
          cluster: 'cluster-2',
          installed: true,
          overallScore: 40,
        }),
      }

      mockSelectedClusters = []
      setTrestleReturn({
        statuses,
        aggregated: { totalControls: 200, passedControls: 130, failedControls: 55, otherControls: 15, overallScore: 65 },
        totalClusters: 2,
        clustersChecked: 2,
      })

      render(<TrestleScan />)
      expect(screen.getByText('cluster-1: 90%')).toBeInTheDocument()
      expect(screen.getByText('cluster-2: 40%')).toBeInTheDocument()
    })
  })

  // ── 7) Refresh behavior ──────────────────────────────────────────────

  describe('refresh behavior', () => {
    it('shows refresh indicator when isRefreshing and lastRefresh exist', () => {
      setTrestleReturn({
        isRefreshing: true,
        lastRefresh: new Date('2026-01-15T10:00:00Z'),
      })

      render(<TrestleScan />)
      expect(screen.getByTestId('refresh-indicator')).toBeInTheDocument()
    })

    it('does not show refresh indicator when not refreshing', () => {
      setTrestleReturn({
        isRefreshing: false,
        lastRefresh: new Date('2026-01-15T10:00:00Z'),
      })

      render(<TrestleScan />)
      expect(screen.queryByTestId('refresh-indicator')).not.toBeInTheDocument()
    })

    it('shows streaming progress when not all clusters are checked', () => {
      setTrestleReturn({
        isRefreshing: false,
        totalClusters: 5,
        clustersChecked: 3,
      })

      render(<TrestleScan />)
      expect(screen.getByText('Checking clusters... 3/5')).toBeInTheDocument()
    })

    it('does not show streaming progress when all clusters are checked', () => {
      setTrestleReturn({
        isRefreshing: false,
        totalClusters: 3,
        clustersChecked: 3,
      })

      render(<TrestleScan />)
      expect(screen.queryByText(/Checking clusters/)).not.toBeInTheDocument()
    })
  })

  // ── 8) Card loading lifecycle integration ────────────────────────────

  describe('card loading lifecycle', () => {
    it('calls useCardLoadingState with correct args when installed', () => {
      setTrestleReturn({
        isLoading: false,
        installed: true,
        isDemoData: false,
      })

      render(<TrestleScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith({
        isLoading: false,
        isRefreshing: false,
        hasAnyData: true,
        isDemoData: false,
      })
    })

    it('calls useCardLoadingState with hasAnyData=true when isDemoData', () => {
      setTrestleReturn({
        isLoading: false,
        installed: false,
        isDemoData: true,
        statuses: { 'cluster-1': makeClusterStatus() },
        aggregated: { totalControls: 100, passedControls: 85, failedControls: 10, otherControls: 5, overallScore: 85 },
      })

      render(<TrestleScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith({
        isLoading: false,
        isRefreshing: false,
        hasAnyData: true,  // installed || isDemoData => false || true
        isDemoData: true,
      })
    })

    it('calls useCardLoadingState with hasAnyData=false when not installed and not demo', () => {
      setTrestleReturn({
        isLoading: false,
        installed: false,
        isDemoData: false,
        statuses: {},
        aggregated: { totalControls: 0, passedControls: 0, failedControls: 0, otherControls: 0, overallScore: 0 },
      })

      render(<TrestleScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith({
        isLoading: false,
        isRefreshing: false,
        hasAnyData: false,
        isDemoData: false,
      })
    })

    it('passes isLoading=true during loading', () => {
      setTrestleReturn({
        isLoading: true,
        statuses: {},
        installed: false,
        isDemoData: false,
        totalClusters: 0,
        clustersChecked: 0,
      })

      render(<TrestleScan />)
      expect(mockUseCardLoadingState).toHaveBeenCalledWith({
        isLoading: true,
        isRefreshing: false,
        hasAnyData: false,
        isDemoData: false,
      })
    })
  })

  // ── Edge cases ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders "No profiles assessed" when allProfiles is empty in healthy state', () => {
      setTrestleReturn({
        statuses: {
          'cluster-1': makeClusterStatus({
            installed: true,
            totalControls: 10,
            passedControls: 8,
            failedControls: 2,
            otherControls: 0,
            overallScore: 80,
            profiles: [],
          }),
        },
        aggregated: { totalControls: 10, passedControls: 8, failedControls: 2, otherControls: 0, overallScore: 80 },
      })

      render(<TrestleScan />)
      expect(screen.getByText('No profiles assessed')).toBeInTheDocument()
    })

    it('does not show per-cluster section when only one installed cluster', () => {
      setTrestleReturn({
        statuses: {
          'cluster-1': makeClusterStatus({ installed: true }),
        },
      })

      render(<TrestleScan />)
      expect(screen.queryByText('Per-cluster compliance')).not.toBeInTheDocument()
    })

    it('shows per-cluster section when multiple installed clusters exist', () => {
      const statuses = {
        'cluster-1': makeClusterStatus({ cluster: 'cluster-1', installed: true }),
        'cluster-2': makeClusterStatus({ cluster: 'cluster-2', installed: true }),
      }
      setTrestleReturn({
        statuses,
        totalClusters: 2,
        clustersChecked: 2,
      })

      render(<TrestleScan />)
      expect(screen.getByText('Per-cluster compliance')).toBeInTheDocument()
    })

    it('renders 0% score correctly', () => {
      setTrestleReturn({
        aggregated: { totalControls: 100, passedControls: 0, failedControls: 100, otherControls: 0, overallScore: 0 },
        statuses: {
          'cluster-1': makeClusterStatus({
            installed: true,
            totalControls: 100,
            passedControls: 0,
            failedControls: 100,
            otherControls: 0,
            overallScore: 0,
            profiles: [makeProfile({ controlsPassed: 0, controlsFailed: 100, controlsOther: 0 })],
          }),
        },
      })

      render(<TrestleScan />)
      // 0% appears in both overall and profile — check at least one exists with main style
      const scores = screen.getAllByText('0%')
      expect(scores.length).toBeGreaterThanOrEqual(1)
      expect(scores.find(el => el.className.includes('text-3xl'))).toBeTruthy()
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })

    it('renders 100% score correctly', () => {
      setTrestleReturn({
        aggregated: { totalControls: 100, passedControls: 100, failedControls: 0, otherControls: 0, overallScore: 100 },
        statuses: {
          'cluster-1': makeClusterStatus({
            installed: true,
            totalControls: 100,
            passedControls: 100,
            failedControls: 0,
            otherControls: 0,
            overallScore: 100,
            profiles: [makeProfile({ controlsPassed: 100, controlsFailed: 0, controlsOther: 0 })],
          }),
        },
      })

      render(<TrestleScan />)
      // 100% appears in both overall and profile
      const scores = screen.getAllByText('100%')
      expect(scores.length).toBeGreaterThanOrEqual(1)
      expect(scores.find(el => el.className.includes('text-3xl'))).toBeTruthy()
      expect(screen.getByText('Good')).toBeInTheDocument()
    })

    it('accepts optional config prop without errors', () => {
      setTrestleReturn()
      expect(() => {
        render(<TrestleScan config={{ customKey: 'value' }} />)
      }).not.toThrow()
    })
  })
})
