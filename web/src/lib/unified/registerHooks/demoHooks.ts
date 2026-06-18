/**
 * Demo hook factory and registration table for unified cards.
 */

import { useEffect, useState } from 'react'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { SHORT_DELAY_MS } from '../../constants/network'
import {
  DEMO_CLUSTER_METRICS,
  DEMO_RESOURCE_USAGE,
  DEMO_EVENTS_TIMELINE,
  DEMO_SECURITY_ISSUES,
  DEMO_ACTIVE_ALERTS,
  DEMO_STORAGE_OVERVIEW,
  DEMO_NETWORK_OVERVIEW,
  DEMO_TOP_PODS,
  DEMO_GITOPS_DRIFT,
  DEMO_POD_HEALTH_TREND,
  DEMO_RESOURCE_TREND,
  DEMO_COMPUTE_OVERVIEW,
} from './demoHooks-core'
import {
  DEMO_ARGOCD_APPLICATIONS,
  DEMO_GPU_INVENTORY,
  DEMO_PROW_JOBS,
  DEMO_ML_JOBS,
  DEMO_ML_NOTEBOOKS,
  DEMO_OPA_POLICIES,
  DEMO_KYVERNO_POLICIES,
  DEMO_ALERT_RULES,
  DEMO_CHART_VERSIONS,
  DEMO_CRD_HEALTH,
  DEMO_COMPLIANCE_SCORE,
  DEMO_GPU_WORKLOADS,
  DEMO_DEPLOYMENT_PROGRESS,
} from './demoHooks-batch4'
import {
  DEMO_ARGOCD_HEALTH,
  DEMO_ARGOCD_SYNC_STATUS,
  DEMO_GATEWAY_STATUS,
  DEMO_KUSTOMIZATION_STATUS,
  DEMO_PROVIDER_HEALTH,
  DEMO_UPGRADE_STATUS,
  DEMO_PROW_STATUS,
  DEMO_PROW_HISTORY,
  DEMO_HELM_HISTORY,
  DEMO_EXTERNAL_SECRETS,
  DEMO_CERT_MANAGER,
  DEMO_VAULT_SECRETS,
  DEMO_FALCO_ALERTS,
  DEMO_KUBESCAPE_SCAN,
  DEMO_TRIVY_SCAN,
  DEMO_EVENT_SUMMARY,
  DEMO_APP_STATUS,
  DEMO_GPU_STATUS,
  DEMO_GPU_UTILIZATION,
  DEMO_GPU_USAGE_TREND,
  DEMO_POLICY_VIOLATIONS,
  DEMO_NAMESPACE_OVERVIEW,
  DEMO_NAMESPACE_QUOTAS,
  DEMO_NAMESPACE_RBAC,
  DEMO_RESOURCE_CAPACITY,
} from './demoHooks-batch5'
import {
  DEMO_GITHUB_ACTIVITY,
  DEMO_RSS_FEED,
  DEMO_KUBECOST_OVERVIEW,
  DEMO_OPENCOST_OVERVIEW,
  DEMO_CLUSTER_COSTS,
} from './demoHooks-batch6'

export function useDemoDataHook<T>(demoData: T[]) {
  const { isDemoMode: demoMode } = useDemoMode()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!demoMode) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), SHORT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [demoMode])

  return {
    data: !demoMode ? [] : isLoading ? [] : demoData,
    isLoading,
    error: null,
    refetch: () => {},
  }
}

// Table-driven demo hook registration
// ============================================================================

export const DEMO_HOOK_TABLE: Array<{ name: string; data: unknown[] }> = [
  { name: 'useCachedClusterMetrics', data: DEMO_CLUSTER_METRICS },
  { name: 'useCachedResourceUsage', data: DEMO_RESOURCE_USAGE },
  { name: 'useCachedEventsTimeline', data: DEMO_EVENTS_TIMELINE },
  { name: 'useSecurityIssues', data: DEMO_SECURITY_ISSUES },
  { name: 'useActiveAlerts', data: DEMO_ACTIVE_ALERTS },
  { name: 'useStorageOverview', data: [DEMO_STORAGE_OVERVIEW] },
  { name: 'useNetworkOverview', data: [DEMO_NETWORK_OVERVIEW] },
  { name: 'useTopPods', data: DEMO_TOP_PODS },
  { name: 'useGitOpsDrift', data: DEMO_GITOPS_DRIFT },
  { name: 'usePodHealthTrend', data: DEMO_POD_HEALTH_TREND },
  { name: 'useResourceTrend', data: DEMO_RESOURCE_TREND },
  { name: 'useComputeOverview', data: [DEMO_COMPUTE_OVERVIEW] },
  { name: 'useArgoCDApplications', data: DEMO_ARGOCD_APPLICATIONS },
  { name: 'useGPUInventory', data: DEMO_GPU_INVENTORY },
  { name: 'useProwJobs', data: DEMO_PROW_JOBS },
  { name: 'useMLJobs', data: DEMO_ML_JOBS },
  { name: 'useMLNotebooks', data: DEMO_ML_NOTEBOOKS },
  { name: 'useOPAPolicies', data: DEMO_OPA_POLICIES },
  { name: 'useKyvernoPolicies', data: DEMO_KYVERNO_POLICIES },
  { name: 'useAlertRules', data: DEMO_ALERT_RULES },
  { name: 'useChartVersions', data: DEMO_CHART_VERSIONS },
  { name: 'useCRDHealth', data: DEMO_CRD_HEALTH },
  { name: 'useComplianceScore', data: [DEMO_COMPLIANCE_SCORE] },
  { name: 'useGPUWorkloads', data: DEMO_GPU_WORKLOADS },
  { name: 'useDeploymentProgress', data: DEMO_DEPLOYMENT_PROGRESS },
  { name: 'useArgoCDHealth', data: [DEMO_ARGOCD_HEALTH] },
  { name: 'useArgoCDSyncStatus', data: [DEMO_ARGOCD_SYNC_STATUS] },
  { name: 'useGatewayStatus', data: DEMO_GATEWAY_STATUS },
  { name: 'useKustomizationStatus', data: DEMO_KUSTOMIZATION_STATUS },
  { name: 'useProviderHealth', data: DEMO_PROVIDER_HEALTH },
  { name: 'useUpgradeStatus', data: DEMO_UPGRADE_STATUS },
  { name: 'useProwStatus', data: [DEMO_PROW_STATUS] },
  { name: 'useProwHistory', data: DEMO_PROW_HISTORY },
  { name: 'useHelmHistory', data: DEMO_HELM_HISTORY },
  { name: 'useExternalSecrets', data: [DEMO_EXTERNAL_SECRETS] },
  { name: 'useCertManager', data: [DEMO_CERT_MANAGER] },
  { name: 'useVaultSecrets', data: DEMO_VAULT_SECRETS },
  { name: 'useFalcoAlerts', data: DEMO_FALCO_ALERTS },
  { name: 'useKubescapeScan', data: [DEMO_KUBESCAPE_SCAN] },
  { name: 'useTrivyScan', data: [DEMO_TRIVY_SCAN] },
  { name: 'useEventSummary', data: [DEMO_EVENT_SUMMARY] },
  { name: 'useAppStatus', data: DEMO_APP_STATUS },
  { name: 'useGPUStatus', data: [DEMO_GPU_STATUS] },
  { name: 'useGPUUtilization', data: DEMO_GPU_UTILIZATION },
  { name: 'useGPUUsageTrend', data: DEMO_GPU_USAGE_TREND },
  { name: 'usePolicyViolations', data: DEMO_POLICY_VIOLATIONS },
  { name: 'useNamespaceOverview', data: [DEMO_NAMESPACE_OVERVIEW] },
  { name: 'useNamespaceQuotas', data: DEMO_NAMESPACE_QUOTAS },
  { name: 'useNamespaceRBAC', data: DEMO_NAMESPACE_RBAC },
  { name: 'useResourceCapacity', data: [DEMO_RESOURCE_CAPACITY] },
  { name: 'useGithubActivity', data: DEMO_GITHUB_ACTIVITY },
  { name: 'useRSSFeed', data: DEMO_RSS_FEED },
  { name: 'useKubecostOverview', data: [DEMO_KUBECOST_OVERVIEW] },
  { name: 'useOpencostOverview', data: [DEMO_OPENCOST_OVERVIEW] },
  { name: 'useClusterCosts', data: DEMO_CLUSTER_COSTS },
]
