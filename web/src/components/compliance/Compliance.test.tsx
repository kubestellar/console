import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockUseClusters,
  mockUseGlobalFilters,
  mockUseDemoMode,
  mockUseKyverno,
  mockUseKubescape,
  mockUseTrivy,
  mockUseUniversalStats,
  mockUseDrillDownActions,
} = vi.hoisted(() => ({
  mockUseClusters: vi.fn(),
  mockUseGlobalFilters: vi.fn(),
  mockUseDemoMode: vi.fn(),
  mockUseKyverno: vi.fn(),
  mockUseKubescape: vi.fn(),
  mockUseTrivy: vi.fn(),
  mockUseUniversalStats: vi.fn(),
  mockUseDrillDownActions: vi.fn(),
  mockDashboardPageProps: null as Record<string, unknown> | null,
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../hooks/useMCP', () => ({
  useClusters: (...args: unknown[]) => mockUseClusters(...args),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../../hooks/useKyverno', () => ({
  useKyverno: () => mockUseKyverno(),
}))

vi.mock('../../hooks/useKubescape', () => ({
  useKubescape: () => mockUseKubescape(),
}))

vi.mock('../../hooks/useTrivy', () => ({
  useTrivy: () => mockUseTrivy(),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => mockUseUniversalStats(),
  createMergedStatValueGetter: (primary: (id: string) => unknown, fallback: (id: string) => unknown) =>
    (id: string) => {
      const val = primary(id)
      // If primary returns a value, use it; otherwise fall back
      return val !== undefined ? val : fallback(id)
    },
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => mockUseDrillDownActions(),
}))

vi.mock('../../lib/analytics', () => ({
  emitComplianceDrillDown: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../config/dashboards', () => ({
  getDefaultCards: () => [],
}))

// Capture DashboardPage props instead of rendering the full component tree
vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: (props: Record<string, unknown>) => {
    // Store props for assertion
    (globalThis as Record<string, unknown>).__dashboardPageProps = props
    return <div data-testid="dashboard-page" />
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultClustersReturn() {
  return {
    clusters: [
      { name: 'cluster-a', reachable: true },
      { name: 'cluster-b', reachable: true },
    ],
    isLoading: false,
    refetch: vi.fn(),
    lastUpdated: Date.now(),
    isRefreshing: false,
    error: null,
  }
}

function defaultGlobalFilters() {
  return {
    selectedClusters: [],
    isAllClustersSelected: true,
  }
}

function emptyKyverno() {
  return {
    statuses: {} as Record<string, unknown>,
    isDemoData: false,
  }
}

function emptyKubescape() {
  return {
    statuses: {} as Record<string, unknown>,
    isDemoData: false,
  }
}

function emptyTrivy() {
  return {
    statuses: {} as Record<string, unknown>,
    isDemoData: false,
  }
}

function installedKyverno() {
  return {
    statuses: {
      'cluster-a': { cluster: 'cluster-a', installed: true, loading: false, totalViolations: 5, totalPolicies: 20, policies: [], reports: [], enforcingCount: 0, auditCount: 0 },
      'cluster-b': { cluster: 'cluster-b', installed: true, loading: false, totalViolations: 3, totalPolicies: 15, policies: [], reports: [], enforcingCount: 0, auditCount: 0 },
    },
    isDemoData: false,
  }
}

function installedKubescape() {
  return {
    statuses: {
      'cluster-a': {
        cluster: 'cluster-a',
        installed: true,
        loading: false,
        overallScore: 72,
        frameworks: [
          { name: 'CIS Kubernetes Benchmark', score: 85, passCount: 0, failCount: 0 },
          { name: 'NSA Hardening Guide', score: 79, passCount: 0, failCount: 0 },
        ],
        totalControls: 100,
        passedControls: 72,
        failedControls: 20,
        controls: [],
      },
    },
    isDemoData: false,
  }
}

function installedTrivy() {
  return {
    statuses: {
      'cluster-a': {
        cluster: 'cluster-a',
        installed: true,
        loading: false,
        vulnerabilities: { critical: 4, high: 10, medium: 15, low: 8, unknown: 2 },
        totalReports: 80,
        scannedImages: 0,
        images: [],
      },
    },
    isDemoData: false,
  }
}

function setupDefaults(overrides: {
  demoMode?: boolean
  kyverno?: ReturnType<typeof emptyKyverno>
  kubescape?: ReturnType<typeof emptyKubescape>
  trivy?: ReturnType<typeof emptyTrivy>
  clusters?: ReturnType<typeof defaultClustersReturn>
  filters?: ReturnType<typeof defaultGlobalFilters>
} = {}) {
  mockUseClusters.mockReturnValue(overrides.clusters ?? defaultClustersReturn())
  mockUseGlobalFilters.mockReturnValue(overrides.filters ?? defaultGlobalFilters())
  mockUseDemoMode.mockReturnValue({ isDemoMode: overrides.demoMode ?? false })
  mockUseKyverno.mockReturnValue(overrides.kyverno ?? emptyKyverno())
  mockUseKubescape.mockReturnValue(overrides.kubescape ?? emptyKubescape())
  mockUseTrivy.mockReturnValue(overrides.trivy ?? emptyTrivy())
  mockUseUniversalStats.mockReturnValue({ getStatValue: () => ({ value: '-' }) })
  mockUseDrillDownActions.mockReturnValue({ drillToAllSecurity: vi.fn(), drillToCompliance: vi.fn() })
}

function getLastDashboardProps(): Record<string, unknown> {
  return (globalThis as Record<string, unknown>).__dashboardPageProps as Record<string, unknown>
}

function getStatValue(blockId: string) {
  const props = getLastDashboardProps()
  const getter = props.getStatValue as (id: string) => { value: unknown; sublabel?: string; isDemo?: boolean }
  return getter(blockId)
}

// ---------------------------------------------------------------------------
// Import under test — after mocks
// ---------------------------------------------------------------------------

import { Compliance } from './Compliance'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compliance dashboard component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as Record<string, unknown>).__dashboardPageProps = null
  })

  // ---- 1) Render and base wiring ----

  it('renders without crashing', () => {
    setupDefaults()
    const { container } = render(<Compliance />)
    expect(container.querySelector('[data-testid="dashboard-page"]')).toBeTruthy()
  })

  it('passes static props to DashboardPage', () => {
    setupDefaults()
    render(<Compliance />)
    const props = getLastDashboardProps()
    expect(props.title).toBe('Security Posture')
    expect(props.statsType).toBe('compliance')
    expect(props.storageKey).toBe('compliance-dashboard-cards')
    expect(props.emptyState).toEqual({
      title: 'Compliance Dashboard',
      description: 'Add cards to monitor security compliance, policy enforcement, and vulnerability scanning.',
    })
  })

  it('propagates loading/refresh state from useClusters', () => {
    setupDefaults({
      clusters: { ...defaultClustersReturn(), isLoading: true, isRefreshing: true },
    })
    render(<Compliance />)
    const props = getLastDashboardProps()
    expect(props.isLoading).toBe(true)
    expect(props.isRefreshing).toBe(true)
  })

  // ---- 2) Cluster filtering ----

  it('hasData is true when reachable clusters exist', () => {
    setupDefaults()
    render(<Compliance />)
    const props = getLastDashboardProps()
    expect(props.hasData).toBe(true)
  })

  it('hasData reflects tool installation', () => {
    setupDefaults({
      clusters: { ...defaultClustersReturn(), clusters: [] },
    })
    render(<Compliance />)
    const props = getLastDashboardProps()
    // No clusters and no tool data
    expect(props.hasData).toBe(false)
  })

  // ---- 3) Real data aggregation ----

  it('computes overall score from Kubescape + Kyverno + Trivy', () => {
    setupDefaults({
      kyverno: installedKyverno(),
      kubescape: installedKubescape(),
      trivy: installedTrivy(),
    })
    render(<Compliance />)

    // Kubescape: 100 controls, 72 pass, 20 fail
    // Kyverno: 35 policies, 8 violations => 27 pass, 8 fail
    // Trivy: 80 reports, 14 critical+high fail => 66 pass
    // Total: 215 checks, 165 pass, 42 fail
    // Score: round(165/215 * 100) = 77%
    const score = getStatValue('score')
    expect(score.value).toBe('77%')
    expect(score.isDemo).toBeUndefined()

    const totalChecks = getStatValue('total_checks')
    expect(totalChecks.value).toBe(215)

    const passing = getStatValue('passing')
    expect(passing.value).toBe(165)

    const failing = getStatValue('failing')
    expect(failing.value).toBe(42)

    const warning = getStatValue('warning')
    expect(warning.value).toBe(8) // 215 - 165 - 42 = 8
  })

  it('uses Kubescape framework scores for CIS and NSA', () => {
    setupDefaults({ kubescape: installedKubescape() })
    render(<Compliance />)

    const cis = getStatValue('cis_score')
    expect(cis.value).toBe('85%')

    const nsa = getStatValue('nsa_score')
    expect(nsa.value).toBe('79%')
  })

  it('falls back to overall Kubescape score when framework is absent', () => {
    const ks = installedKubescape()
    // Remove framework-specific scores so the component falls back to overall score
    ks.statuses['cluster-a'].frameworks = []
    setupDefaults({ kubescape: ks })
    render(<Compliance />)

    const cis = getStatValue('cis_score')
    expect(cis.value).toBe('72%') // Falls back to overall score

    const nsa = getStatValue('nsa_score')
    expect(nsa.value).toBe('72%')
  })

  it('computes warning as max(0, total - pass - fail)', () => {
    setupDefaults({ kubescape: installedKubescape() })
    render(<Compliance />)

    const warning = getStatValue('warning')
    // 100 total, 72 pass, 20 fail => 8 warning
    expect(warning.value).toBe(8)
  })

  // ---- 4) Demo mode behavior ----

  it('shows demo data when explicit demo mode and no real tools', () => {
    setupDefaults({ demoMode: true })
    render(<Compliance />)
    const props = getLastDashboardProps()
    expect(props.isDemoData).toBe(true)

    const score = getStatValue('score')
    expect(score.value).toBe('78%')
    expect(score.isDemo).toBe(true)
  })

  it('does not show demo data when demo mode is off, even without tools', () => {
    setupDefaults({ demoMode: false })
    render(<Compliance />)
    const props = getLastDashboardProps()
    expect(props.isDemoData).toBe(false)

    const score = getStatValue('score')
    expect(score.value).toBe('0%')
    expect(score.isDemo).toBeUndefined()
  })

  it('uses real data even in demo mode when tools are installed', () => {
    setupDefaults({
      demoMode: true,
      kyverno: installedKyverno(),
    })
    render(<Compliance />)
    const props = getLastDashboardProps()
    // allDemo should be false because real data exists
    expect(props.isDemoData).toBe(false)
  })

  it('per-tool demo flags only trigger when demo mode is on AND tool is absent', () => {
    setupDefaults({
      demoMode: true,
      kyverno: installedKyverno(),
      // kubescape and trivy are empty => demo for those tools
    })
    render(<Compliance />)

    // Kyverno is installed => real data
    const kyvernoStat = getStatValue('kyverno_violations')
    expect(kyvernoStat.isDemo).toBeUndefined()
    expect(kyvernoStat.value).toBe(8) // 5 + 3 violations

    // Kubescape is NOT installed + demo mode => demo data
    const kubescapeStat = getStatValue('kubescape_score')
    expect(kubescapeStat.isDemo).toBe(true)
    expect(kubescapeStat.value).toBe('78%')
  })

  // ---- 5) Stat block mapping validation ----

  it('returns kyverno violations from real data', () => {
    setupDefaults({ kyverno: installedKyverno() })
    render(<Compliance />)

    const stat = getStatValue('kyverno_violations')
    expect(stat.value).toBe(8) // 5 + 3
  })

  it('returns trivy vulnerability counts from real data', () => {
    setupDefaults({ trivy: installedTrivy() })
    render(<Compliance />)

    const vulns = getStatValue('trivy_vulns')
    // 4 + 10 + 15 + 8 + 2 = 39
    expect(vulns.value).toBe(39)

    const critical = getStatValue('critical_vulns')
    expect(critical.value).toBe(4)

    const high = getStatValue('high_vulns')
    expect(high.value).toBe(10)
  })

  it('returns default for unknown stat block IDs', () => {
    setupDefaults()
    render(<Compliance />)

    const unknown = getStatValue('non_existent_stat')
    expect(unknown.value).toBe('-')
  })
})
