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

// ── Mock react-i18next to return interpolated translation values ─────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'cards:complianceScore.checkingClusters': 'Checking clusters... {{checked}}/{{total}}',
        'cards:complianceScore.noToolsDetected': 'No Compliance Tools Detected',
        'cards:complianceScore.installDescription': 'Install Kubescape or Kyverno to see live compliance scores.',
        'cards:complianceScore.installWithMission': 'Install with an AI Mission',
        'cards:complianceScore.partialCoverage': 'Partial coverage — {{reporting}} of {{total}} clusters reporting. Score may not reflect full cluster state.',
        'cards:complianceScore.viewBreakdownAria': 'View detailed compliance score breakdown',
        'cards:complianceScore.clickForBreakdown': 'Click for detailed breakdown',
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

    // Overview tab content: per-tool bars. Scope the assertion to the "By tool"
    // section so it survives refactors that change other parts of the modal
    // (#7908 — Copilot review on #7905 flagged the prior getAllByText as too
    // broad). The `<h4>By tool</h4>` heading sits next to the bar list inside
    // the same parent container.
    const byToolHeading = screen.getByText('By tool')
    const byToolSection = byToolHeading.parentElement!
    expect(within(byToolSection).getByText('Kubescape')).toBeInTheDocument()
    expect(within(byToolSection).getByText('Kyverno')).toBeInTheDocument()
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

  it('shows fallback message when tool data is not provided (after clicking tool tab)', async () => {
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

    // Since #7893, Overview is always the default landing tab — so the
    // fallback for the Kubescape tool is only reached after the user clicks
    // the Kubescape tab explicitly.
    const kubescapeTab = screen.getByRole('tab', { name: /Kubescape/ })
    await user.click(kubescapeTab)

    // With kubescapeData undefined, the tool tab renders the fallback
    expect(screen.getByText('Kubescape data not available')).toBeInTheDocument()
    expect(screen.getByText('No data from connected clusters')).toBeInTheDocument()
  })

  it('renders single-tool modal with Overview + tool tabs (Overview landing)', () => {
    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={82}
        breakdown={[{ name: 'Kubescape', value: 82 }]}
        kubescapeData={kubescapeData}
      />,
    )

    // Since #7893, Overview is always present — so a single-tool modal has
    // 2 tabs (Overview + Kubescape), not 0.
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveTextContent('Overview')
    expect(tabs[1]).toHaveTextContent('Kubescape')

    // Overview tab is active by default — it shows aggregate stats derived
    // from kubescapeData (100 controls / 82 passed / 18 failed). Assert the
    // value-label pairing inside the Total Checks StatBox rather than a bare
    // `getByText('100')` (#7908 — Copilot review on #7905 flagged the bare
    // match as too broad; many elements could render "100").
    const totalChecksLabel = screen.getByText('Total Checks')
    const totalChecksStatBox = totalChecksLabel.parentElement!
    expect(within(totalChecksStatBox).getByText('100')).toBeInTheDocument()
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

  // Regression test for #8974: earlier versions of the Overview tab summed
  // Kubescape's pass/fail/total counts with Kyverno's policies/violations into
  // a single "Total Checks / Passing / Failing" row. Because Kyverno violations
  // are event counts (one per offending resource, not per policy), the numbers
  // didn't add up — users saw totals like "126 checks, 121 passing, 167 failing".
  //
  // Invariant to pin: within each tool's section on the Overview tab, the
  // bucket values must be internally consistent with the labels shown.
  // Kubescape's section uses a checks/passed/failed model where passed + failed
  // == total. Kyverno's section uses a policies/violations model (no pass/fail
  // relationship is implied or displayed).
  it('overview tab shows per-tool counts that reconcile without mixing Kubescape checks and Kyverno violations (#8974)', () => {
    // Kubescape with a much smaller totalControls than Kyverno's violations.
    // Before the fix, "Total Checks" would have been 116 + 10 = 126, "Passing"
    // would have been 110 + max(0, 10 - 167) = 110, and "Failing" would have
    // been 6 + 167 = 173 — mirroring the shape of the issue.
    const kubescapeSmall = {
      totalControls: 116,
      passedControls: 110,
      failedControls: 6,
      frameworks: [],
    }
    const kyvernoManyViolations = {
      totalPolicies: 10,
      totalViolations: 167,
      enforcingCount: 4,
      auditCount: 6,
    }

    render(
      <ComplianceScoreBreakdownModal
        isOpen={true}
        onClose={vi.fn()}
        score={70}
        breakdown={defaultBreakdown}
        kubescapeData={kubescapeSmall}
        kyvernoData={kyvernoManyViolations}
      />,
    )

    // Kubescape section: passed + failed == total, so 110 + 6 == 116.
    const kubescapeHeading = screen.getByText('Kubescape checks')
    const kubescapeSection = kubescapeHeading.parentElement!
    const totalChecksLabel = within(kubescapeSection).getByText('Total Checks')
    expect(within(totalChecksLabel.parentElement!).getByText('116')).toBeInTheDocument()
    const passingLabel = within(kubescapeSection).getByText('Passing')
    expect(within(passingLabel.parentElement!).getByText('110')).toBeInTheDocument()
    const failingLabel = within(kubescapeSection).getByText('Failing')
    expect(within(failingLabel.parentElement!).getByText('6')).toBeInTheDocument()

    // Kyverno section: uses its native vocabulary (policies + violations).
    // The violation count is NOT summed with Kubescape failures, and is NOT
    // labeled "Failing".
    const kyvernoHeading = screen.getByText('Kyverno policies')
    const kyvernoSection = kyvernoHeading.parentElement!
    const policiesLabel = within(kyvernoSection).getByText('Policies')
    expect(within(policiesLabel.parentElement!).getByText('10')).toBeInTheDocument()
    const violationsLabel = within(kyvernoSection).getByText('Violations')
    expect(within(violationsLabel.parentElement!).getByText('167')).toBeInTheDocument()

    // And the pre-fix aggregate row must no longer exist.
    expect(screen.queryByText((_, el) =>
      !!el && el.tagName === 'P' && el.textContent === '126',
    )).not.toBeInTheDocument()
  })
})
