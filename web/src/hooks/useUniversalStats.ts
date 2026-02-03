import { useCallback, useMemo } from 'react'
import {
  useClusters,
  usePodIssues,
  useDeployments,
  useDeploymentIssues,
  usePVCs,
  useServices,
  useEvents,
  useWarningEvents,
  useSecurityIssues,
  useHelmReleases,
  useOperatorSubscriptions,
  useOperators,
  useGPUNodes,
} from './useMCP'
import { useAlerts, useAlertRules } from './useAlerts'
import { StatBlockValue } from '../components/ui/StatsOverview'
import { useDrillDownActions } from './useDrillDown'

// Cost estimation constants (per-month, rough cloud averages)
const COST_PER_CPU = 30
const COST_PER_GB_MEMORY = 4
const COST_PER_GB_STORAGE = 0.10
const COST_PER_GPU = 900

/**
 * Universal stat value provider that works across ALL dashboards.
 * Provides values for every stat block ID so users can add any stat
 * to any dashboard and get real (or demo) data.
 *
 * Data hooks use module-level caching, so calling them all here
 * does not cause redundant API requests if the same data was already
 * fetched by the current dashboard page.
 */
export function useUniversalStats() {
  const { deduplicatedClusters, isLoading } = useClusters()
  const {
    drillToAllClusters, drillToAllNodes, drillToAllPods,
    drillToAllDeployments, drillToAllServices, drillToAllEvents,
    drillToAllAlerts, drillToAllHelm, drillToAllOperators,
    drillToAllSecurity, drillToAllGPU, drillToAllStorage,
  } = useDrillDownActions()

  // Domain-specific data
  const { issues: podIssues } = usePodIssues()
  const { deployments } = useDeployments()
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { pvcs } = usePVCs()
  const { services } = useServices()
  const { events } = useEvents(undefined, undefined, 100)
  const { events: warningEvents } = useWarningEvents(undefined, undefined, 100)
  const { issues: securityIssues } = useSecurityIssues()
  const { releases: helmReleases } = useHelmReleases()
  const { subscriptions: operatorSubscriptions } = useOperatorSubscriptions()
  const { operators } = useOperators()
  const { nodes: gpuNodes } = useGPUNodes()
  const { stats: alertStats } = useAlerts()
  const { rules: alertRules } = useAlertRules()

  // ─── Cluster-derived values ───
  const totalClusters = deduplicatedClusters.length
  const healthyClusters = deduplicatedClusters.filter(c => c.healthy).length
  const unhealthyClusters = deduplicatedClusters.filter(c => !c.healthy).length
  const unreachableClusters = deduplicatedClusters.filter(c => c.reachable === false).length
  const totalNodes = deduplicatedClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = deduplicatedClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
  const totalCPUs = deduplicatedClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0)
  const totalMemoryGB = deduplicatedClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0)
  const totalStorageGB = deduplicatedClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
  const uniqueNamespaces = useMemo(
    () => new Set(deduplicatedClusters.flatMap(c => c.namespaces || [])),
    [deduplicatedClusters]
  )

  // ─── Pod-derived values ───
  const podIssuesList = podIssues || []
  const pendingPods = podIssuesList.filter(p => p.status === 'Pending').length
  const highRestartPods = podIssuesList.filter(p => p.restarts > 10).length

  // ─── Deployment-derived values ───
  const allDeployments = deployments || []
  const allDeploymentIssues = deploymentIssues || []

  // ─── PVC-derived values ───
  const allPVCs = pvcs || []
  const boundPVCs = allPVCs.filter(p => p.status === 'Bound').length
  const storageClassCount = useMemo(
    () => new Set(allPVCs.map(p => p.storageClass).filter(Boolean)).size,
    [allPVCs]
  )

  // ─── Service-derived values ───
  const allServices = services || []
  const lbCount = allServices.filter(s => s.type === 'LoadBalancer').length
  const npCount = allServices.filter(s => s.type === 'NodePort').length
  const cipCount = allServices.filter(s => s.type === 'ClusterIP').length

  // ─── Event-derived values ───
  const allEvents = events || []
  const allWarningEvents = warningEvents || []
  const normalEvents = allEvents.filter(e => e.type === 'Normal').length
  const recentEvents = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    return allEvents.filter(e => {
      if (!e.lastSeen) return false
      return new Date(e.lastSeen).getTime() > oneHourAgo
    }).length
  }, [allEvents])

  // ─── Security-derived values ───
  const secIssues = securityIssues || []
  const highSeverity = secIssues.filter(i => i.severity === 'high').length
  const mediumSeverity = secIssues.filter(i => i.severity === 'medium').length
  const lowSeverity = secIssues.filter(i => i.severity === 'low').length
  const privilegedContainers = secIssues.filter(i => i.issue?.toLowerCase().includes('privileged')).length
  const rootContainers = secIssues.filter(i => i.issue?.toLowerCase().includes('root')).length

  // ─── Helm/GitOps-derived values ───
  const allHelm = helmReleases || []
  const deployedHelm = allHelm.filter(r => r.status === 'deployed').length
  const failedHelm = allHelm.filter(r => r.status === 'failed').length

  // ─── Operator-derived values ───
  const allOps = operators || []
  const allSubs = operatorSubscriptions || []
  const installedOps = allOps.filter(o => o.status === 'Succeeded').length
  const installingOps = allOps.filter(o => o.status === 'Installing').length
  const failingOps = allOps.filter(o => o.status === 'Failed').length
  const upgradesAvailable = allSubs.filter(s => s.pendingUpgrade).length

  // ─── GPU-derived values ───
  const realGPUCount = (gpuNodes || []).reduce((sum, n) => sum + (n.gpuCount || 0), 0)

  // ─── Alert-derived values ───
  const firingAlerts = alertStats?.firing || 0
  const resolvedAlerts = alertStats?.resolved || 0
  const allRules = alertRules || []
  const enabledRules = allRules.filter(r => r.enabled !== false).length
  const disabledRules = allRules.filter(r => r.enabled === false).length

  // ─── Cost estimates (demo) ───
  const totalCost = useMemo(() => {
    const cpu = totalCPUs * COST_PER_CPU
    const mem = totalMemoryGB * COST_PER_GB_MEMORY
    const stor = totalStorageGB * COST_PER_GB_STORAGE
    const gpu = realGPUCount * COST_PER_GPU
    return { total: cpu + mem + stor + gpu, cpu, mem, stor, gpu, network: 0 }
  }, [totalCPUs, totalMemoryGB, totalStorageGB, realGPUCount])

  const getStatValue = useCallback((blockId: string): StatBlockValue | undefined => {
    switch (blockId) {

      // ══════════════════════════════════════════
      // Cluster stats
      // ══════════════════════════════════════════
      case 'clusters':
        return { value: totalClusters, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: totalClusters > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'unhealthy':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'unreachable':
        return { value: unreachableClusters, sublabel: 'offline', isClickable: false }
      case 'nodes':
        return { value: totalNodes, sublabel: 'total nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'cpus':
        return { value: totalCPUs, sublabel: 'total CPUs', isClickable: false }
      case 'memory':
        return { value: `${Math.round(totalMemoryGB)}`, sublabel: 'GB memory', isClickable: false }
      case 'storage':
        return { value: `${Math.round(totalStorageGB)}`, sublabel: 'GB storage', isClickable: false }
      case 'gpus':
        return { value: realGPUCount, sublabel: 'total GPUs', onClick: () => drillToAllGPU(), isClickable: realGPUCount > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'total pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      case 'total_pods':
        return { value: totalPods, sublabel: 'across all clusters', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }

      // ══════════════════════════════════════════
      // Workload / Deployment stats
      // ══════════════════════════════════════════
      case 'namespaces':
        return { value: uniqueNamespaces.size, sublabel: 'namespaces', isClickable: false }
      case 'deployments':
        return { value: allDeployments.length, sublabel: 'total', onClick: () => drillToAllDeployments(), isClickable: allDeployments.length > 0 }
      case 'pod_issues':
        return { value: podIssuesList.length, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: podIssuesList.length > 0 }
      case 'deployment_issues':
        return { value: allDeploymentIssues.length, sublabel: 'deploy issues', onClick: () => drillToAllDeployments('issues'), isClickable: allDeploymentIssues.length > 0 }
      case 'issues':
        return { value: podIssuesList.length, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: podIssuesList.length > 0 }
      case 'pending':
        return { value: pendingPods, sublabel: 'pending pods', onClick: () => drillToAllPods('pending'), isClickable: pendingPods > 0 }
      case 'restarts':
        return { value: highRestartPods, sublabel: 'high restarts', onClick: () => drillToAllPods('restarts'), isClickable: highRestartPods > 0 }
      case 'critical':
        return { value: allDeploymentIssues.length, sublabel: 'critical', onClick: () => drillToAllDeployments('issues'), isClickable: allDeploymentIssues.length > 0 }
      case 'warning':
        return { value: allWarningEvents.length, sublabel: 'warnings', onClick: () => drillToAllEvents('warning'), isClickable: allWarningEvents.length > 0 }

      // ══════════════════════════════════════════
      // Storage stats
      // ══════════════════════════════════════════
      case 'ephemeral':
        return { value: `${Math.round(totalStorageGB)}`, sublabel: 'GB allocatable', onClick: () => drillToAllStorage(), isClickable: true }
      case 'pvcs':
        return { value: allPVCs.length, sublabel: 'total PVCs', onClick: () => drillToAllStorage(), isClickable: allPVCs.length > 0 }
      case 'bound':
        return { value: boundPVCs, sublabel: 'bound', isClickable: false }
      case 'storage_classes':
        return { value: storageClassCount, sublabel: 'in use', isClickable: false }

      // ══════════════════════════════════════════
      // Network stats
      // ══════════════════════════════════════════
      case 'services':
        return { value: allServices.length, sublabel: 'total services', onClick: () => drillToAllServices(), isClickable: allServices.length > 0 }
      case 'loadbalancers':
        return { value: lbCount, sublabel: 'external access', onClick: () => drillToAllServices('LoadBalancer'), isClickable: lbCount > 0 }
      case 'nodeport':
        return { value: npCount, sublabel: 'node-level access', onClick: () => drillToAllServices('NodePort'), isClickable: npCount > 0 }
      case 'clusterip':
        return { value: cipCount, sublabel: 'internal only', onClick: () => drillToAllServices('ClusterIP'), isClickable: cipCount > 0 }
      case 'ingresses':
        return { value: '-', sublabel: 'ingresses', isClickable: false }
      case 'endpoints':
        return { value: allServices.length, sublabel: 'endpoints', isClickable: false }

      // ══════════════════════════════════════════
      // Security stats
      // ══════════════════════════════════════════
      case 'high':
        return { value: highSeverity, sublabel: 'high severity', onClick: () => drillToAllSecurity('high'), isClickable: highSeverity > 0 }
      case 'medium':
        return { value: mediumSeverity, sublabel: 'medium', onClick: () => drillToAllSecurity('medium'), isClickable: mediumSeverity > 0 }
      case 'low':
        return { value: lowSeverity, sublabel: 'low', onClick: () => drillToAllSecurity('low'), isClickable: lowSeverity > 0 }
      case 'privileged':
        return { value: privilegedContainers, sublabel: 'privileged', onClick: () => drillToAllSecurity('privileged'), isClickable: privilegedContainers > 0 }
      case 'root':
        return { value: rootContainers, sublabel: 'running as root', onClick: () => drillToAllSecurity('root'), isClickable: rootContainers > 0 }

      // ══════════════════════════════════════════
      // GitOps / Helm stats
      // ══════════════════════════════════════════
      case 'helm':
        return { value: allHelm.length, sublabel: 'helm releases', onClick: () => drillToAllHelm(), isClickable: allHelm.length > 0 }
      case 'kustomize':
        return { value: 0, sublabel: 'kustomize apps', isClickable: false }
      case 'deployed':
        return { value: deployedHelm, sublabel: 'synced', onClick: () => drillToAllHelm('deployed'), isClickable: deployedHelm > 0 }
      case 'failed':
        return { value: failedHelm, sublabel: 'drifted', onClick: () => drillToAllHelm('failed'), isClickable: failedHelm > 0 }
      case 'other':
        return { value: Math.max(0, allHelm.length - deployedHelm - failedHelm), sublabel: 'other', isClickable: false }

      // ══════════════════════════════════════════
      // Event stats
      // ══════════════════════════════════════════
      case 'total':
        return { value: allEvents.length || totalClusters, sublabel: allEvents.length ? 'total events' : 'items', onClick: allEvents.length ? () => drillToAllEvents() : undefined, isClickable: allEvents.length > 0 }
      case 'normal':
        return { value: normalEvents, sublabel: 'normal events', onClick: () => drillToAllEvents('Normal'), isClickable: normalEvents > 0 }
      case 'recent':
        return { value: recentEvents, sublabel: 'last hour', onClick: () => drillToAllEvents(), isClickable: recentEvents > 0 }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'errors', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'warnings':
        return { value: allWarningEvents.length, sublabel: 'warnings', onClick: () => drillToAllEvents('warning'), isClickable: allWarningEvents.length > 0 }

      // ══════════════════════════════════════════
      // Operator stats
      // ══════════════════════════════════════════
      case 'operators':
        return { value: allOps.length, sublabel: 'total operators', onClick: () => drillToAllOperators(), isClickable: allOps.length > 0 }
      case 'installed':
        return { value: installedOps, sublabel: 'installed', onClick: () => drillToAllOperators('installed'), isClickable: installedOps > 0 }
      case 'installing':
        return { value: installingOps, sublabel: 'installing', isClickable: false }
      case 'failing':
        return { value: failingOps, sublabel: 'failing', onClick: () => drillToAllOperators('failed'), isClickable: failingOps > 0 }
      case 'upgrades':
        return { value: upgradesAvailable, sublabel: 'available', isClickable: false }
      case 'subscriptions':
        return { value: allSubs.length, sublabel: 'subscriptions', isClickable: false }
      case 'crds':
        return { value: 0, sublabel: 'CRDs', isClickable: false }

      // ══════════════════════════════════════════
      // Alert stats
      // ══════════════════════════════════════════
      case 'firing':
        return { value: firingAlerts, sublabel: 'firing', onClick: () => drillToAllAlerts('firing'), isClickable: firingAlerts > 0 }
      case 'resolved':
        return { value: resolvedAlerts, sublabel: 'resolved', isClickable: false }
      case 'rules_enabled':
        return { value: enabledRules, sublabel: 'enabled', isClickable: false }
      case 'rules_disabled':
        return { value: disabledRules, sublabel: 'disabled', isClickable: false }

      // ══════════════════════════════════════════
      // Compute stats
      // ══════════════════════════════════════════
      case 'cpu_util':
        return { value: '-', sublabel: 'CPU utilization', isClickable: false }
      case 'memory_util':
        return { value: '-', sublabel: 'Memory utilization', isClickable: false }
      case 'tpus':
        return { value: 0, sublabel: 'total TPUs', isClickable: false }

      // ══════════════════════════════════════════
      // Cost stats (estimated from cluster resources)
      // ══════════════════════════════════════════
      case 'total_cost':
        return { value: `$${Math.round(totalCost.total).toLocaleString()}`, sublabel: '/month est.', isClickable: false, isDemo: true }
      case 'cpu_cost':
        return { value: `$${Math.round(totalCost.cpu).toLocaleString()}`, sublabel: 'CPU /mo', isClickable: false, isDemo: true }
      case 'memory_cost':
        return { value: `$${Math.round(totalCost.mem).toLocaleString()}`, sublabel: 'memory /mo', isClickable: false, isDemo: true }
      case 'storage_cost':
        return { value: `$${Math.round(totalCost.stor).toLocaleString()}`, sublabel: 'storage /mo', isClickable: false, isDemo: true }
      case 'network_cost':
        return { value: '$0', sublabel: 'network /mo', isClickable: false, isDemo: true }
      case 'gpu_cost':
        return { value: `$${Math.round(totalCost.gpu).toLocaleString()}`, sublabel: 'GPU /mo', isClickable: false, isDemo: true }

      // ══════════════════════════════════════════
      // Compliance stats (demo data)
      // ══════════════════════════════════════════
      case 'score':
        return { value: '87%', sublabel: 'compliance score', isClickable: false, isDemo: true }
      case 'total_checks':
        return { value: 156, sublabel: 'checks run', isClickable: false, isDemo: true }
      case 'passing':
        return { value: 136, sublabel: 'passing', isClickable: false, isDemo: true }
      case 'failing':
        return { value: 20, sublabel: 'failing', isClickable: false, isDemo: true }
      case 'gatekeeper_violations':
        return { value: 8, sublabel: 'violations', isClickable: false, isDemo: true }
      case 'kyverno_violations':
        return { value: 5, sublabel: 'violations', isClickable: false, isDemo: true }
      case 'kubescape_score':
        return { value: '82%', sublabel: 'score', isClickable: false, isDemo: true }
      case 'falco_alerts':
        return { value: 3, sublabel: 'runtime alerts', isClickable: false, isDemo: true }
      case 'trivy_vulns':
        return { value: 42, sublabel: 'vulnerabilities', isClickable: false, isDemo: true }
      case 'critical_vulns':
        return { value: 2, sublabel: 'critical CVEs', isClickable: false, isDemo: true }
      case 'high_vulns':
        return { value: 11, sublabel: 'high CVEs', isClickable: false, isDemo: true }
      case 'cis_score':
        return { value: '78%', sublabel: 'CIS benchmark', isClickable: false, isDemo: true }
      case 'nsa_score':
        return { value: '85%', sublabel: 'NSA hardening', isClickable: false, isDemo: true }
      case 'pci_score':
        return { value: '91%', sublabel: 'PCI-DSS', isClickable: false, isDemo: true }

      // ══════════════════════════════════════════
      // Data Compliance stats (demo data)
      // ══════════════════════════════════════════
      case 'encryption_score':
        return { value: '92%', sublabel: 'encrypted', isClickable: false, isDemo: true }
      case 'encrypted_secrets':
        return { value: 184, sublabel: 'encrypted', isClickable: false, isDemo: true }
      case 'unencrypted_secrets':
        return { value: 12, sublabel: 'unencrypted', isClickable: false, isDemo: true }
      case 'regions_compliant':
        return { value: '4/5', sublabel: 'compliant', isClickable: false, isDemo: true }
      case 'rbac_policies':
        return { value: 47, sublabel: 'policies', isClickable: false, isDemo: true }
      case 'excessive_permissions':
        return { value: 8, sublabel: 'excessive', isClickable: false, isDemo: true }
      case 'pii_detected':
        return { value: 23, sublabel: 'detected', isClickable: false, isDemo: true }
      case 'pii_protected':
        return { value: 19, sublabel: 'protected', isClickable: false, isDemo: true }
      case 'audit_enabled':
        return { value: '3/4', sublabel: 'clusters', isClickable: false, isDemo: true }
      case 'retention_days':
        return { value: 90, sublabel: 'days', isClickable: false, isDemo: true }
      case 'gdpr_score':
        return { value: '88%', sublabel: 'GDPR', isClickable: false, isDemo: true }
      case 'hipaa_score':
        return { value: '76%', sublabel: 'HIPAA', isClickable: false, isDemo: true }
      case 'soc2_score':
        return { value: '83%', sublabel: 'SOC 2', isClickable: false, isDemo: true }

      // ══════════════════════════════════════════
      default:
        return undefined
    }
  }, [
    // Cluster
    totalClusters, healthyClusters, unhealthyClusters, unreachableClusters,
    totalNodes, totalPods, totalCPUs, totalMemoryGB, totalStorageGB,
    uniqueNamespaces,
    // Pod/Deployment
    podIssuesList, pendingPods, highRestartPods,
    allDeployments, allDeploymentIssues,
    // Storage
    allPVCs, boundPVCs, storageClassCount,
    // Network
    allServices, lbCount, npCount, cipCount,
    // Events
    allEvents, allWarningEvents, normalEvents, recentEvents,
    // Security
    secIssues, highSeverity, mediumSeverity, lowSeverity, privilegedContainers, rootContainers,
    // Helm/GitOps
    allHelm, deployedHelm, failedHelm,
    // Operators
    allOps, allSubs, installedOps, installingOps, failingOps, upgradesAvailable,
    // GPU
    realGPUCount,
    // Alerts
    firingAlerts, resolvedAlerts, enabledRules, disabledRules,
    // Cost
    totalCost,
    // Drill-downs
    drillToAllClusters, drillToAllNodes, drillToAllPods,
    drillToAllDeployments, drillToAllServices, drillToAllEvents,
    drillToAllAlerts, drillToAllHelm, drillToAllOperators,
    drillToAllSecurity, drillToAllGPU, drillToAllStorage,
  ])

  return {
    getStatValue,
    isLoading,
    clusters: deduplicatedClusters,
  }
}

/**
 * Creates a merged stat value getter that combines dashboard-specific values
 * with universal fallback values.
 *
 * Usage in dashboards:
 * ```ts
 * const { getStatValue: getUniversalStatValue } = useUniversalStats()
 * const getMergedStatValue = createMergedStatValueGetter(
 *   dashboardSpecificGetStatValue,
 *   getUniversalStatValue
 * )
 * ```
 */
export function createMergedStatValueGetter(
  dashboardGetter: (blockId: string) => StatBlockValue,
  universalGetter: (blockId: string) => StatBlockValue | undefined
): (blockId: string) => StatBlockValue {
  return (blockId: string) => {
    // First try the dashboard-specific getter
    const dashboardValue = dashboardGetter(blockId)

    // If dashboard provides a real value, use it
    if (dashboardValue?.value !== undefined && dashboardValue.value !== '-') {
      return dashboardValue
    }

    // Fall back to universal getter
    const universalValue = universalGetter(blockId)
    if (universalValue?.value !== undefined) {
      return universalValue
    }

    // Final fallback - not available
    return { value: '-', sublabel: 'Not available on this dashboard' }
  }
}
