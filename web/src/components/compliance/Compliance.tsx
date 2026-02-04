import { useCallback } from 'react'
import { AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { StatBlockValue } from '../ui/StatsOverview'
import { DashboardPage } from '../../lib/dashboards'
import { getDefaultCards } from '../../config/dashboards'

const COMPLIANCE_CARDS_KEY = 'compliance-dashboard-cards'

// Default cards for the Compliance dashboard
const DEFAULT_COMPLIANCE_CARDS = getDefaultCards('compliance')

// Mock compliance posture data
function getCompliancePosture(clusterCount: number) {
  const totalChecks = clusterCount * 45
  const passing = Math.floor(totalChecks * 0.78)
  const failing = Math.floor(totalChecks * 0.12)
  const warning = totalChecks - passing - failing

  return {
    totalChecks,
    passing,
    failing,
    warning,
    score: Math.round((passing / totalChecks) * 100),
    criticalFindings: Math.floor(clusterCount * 2.3),
    highFindings: Math.floor(clusterCount * 5.1),
    mediumFindings: Math.floor(clusterCount * 8.7),
    lowFindings: Math.floor(clusterCount * 12.4),
    // Tool-specific metrics
    gatekeeperViolations: Math.floor(clusterCount * 3.2),
    kyvernoViolations: Math.floor(clusterCount * 2.8),
    kubescapeScore: 78 + Math.floor(Math.random() * 10),
    falcoAlerts: Math.floor(clusterCount * 1.5),
    trivyVulns: Math.floor(clusterCount * 12),
    criticalCVEs: Math.floor(clusterCount * 1.8),
    highCVEs: Math.floor(clusterCount * 4.2),
    cisScore: 82 + Math.floor(Math.random() * 8),
    nsaScore: 76 + Math.floor(Math.random() * 12),
    pciScore: 71 + Math.floor(Math.random() * 15),
  }
}

export function Compliance() {
  const { clusters, isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing, error } = useClusters()
  const { drillToAllSecurity } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Calculate compliance posture
  const posture = getCompliancePosture(reachableClusters.length || 1)

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      // Overall compliance
      case 'score':
        return { value: `${posture.score}%`, sublabel: 'compliance score', onClick: () => drillToAllSecurity(), isClickable: reachableClusters.length > 0 }
      case 'total_checks':
        return { value: posture.totalChecks, sublabel: 'total checks', onClick: () => drillToAllSecurity(), isClickable: posture.totalChecks > 0 }
      case 'passing':
        return { value: posture.passing, sublabel: 'passing', onClick: () => drillToAllSecurity('passing'), isClickable: posture.passing > 0 }
      case 'failing':
        return { value: posture.failing, sublabel: 'failing', onClick: () => drillToAllSecurity('failing'), isClickable: posture.failing > 0 }
      case 'warning':
        return { value: posture.warning, sublabel: 'warnings', onClick: () => drillToAllSecurity('warning'), isClickable: posture.warning > 0 }
      case 'critical_findings':
        return { value: posture.criticalFindings, sublabel: 'critical findings', onClick: () => drillToAllSecurity('critical'), isClickable: posture.criticalFindings > 0 }

      // Policy enforcement tools
      case 'gatekeeper_violations':
        return { value: posture.gatekeeperViolations, sublabel: 'Gatekeeper violations', isClickable: false }
      case 'kyverno_violations':
        return { value: posture.kyvernoViolations, sublabel: 'Kyverno violations', isClickable: false }
      case 'kubescape_score':
        return { value: `${posture.kubescapeScore}%`, sublabel: 'Kubescape score', isClickable: false }

      // Security scanning
      case 'falco_alerts':
        return { value: posture.falcoAlerts, sublabel: 'Falco alerts', isClickable: false }
      case 'trivy_vulns':
        return { value: posture.trivyVulns, sublabel: 'Trivy vulnerabilities', isClickable: false }
      case 'critical_vulns':
        return { value: posture.criticalCVEs, sublabel: 'critical CVEs', isClickable: false }
      case 'high_vulns':
        return { value: posture.highCVEs, sublabel: 'high CVEs', isClickable: false }

      // Framework compliance
      case 'cis_score':
        return { value: `${posture.cisScore}%`, sublabel: 'CIS benchmark', isClickable: false }
      case 'nsa_score':
        return { value: `${posture.nsaScore}%`, sublabel: 'NSA hardening', isClickable: false }
      case 'pci_score':
        return { value: `${posture.pciScore}%`, sublabel: 'PCI-DSS', isClickable: false }

      default:
        return { value: '-' }
    }
  }, [posture, reachableClusters, drillToAllSecurity])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  return (
    <DashboardPage
      title="Security Posture"
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
      hasData={posture.totalChecks > 0}
      emptyState={{
        title: 'Compliance Dashboard',
        description: 'Add cards to monitor security compliance, policy enforcement, and vulnerability scanning.',
      }}
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Error loading compliance data</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      )}
    </DashboardPage>
  )
}
