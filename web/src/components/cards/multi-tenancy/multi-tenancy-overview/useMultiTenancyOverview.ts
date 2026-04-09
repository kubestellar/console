/**
 * useMultiTenancyOverview — Aggregates status from all 4 multi-tenancy hooks.
 *
 * Derives component detection, isolation level readiness, tenant count,
 * and an overall score from the individual technology hooks.
 *
 * Note: OVN, K3s, and KubeVirt hooks return `{ data, loading, ... }` (cache-backed),
 * while KubeFlex is still a stub returning flat `{ detected, health, ... }`.
 */
import { useMemo } from 'react'
import { useOvnStatus } from '../ovn-status/useOvnStatus'
import { useKubeFlexStatus } from '../kubeflex-status/useKubeflexStatus'
import { useK3sStatus } from '../k3s-status/useK3sStatus'
import { useKubevirtStatus } from '../kubevirt-status/useKubevirtStatus'

/** Number of isolation levels in the multi-tenancy architecture */
const TOTAL_ISOLATION_LEVELS = 3

export interface ComponentStatus {
  name: string
  detected: boolean
  health: string
  icon: string
}

export type IsolationStatus = 'ready' | 'missing' | 'degraded'

export interface IsolationLevel {
  type: string
  status: IsolationStatus
  provider: string
}

export interface MultiTenancyOverviewData {
  components: ComponentStatus[]
  isolationLevels: IsolationLevel[]
  tenantCount: number
  overallScore: number
  totalLevels: number
  isLoading: boolean
  isRefreshing: boolean
  consecutiveFailures: number
  isDemoData: boolean
  isFailed: boolean
}

export function useMultiTenancyOverview(): MultiTenancyOverviewData {
  // All 4 hooks use the same cache-backed interface: { data, loading, ... }
  const ovnResult = useOvnStatus()
  const kubeflexResult = useKubeFlexStatus()
  const k3sResult = useK3sStatus()
  const kubevirtResult = useKubevirtStatus()

  // Extract data from cache-backed hooks
  const ovn = ovnResult.data
  const kubeflex = kubeflexResult.data
  const k3s = k3sResult.data
  const kubevirt = kubevirtResult.data

  const isLoading = ovnResult.loading || kubeflexResult.loading || k3sResult.loading || kubevirtResult.loading
  // Refreshing when ANY hook is refreshing (background re-fetch after initial load)
  const isRefreshing = ovnResult.isRefreshing || kubeflexResult.isRefreshing || k3sResult.isRefreshing || kubevirtResult.isRefreshing
  // Use the max consecutive failures from any sub-hook
  const consecutiveFailures = Math.max(
    ovnResult.consecutiveFailures,
    kubeflexResult.consecutiveFailures,
    k3sResult.consecutiveFailures,
    kubevirtResult.consecutiveFailures,
  )
  // Demo when ALL hooks are returning demo fallback data (useCache in demo mode)
  const isDemoData = ovnResult.isDemoData && kubeflexResult.isDemoData && k3sResult.isDemoData && kubevirtResult.isDemoData
  // Failed when ANY underlying hook has failed without recoverable data
  const isFailed = ovnResult.error || kubeflexResult.error || k3sResult.error || kubevirtResult.error

  const components: ComponentStatus[] = [
    { name: 'OVN-K8s', detected: ovn.detected, health: ovn.health, icon: 'network' },
    { name: 'KubeFlex', detected: kubeflex.detected, health: kubeflex.health, icon: 'layers' },
    { name: 'K3s', detected: k3s.detected, health: k3s.health, icon: 'box' },
    { name: 'KubeVirt', detected: kubevirt.detected, health: kubevirt.health, icon: 'monitor' },
  ]

  const isolationLevels: IsolationLevel[] = useMemo(() => {
    // Control-plane: Ready if KubeFlex AND K3s detected
    const controlPlaneDetected = kubeflex.detected && k3s.detected
    const controlPlaneStatus: IsolationStatus = controlPlaneDetected
      ? (kubeflex.health === 'healthy' && k3s.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    // Data-plane: Ready if KubeVirt detected
    const dataPlaneStatus: IsolationStatus = kubevirt.detected
      ? (kubevirt.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    // Network: Ready if OVN detected
    const networkStatus: IsolationStatus = ovn.detected
      ? (ovn.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    return [
      { type: 'Control-plane', status: controlPlaneStatus, provider: 'KubeFlex + K3s' },
      { type: 'Data-plane', status: dataPlaneStatus, provider: 'KubeVirt' },
      { type: 'Network', status: networkStatus, provider: 'OVN-Kubernetes' },
    ]
  }, [kubeflex.detected, kubeflex.health, k3s.detected, k3s.health, kubevirt.detected, kubevirt.health, ovn.detected, ovn.health])

  const overallScore = (isolationLevels || []).filter(l => l.status === 'ready').length

  return {
    components,
    isolationLevels,
    tenantCount: kubeflex.tenantCount,
    overallScore,
    totalLevels: TOTAL_ISOLATION_LEVELS,
    isLoading,
    isRefreshing,
    consecutiveFailures,
    isDemoData,
    isFailed }
}
