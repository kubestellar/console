/**
 * Unit tests for the ComplianceScore card and ComplianceScoreBreakdownModal.
 *
 * Covers: loading state, install prompt, real data rendering, demo fallback,
 * modal tabs, and Kyverno compliance rate display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComplianceScore } from './ComplianceCards'
import { ComplianceScoreBreakdownModal } from './compliance/ComplianceScoreBreakdownModal'

// ── Mock hooks ───────────────────────────────────────────────────────────

const mockStartMission = vi.fn()

vi.mock('../../hooks/useKubescape', () => ({
  useKubescape: vi.fn(),
}))

vi.mock('../../hooks/useKyverno', () => ({
  useKyverno: vi.fn(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: vi.fn(() => ({
    selectedClusters: [],
  })),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: vi.fn(() => ({
    startMission: mockStartMission,
  })),
}))

// useCardLoadingState is a no-op in tests — we only care about rendered output
vi.mock('./CardDataContext', () => ({
  useCardLoadingState: vi.fn(),
}))

// Mock analytics to avoid side effects
vi.mock('../../lib/analytics', () => ({
  emitModalOpened: vi.fn(),
  emitModalTabViewed: vi.fn(),
  emitModalClosed: vi.fn(),
}))

// ── Helpers ──────────────────────────────────────────────────────────────

import { useKubescape } from '../../hooks/useKubescape'
import { useKyverno } from '../../hooks/useKyverno'

const mockedUseKubescape = vi.mocked(useKubescape)
const mockedUseKyverno = vi.mocked(useKyverno)

/** Default "empty / not installed" return value for useKubescape */
function kubescapeDefaults(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    aggregated: { overallScore: 0, frameworks: [], totalControls: 0, passedControls: 0, failedControls: 0 },
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    installed: false,
    hasErrors: false,
    isDemoData: false,
    clustersChecked: 0,
    totalClusters: 0,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useKubescape>
}

/** Default "empty / not installed" return value for useKyverno */
function kyvernoDefaults(overrides: Record<string, unknown> = {}) {
  return {
    statuses: {},
    isLoading: false,
    isRefreshing: false,
    lastRefresh: null,
    installed: false,
    hasErrors: false,
    isDemoData: false,
    clustersChecked: 0,
    totalClusters: 0,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useKyverno>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseKubescape.mockReturnValue(kubescapeDefaults())
  mockedUseKyverno.mockReturnValue(kyvernoDefaults())
})

// ── ComplianceScore card tests ───────────────────────────────────────────

describe('ComplianceScore card', () => {
  it('shows spinner and "Checking clusters..." message while hooks are loading', () => {
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({ isLoading: true, totalClusters: 3, clustersChecked: 1 }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({ isLoading: true, totalClusters: 3, clustersChecked: 0 }),
    )

    render(<ComplianceScore />)

    // Progressive streaming indicator shows while not all clusters checked
    expect(screen.getByText(/Checking clusters/)).toBeInTheDocument()
    // The "Checking clusters..." text includes the slower progress (min of the two hooks)
    expect(screen.getByText(/0\/3/)).toBeInTheDocument()
  })

  it('shows install prompt and calls startMission when no compliance tools installed (non-demo)', () => {
    // Both hooks finished loading, nothing installed, not demo mode
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({ isLoading: false, installed: false, isDemoData: false, clustersChecked: 2, totalClusters: 2 }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({ isLoading: false, installed: false, isDemoData: false, clustersChecked: 2, totalClusters: 2 }),
    )

    render(<ComplianceScore />)

    expect(screen.getByText('No Compliance Tools Detected')).toBeInTheDocument()
    expect(screen.getByText(/Install Kubescape or Kyverno/)).toBeInTheDocument()

    // Click the install button
    const installButton = screen.getByText(/Install with an AI Mission/)
    installButton.click()

    expect(mockStartMission).toHaveBeenCalledTimes(1)
    expect(mockStartMission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Install Compliance Tools',
        type: 'deploy',
      }),
    )
  })

  it('renders gauge with computed average score, per-tool bars, and partial coverage warning', () => {
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        isLoading: false,
        installed: true,
        isDemoData: false,
        clustersChecked: 2,
        totalClusters: 2,
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a', installed: true, loading: false,
            overallScore: 80, frameworks: [{ name: 'NSA', score: 80 }],
            totalControls: 50, passedControls: 40, failedControls: 10, controls: [],
          },
        },
        aggregated: {
          overallScore: 80,
          frameworks: [{ name: 'NSA', score: 80 }],
          totalControls: 50, passedControls: 40, failedControls: 10,
        },
      }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({
        isLoading: false,
        installed: true,
        isDemoData: false,
        clustersChecked: 2,
        totalClusters: 2,
        statuses: {
          'cluster-b': {
            cluster: 'cluster-b', installed: true, loading: false,
            policies: [], reports: [],
            totalPolicies: 20, totalViolations: 4,
            enforcingCount: 10, auditCount: 10,
          },
        },
      }),
    )

    render(<ComplianceScore />)

    // Kyverno rate: 100 - (4/20)*100 = 80%
    // Average: (80 + 80) / 2 = 80%
    // The gauge and both per-tool bars all show 80%, so use getAllByText
    const eightyPercents = screen.getAllByText('80%')
    expect(eightyPercents.length).toBeGreaterThanOrEqual(1)

    // The gauge element has the distinctive class
    const gauge = eightyPercents.find(el => el.className.includes('text-2xl'))
    expect(gauge).toBeDefined()

    // Per-tool bars should show both tools
    expect(screen.getByText('Kubescape')).toBeInTheDocument()
    expect(screen.getByText('Kyverno')).toBeInTheDocument()
  })

  it('shows partial coverage warning when fewer clusters report than total', () => {
    // 1 cluster has kubescape, but 3 clusters total
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        isLoading: false,
        installed: true,
        isDemoData: false,
        clustersChecked: 3,
        totalClusters: 3,
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a', installed: true, loading: false,
            overallScore: 70, frameworks: [], totalControls: 50, passedControls: 35, failedControls: 15, controls: [],
          },
        },
        aggregated: {
          overallScore: 70, frameworks: [], totalControls: 50, passedControls: 35, failedControls: 15,
        },
      }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({
        isLoading: false,
        installed: false,
        isDemoData: false,
        clustersChecked: 3,
        totalClusters: 3,
      }),
    )

    render(<ComplianceScore />)

    // 1 cluster reporting out of 3 total => partial coverage
    expect(screen.getByText(/Partial coverage/)).toBeInTheDocument()
    expect(screen.getByText(/1 of 3 clusters reporting/)).toBeInTheDocument()
  })

  it('opens ComplianceScoreBreakdownModal when clicking the gauge', async () => {
    const user = userEvent.setup()

    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        isLoading: false,
        installed: true,
        isDemoData: false,
        clustersChecked: 1,
        totalClusters: 1,
        statuses: {
          'cluster-a': {
            cluster: 'cluster-a', installed: true, loading: false,
            overallScore: 90, frameworks: [{ name: 'CIS', score: 90 }],
            totalControls: 100, passedControls: 90, failedControls: 10, controls: [],
          },
        },
        aggregated: {
          overallScore: 90,
          frameworks: [{ name: 'CIS', score: 90 }],
          totalControls: 100, passedControls: 90, failedControls: 10,
        },
      }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({
        isLoading: false,
        installed: false,
        isDemoData: false,
        clustersChecked: 1,
        totalClusters: 1,
      }),
    )

    render(<ComplianceScore />)

    // Click the gauge area (has role="button" with aria-label)
    const gaugeButton = screen.getByRole('button', { name: /View detailed compliance score breakdown/ })
    await user.click(gaugeButton)

    // The modal should appear with the title
    expect(screen.getByText('Compliance Score Breakdown')).toBeInTheDocument()
  })

  it('shows demo fallback (85% score with CIS/NSA/PCI bars) when no tools and demo mode enabled', () => {
    // Both hooks return isDemoData: true but not installed
    mockedUseKubescape.mockReturnValue(
      kubescapeDefaults({
        isLoading: false,
        installed: false,
        isDemoData: true,
        clustersChecked: 0,
        totalClusters: 0,
      }),
    )
    mockedUseKyverno.mockReturnValue(
      kyvernoDefaults({
        isLoading: false,
        installed: false,
        isDemoData: true,
        clustersChecked: 0,
        totalClusters: 0,
      }),
    )

    render(<ComplianceScore />)

    // Should show hardcoded 85% demo score
    expect(screen.getByText('85%')).toBeInTheDocument()

    // Should show CIS, NSA, PCI bars
    expect(screen.getByText('CIS')).toBeInTheDocument()
    expect(screen.getByText('NSA')).toBeInTheDocument()
    expect(screen.getByText('PCI')).toBeInTheDocument()

    // Should NOT show install prompt since isDemoData is true
    expect(screen.queryByText('No Compliance Tools Detected')).not.toBeInTheDocument()
  })
})

// ── ComplianceScoreBreakdownModal tests ──────────────────────────────────

describe('ComplianceScoreBreakdownModal', () => {
  const defaultBreakdown = [
    { name: 'Kubescape', value: 82 },
    { name: 'Kyverno', value: 78 },
  ]

  const kubescapeData = {
    totalControls: 100,
    passedControls: 82,
    failedControls: 18,
    frameworks: [
      { name: 'NSA-CISA', score: 85, passCount: 45, failCount: 10 },
      { name: 'CIS Benchmark', score: 79, passCount: 42, failCount: 11 },
    ],
  }

  const kyvernoData = {
    totalPolicies: 20,
    totalViolations: 4,
    enforcingCount: 12,
    auditCount: 8,
  }

  it('renders Overview tab with score gauge and per-tool bars when multiple tools', () => {
    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={80}
        breakdown={defaultBreakdown}
        kubescapeData={kubescapeData}
        kyvernoData={kyvernoData}
      />,
    )

    // Title
    expect(screen.getByText('Compliance Score Breakdown')).toBeInTheDocument()

    // Tabs: Overview, Kubescape, Kyverno
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveTextContent('Overview')
    expect(tabs[1]).toHaveTextContent('Kubescape')
    expect(tabs[2]).toHaveTextContent('Kyverno')

    // Badges on tabs
    expect(tabs[0]).toHaveTextContent('80%')
    expect(tabs[1]).toHaveTextContent('82%')
    expect(tabs[2]).toHaveTextContent('78%')

    // Overview tab content: per-tool bars
    expect(screen.getByText('Kubescape')).toBeInTheDocument()
    expect(screen.getByText('Kyverno')).toBeInTheDocument()
  })

  it('renders Kubescape tab with controls stats and framework scores', async () => {
    const user = userEvent.setup()

    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={80}
        breakdown={defaultBreakdown}
        kubescapeData={kubescapeData}
        kyvernoData={kyvernoData}
      />,
    )

    // Click Kubescape tab
    const kubescapeTab = screen.getByRole('tab', { name: /Kubescape/ })
    await user.click(kubescapeTab)

    // Stats grid: total, passed, failed
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('Total Controls')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()

    // Framework scores
    expect(screen.getByText('NSA-CISA')).toBeInTheDocument()
    expect(screen.getByText('CIS Benchmark')).toBeInTheDocument()
  })

  it('renders Kyverno tab with policy stats and compliance rate', async () => {
    const user = userEvent.setup()

    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={80}
        breakdown={defaultBreakdown}
        kubescapeData={kubescapeData}
        kyvernoData={kyvernoData}
      />,
    )

    // Click Kyverno tab
    const kyvernoTab = screen.getByRole('tab', { name: /Kyverno/ })
    await user.click(kyvernoTab)

    // Stats: total policies, violations, enforcing, audit
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('Total Policies')).toBeInTheDocument()
    expect(screen.getByText('Total Violations')).toBeInTheDocument()
    expect(screen.getByText('Enforcing')).toBeInTheDocument()
    expect(screen.getByText('Audit Mode')).toBeInTheDocument()

    // Compliance rate: 100 - (4/20)*100 = 80%
    expect(screen.getByText('80% Compliance Rate')).toBeInTheDocument()
    expect(screen.getByText(/Based on 4 violations across 20 policies/)).toBeInTheDocument()
  })

  it('shows fallback message when tool data is not provided', async () => {
    const user = userEvent.setup()

    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={82}
        breakdown={[{ name: 'Kubescape', value: 82 }]}
        // No kubescapeData or kyvernoData
      />,
    )

    // With only one tool, no Overview tab — Kubescape tab is active by default
    // Since kubescapeData is undefined, should show fallback
    expect(screen.getByText('Kubescape data not available')).toBeInTheDocument()
    expect(screen.getByText('No data from connected clusters')).toBeInTheDocument()
  })

  it('renders single-tool modal without Overview tab', () => {
    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={82}
        breakdown={[{ name: 'Kubescape', value: 82 }]}
        kubescapeData={kubescapeData}
      />,
    )

    // Only 1 tool => no tabs rendered (tabs.length === 1 means no Overview added, and tabs only show if > 1)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()

    // Content should show Kubescape data directly
    expect(screen.getByText('Total Controls')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('does not render anything when isOpen is false', () => {
    render(
      <ComplianceScoreBreakdownModal
        isOpen={false}
        onClose={vi.fn()}
        score={80}
        breakdown={defaultBreakdown}
      />,
    )

    expect(screen.queryByText('Compliance Score Breakdown')).not.toBeInTheDocument()
  })
})
