import { useMemo } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useKyverno } from '../../hooks/useKyverno'
import { useKubescape } from '../../hooks/useKubescape'
import { useTrivy } from '../../hooks/useTrivy'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards/DashboardPage'
import { getDefaultCards } from '../../config/dashboards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { emitComplianceDrillDown } from '../../lib/analytics'
import { RotatingTip } from '../ui/RotatingTip'

const COMPLIANCE_CARDS_KEY = 'compliance-dashboard-cards'

// Default cards for the Compliance dashboard
const DEFAULT_COMPLIANCE_CARDS = getDefaultCards('compliance')

/** Percentage used for mock compliance score calculation */
const MOCK_PASS_RATE = 0.78
const MOCK_FAIL_RATE = 0.12
/** Multiplier for mock checks per cluster */
const MOCK_CHECKS_PER_CLUSTER = 45
/** Mock tool-specific multipliers */
const MOCK_GATEKEEPER_PER_CLUSTER = 3.2
const MOCK_FALCO_PER_CLUSTER = 1.5

export function Compliance() {
  const { deduplicatedClusters: clusters, isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  const { drillToAllSecurity, drillToCompliance } = useDrillDownActions()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Check if the user is explicitly in demo mode
  const { isDemoMode: explicitDemoMode } = useDemoMode()

  // Real data from compliance tool hooks
  const kyverno = useKyverno()
  const kubescape = useKubescape()
  const trivy = useTrivy()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Build the set of cluster names that pass the global filter, so we can
  // scope tool aggregates to exactly those clusters (#4714, #4722).
  const filteredClusterNames = new Set(filteredClusters.map(c => c.name))

  // Aggregate real data across *filtered* clusters only
  const realData = useMemo(() => {
    // Kyverno aggregates — scoped to filtered clusters
    const kyvernoStatuses = Object.values(kyverno.statuses)
      .filter(s => s.installed && filteredClusterNames.has(s.cluster))
    const kyvernoInstalled = kyvernoStatuses.length > 0
    const kyvernoViolations = kyvernoStatuses.reduce((sum, s) => sum + s.totalViolations, 0)
    const kyvernoPolicies = kyvernoStatuses.reduce((sum, s) => sum + s.totalPolicies, 0)

    // Kubescape aggregates — scoped to filtered clusters
    const kubescapeStatuses = Object.values(kubescape.statuses)
      .filter(s => s.installed && filteredClusterNames.has(s.cluster))
    const kubescapeInstalled = kubescapeStatuses.length > 0
    const kubescapeTotalControls = kubescapeStatuses.reduce((sum, s) => sum + s.totalControls, 0)
    const kubescapePassedControls = kubescapeStatuses.reduce((sum, s) => sum + s.passedControls, 0)
    const kubescapeFailedControls = kubescapeStatuses.reduce((sum, s) => sum + s.failedControls, 0)
    const kubescapeScore = kubescapeTotalControls > 0
      ? Math.round((kubescapePassedControls / kubescapeTotalControls) * 100)
      : 0
    const kubescapeFrameworks = kubescapeStatuses.length > 0
      ? (kubescapeStatuses[0]?.frameworks || [])
      : []

    // Trivy aggregates — scoped to filtered clusters
    const trivyStatuses = Object.values(trivy.statuses)
      .filter(s => s.installed && filteredClusterNames.has(s.cluster))
    const trivyInstalled = trivyStatuses.length > 0
    const trivyCritical = trivyStatuses.reduce((sum, s) => sum + s.vulnerabilities.critical, 0)
    const trivyHigh = trivyStatuses.reduce((sum, s) => sum + s.vulnerabilities.high, 0)
    const trivyMedium = trivyStatuses.reduce((sum, s) => sum + s.vulnerabilities.medium, 0)
    const trivyLow = trivyStatuses.reduce((sum, s) => sum + s.vulnerabilities.low, 0)
    const trivyUnknown = trivyStatuses.reduce((sum, s) => sum + s.vulnerabilities.unknown, 0)
    const trivyVulns = trivyCritical + trivyHigh + trivyMedium + trivyLow + trivyUnknown

    // Any tool installed = we have some real data
    const hasAnyRealData = kyvernoInstalled || kubescapeInstalled || trivyInstalled

    // Compute overall score from real data when available
    let overallScore = 0
    let totalChecks = 0
    let passing = 0
    let failing = 0

    if (kubescapeInstalled && kubescapeTotalControls > 0) {
      totalChecks += kubescapeTotalControls
      passing += kubescapePassedControls
      failing += kubescapeFailedControls
    }
    if (kyvernoInstalled) {
      // Kyverno policies count as checks, violations as failures
      totalChecks += kyvernoPolicies
      failing += kyvernoViolations
      passing += Math.max(0, kyvernoPolicies - kyvernoViolations)
    }
    if (trivyInstalled) {
      // Trivy reports count towards total checks
      const totalReports = trivyStatuses.reduce((sum, s) => sum + s.totalReports, 0)
      const reportsWithCritical = trivyCritical + trivyHigh
      totalChecks += totalReports
      failing += reportsWithCritical
      passing += Math.max(0, totalReports - reportsWithCritical)
    }

    if (totalChecks > 0) {
      overallScore = Math.round((passing / totalChecks) * 100)
    }

    // Framework scores from Kubescape
    const cisFramework = kubescapeFrameworks.find(f => f.name.includes('CIS'))
    const nsaFramework = kubescapeFrameworks.find(f => f.name.includes('NSA'))

    return {
      hasAnyRealData,
      kyvernoInstalled,
      kyvernoViolations,
      kubescapeInstalled,
      kubescapeScore,
      cisScore: cisFramework?.score,
      nsaScore: nsaFramework?.score,
      trivyInstalled,
      trivyVulns,
      trivyCritical,
      trivyHigh,
      overallScore,
      totalChecks,
      passing,
      failing,
      warning: Math.max(0, totalChecks - passing - failing) }
  }, [kyverno.statuses, kubescape.statuses, trivy.statuses, filteredClusterNames])

  // Only show demo/mock data when the user is explicitly in demo mode.
  // When connected to a live cluster without compliance tools, show zeros — not fake numbers.
  const allDemo = explicitDemoMode && !realData.hasAnyRealData
  // Per-tool demo status: only show mock data when explicitly in demo mode AND tool is absent
  const kyvernoIsDemo = explicitDemoMode && (kyverno.isDemoData || !realData.kyvernoInstalled)
  const kubescapeIsDemo = explicitDemoMode && (kubescape.isDemoData || !realData.kubescapeInstalled)
  const trivyIsDemo = explicitDemoMode && (trivy.isDemoData || !realData.trivyInstalled)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = (blockId: string): StatBlockValue => {
    switch (blockId) {
      // Overall compliance — real when any tool is installed, demo otherwise
      case 'score':
        return allDemo
          ? { value: '78%', sublabel: 'compliance score', isDemo: true, isClickable: false }
          : { value: `${realData.overallScore}%`, sublabel: 'compliance score', onClick: () => { emitComplianceDrillDown('score'); drillToAllSecurity() }, isClickable: reachableClusters.length > 0 }
      case 'total_checks':
        return allDemo
          ? { value: (reachableClusters.length || 1) * MOCK_CHECKS_PER_CLUSTER, sublabel: 'total checks', isDemo: true, isClickable: false }
          : { value: realData.totalChecks, sublabel: 'total checks', onClick: () => { emitComplianceDrillDown('total_checks'); drillToCompliance(undefined, { passing: realData.passing, failing: realData.failing, totalChecks: realData.totalChecks }) }, isClickable: realData.totalChecks > 0 }
      // #9717 — IDs must match COMPLIANCE_STAT_BLOCKS in StatsBlockDefinitions.ts
      // ('checks_passing' / 'checks_failing'), not the generic 'passing'/'failing'
      // used by the Operators dashboard. Mismatched IDs caused these blocks to fall
      // through to the default case and return '-', misaligning the stats bar.
      case 'checks_passing':
        return allDemo
          ? { value: Math.floor((reachableClusters.length || 1) * MOCK_CHECKS_PER_CLUSTER * MOCK_PASS_RATE), sublabel: 'passing', isDemo: true, isClickable: false }
          : { value: realData.passing, sublabel: 'passing', onClick: () => { emitComplianceDrillDown('passing'); drillToCompliance('passing', { passing: realData.passing, failing: realData.failing, totalChecks: realData.totalChecks }) }, isClickable: realData.passing > 0 }
      case 'checks_failing':
        return allDemo
          ? { value: Math.floor((reachableClusters.length || 1) * MOCK_CHECKS_PER_CLUSTER * MOCK_FAIL_RATE), sublabel: 'failing', isDemo: true, isClickable: false }
          : { value: realData.failing, sublabel: 'failing', onClick: () => { emitComplianceDrillDown('failing'); drillToCompliance('failing', { passing: realData.passing, failing: realData.failing, totalChecks: realData.totalChecks }) }, isClickable: realData.failing > 0 }
      case 'warning': {
        const mockTotal = (reachableClusters.length || 1) * MOCK_CHECKS_PER_CLUSTER
        return allDemo
          ? { value: mockTotal - Math.floor(mockTotal * MOCK_PASS_RATE) - Math.floor(mockTotal * MOCK_FAIL_RATE), sublabel: 'warnings', isDemo: true, isClickable: false }
          : { value: realData.warning, sublabel: 'warnings', onClick: () => { emitComplianceDrillDown('warning'); drillToCompliance('warning', { passing: realData.passing, failing: realData.failing, warning: realData.warning, totalChecks: realData.totalChecks }) }, isClickable: realData.warning > 0 }
      }
      case 'critical_findings':
        return allDemo
          ? { value: Math.floor((reachableClusters.length || 1) * 2.3), sublabel: 'critical findings', isDemo: true, isClickable: false }
          : { value: realData.trivyCritical + realData.kyvernoViolations, sublabel: 'critical findings', onClick: () => { emitComplianceDrillDown('critical'); drillToAllSecurity('critical') }, isClickable: true }

      // Policy enforcement tools — use real data when the tool is installed
      case 'gatekeeper_violations':
        // Gatekeeper hook not yet implemented — show mock only in explicit demo mode
        return explicitDemoMode
          ? { value: Math.floor((reachableClusters.length || 1) * MOCK_GATEKEEPER_PER_CLUSTER), sublabel: 'Gatekeeper violations', isClickable: false, isDemo: true }
          : { value: 0, sublabel: 'Gatekeeper violations', isClickable: false }
      case 'kyverno_violations':
        return kyvernoIsDemo
          ? { value: Math.floor((reachableClusters.length || 1) * 2.8), sublabel: 'Kyverno violations', isClickable: false, isDemo: true }
          : { value: realData.kyvernoViolations, sublabel: 'Kyverno violations', isClickable: false }
      case 'kubescape_score':
        return kubescapeIsDemo
          ? { value: '78%', sublabel: 'Kubescape score', isClickable: false, isDemo: true }
          : { value: `${realData.kubescapeScore}%`, sublabel: 'Kubescape score', isClickable: false }

      // Security scanning
      case 'falco_alerts':
        // Falco hook not yet implemented — show mock only in explicit demo mode
        return explicitDemoMode
          ? { value: Math.floor((reachableClusters.length || 1) * MOCK_FALCO_PER_CLUSTER), sublabel: 'Falco alerts', isClickable: false, isDemo: true }
          : { value: 0, sublabel: 'Falco alerts', isClickable: false }
      case 'trivy_vulns':
        return trivyIsDemo
          ? { value: Math.floor((reachableClusters.length || 1) * 12), sublabel: 'Trivy vulnerabilities', isClickable: false, isDemo: true }
          : { value: realData.trivyVulns, sublabel: 'Trivy vulnerabilities', isClickable: false }
      case 'critical_vulns':
        return trivyIsDemo
          ? { value: Math.floor((reachableClusters.length || 1) * 1.8), sublabel: 'critical CVEs', isClickable: false, isDemo: true }
          : { value: realData.trivyCritical, sublabel: 'critical CVEs', isClickable: false }
      case 'high_vulns':
        return trivyIsDemo
          ? { value: Math.floor((reachableClusters.length || 1) * 4.2), sublabel: 'high CVEs', isClickable: false, isDemo: true }
          : { value: realData.trivyHigh, sublabel: 'high CVEs', isClickable: false }

      // Framework compliance — from Kubescape when installed
      case 'cis_score':
        return kubescapeIsDemo
          ? { value: '85%', sublabel: 'CIS benchmark', isClickable: false, isDemo: true }
          : { value: `${realData.cisScore || realData.kubescapeScore}%`, sublabel: 'CIS benchmark', isClickable: false }
      case 'nsa_score':
        return kubescapeIsDemo
          ? { value: '79%', sublabel: 'NSA hardening', isClickable: false, isDemo: true }
          : { value: `${realData.nsaScore || realData.kubescapeScore}%`, sublabel: 'NSA hardening', isClickable: false }
      case 'pci_score':
        // PCI-DSS not directly tracked by any installed tool — show mock only in explicit demo mode
        return explicitDemoMode
          ? { value: '75%', sublabel: 'PCI-DSS', isClickable: false, isDemo: true }
          : { value: '0%', sublabel: 'PCI-DSS', isClickable: false }

      default:
        return { value: '-' }
    }
  }

  const getStatValue = getDashboardStatValue

  const hasData = realData.hasAnyRealData || reachableClusters.length > 0

  return (
    <DashboardPage
      title="Compliance"
      subtitle="Security scanning, vulnerability assessment, and policy enforcement"
      icon="Shield"
      storageKey={COMPLIANCE_CARDS_KEY}
      defaultCards={DEFAULT_COMPLIANCE_CARDS}
      statsType="compliance"
      getStatValue={getStatValue}
      onRefresh={refetch}
      isLoading={isLoading}
      isRefreshing={dataRefreshing}
      lastUpdated={lastUpdated}
      hasData={hasData}
      isDemoData={allDemo}
      rightExtra={<RotatingTip page="compliance" />}
      emptyState={{
        title: 'Compliance Dashboard',
        description: 'Add cards to monitor security compliance, policy enforcement, and vulnerability scanning.' }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading compliance data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
