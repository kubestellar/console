import React from 'react'
/**
 * Unit tests for the TrestleScan (Compliance Trestle / OSCAL) card component.
 *
 * Part 2 of 2 — covers cluster filtering, refresh indicators, card loading
 * lifecycle integration, and edge cases. See TrestleScan.part1.test.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen} from '@testing-library/react'
import { TrestleScan } from './TrestleScan'
import type { TrestleClusterStatus, OscalProfile } from '../../hooks/useTrestle'

// ── Mock react-i18next to return interpolated translation values ─────────
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Map known keys to English text for test assertions
      const translations: Record<string, string> = {
        'cards:trestleScan.checkingClusters': 'Checking clusters... {{checked}}/{{total}}',
        'cards:trestleScan.cncfSandbox': 'Compliance Trestle (CNCF Sandbox)',
        'cards:trestleScan.complianceAsCode': 'Compliance-as-code using NIST OSCAL. Automates compliance assessment and bridges OSCAL to Kubernetes policy engines.',
        'cards:trestleScan.installWithMission': 'Install with AI Mission',
        'cards:trestleScan.docs': 'Docs',
        'cards:trestleScan.installedNoAssessments': 'Trestle Installed — No Assessments',
        'cards:trestleScan.noAssessmentsDescription': 'Compliance Trestle is deployed but no OSCAL assessment results have been generated yet.',
        'cards:trestleScan.troubleshootWithAI': 'Troubleshoot with AI',
        'cards:trestleScan.viewAllControls': 'View all compliance controls',
        'cards:trestleScan.viewPassingControls': 'View passing controls',
        'cards:trestleScan.viewFailingControls': 'View failing controls',
        'cards:trestleScan.viewOtherControls': 'View other controls',
        'cards:trestleScan.passed': 'passed',
        'cards:trestleScan.failed': 'failed',
        'cards:trestleScan.controlsPassed': 'controls passed',
        'cards:trestleScan.controlsFailed': 'controls failed',
        'cards:trestleScan.other': 'other',
        'cards:trestleScan.controls': '{{count}} controls',
        'cards:trestleScan.oscalCompliance': 'OSCAL Compliance',
        'cards:trestleScan.oscalDescription': 'Automated assessment using NIST OSCAL framework via Compliance Trestle (CNCF Sandbox).',
        'cards:trestleScan.noProfilesAssessed': 'No profiles assessed',
        'cards:trestleScan.toggleProfileDetails': 'Toggle {{name}} details',
        'cards:trestleScan.viewProfileControls': 'View {{name}} controls',
        'cards:trestleScan.viewPassingProfileControls': 'View passing controls for {{name}}',
        'cards:trestleScan.viewFailingProfileControls': 'View failing controls for {{name}}',
        'cards:trestleScan.viewOtherProfileControls': 'View other controls for {{name}}',
        'cards:trestleScan.pass': 'pass',
        'cards:trestleScan.fail': 'fail',
        'cards:trestleScan.perClusterCompliance': 'Per-cluster compliance',
      }
      let result = translations[key] ?? key
      // Interpolate {{variable}} patterns from opts
      if (opts) {
        for (const [k, v] of Object.entries(opts)) {
          result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
        }
      }
      return result
    },
    i18n: { language: 'en' },
  }),
}))

// ── Mock dependencies ────────────────────────────────────────────────────

const mockStartMission = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockDrillToCompliance = vi.fn()

vi.mock('../../hooks/useTrestle', () => ({
  useTrestle: vi.fn(),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: mockStartMission }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({ drillToCompliance: mockDrillToCompliance }),
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
