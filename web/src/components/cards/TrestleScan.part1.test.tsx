import React from 'react'
/**
 * Unit tests for the TrestleScan (Compliance Trestle / OSCAL) card component.
 *
 * Part 1 of 2 — covers loading, not-installed, degraded, healthy render,
 * and profile expansion. See TrestleScan.part2.test.tsx for the rest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      expect(screen.getByText('85 controls passed')).toBeInTheDocument()
      expect(screen.getByText('10 controls failed')).toBeInTheDocument()
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
      const controlsBadges = screen.getAllByText('100 controls')
      expect(controlsBadges.length).toBeGreaterThanOrEqual(1)
    })

    it('clicking total controls opens compliance drilldown', async () => {
      const user = userEvent.setup()
      setTrestleReturn()

      render(<TrestleScan />)
      const allControlsButtons = screen.getAllByTitle('View all compliance controls')
      await user.click(allControlsButtons[0])

      expect(mockDrillToCompliance).toHaveBeenCalledWith('', {})
    })

    it('each profile has controls button that opens compliance drilldown with profile context', async () => {
      const user = userEvent.setup()
      setTrestleReturn()

      render(<TrestleScan />)
      await user.click(screen.getByTitle('View NIST 800-53 rev5 controls'))

      expect(mockDrillToCompliance).toHaveBeenCalledWith('', { profile: 'NIST 800-53 rev5' })
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

    it('expanded pass/fail/other chips open compliance dialog with profile + status', async () => {
      const user = userEvent.setup()
      setTrestleReturn()

      render(<TrestleScan />)
      await user.click(screen.getByText('NIST 800-53 rev5'))

      await user.click(screen.getByTitle('View passing controls for NIST 800-53 rev5'))
      expect(mockDrillToCompliance).toHaveBeenCalledWith('pass', { profile: 'NIST 800-53 rev5' })

      await user.click(screen.getByTitle('View failing controls for NIST 800-53 rev5'))
      expect(mockDrillToCompliance).toHaveBeenCalledWith('fail', { profile: 'NIST 800-53 rev5' })

      await user.click(screen.getByTitle('View other controls for NIST 800-53 rev5'))
      expect(mockDrillToCompliance).toHaveBeenCalledWith('other', { profile: 'NIST 800-53 rev5' })
    })
  })
})
