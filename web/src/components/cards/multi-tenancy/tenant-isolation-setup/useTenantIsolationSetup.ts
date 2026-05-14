/**
 * useTenantIsolationSetup — Aggregates all 4 technology hooks to determine
 * component readiness for the setup wizard.
 *
 * No caching needed — purely derived from the individual status hooks.
 */
import type { IsolationStatus } from '../shared'
import { useOvnStatus } from '../ovn-status/useOvnStatus'
import { useKubeFlexStatus } from '../kubeflex-status/useKubeflexStatus'
import { useK3sStatus } from '../k3s-status/useK3sStatus'
import { useKubevirtStatus } from '../kubevirt-status/useKubevirtStatus'

/** Total number of isolation levels */
const TOTAL_ISOLATION_LEVELS = 3

export interface ComponentReadiness {
  name: string
  key: string
  detected: boolean
  health: string
}

export type { IsolationStatus }

export interface IsolationLevel {
  type: string
  status: IsolationStatus
  provider: string
}

export interface TenantIsolationSetupData {
  components: ComponentReadiness[]
  isolationLevels: IsolationLevel[]
  allReady: boolean
  readyCount: number
  totalComponents: number
  isolationScore: number
  totalIsolationLevels: number
  isLoading: boolean
  isRefreshing: boolean
  isDemoData: boolean
}

export function useTenantIsolationSetup(): TenantIsolationSetupData {
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
  const isRefreshing = ovnResult.isRefreshing || kubeflexResult.isRefreshing || k3sResult.isRefreshing || kubevirtResult.isRefreshing
  // Demo when ALL hooks are returning demo fallback data (useCache in demo mode)
  const isDemoData = ovnResult.isDemoData && kubeflexResult.isDemoData && k3sResult.isDemoData && kubevirtResult.isDemoData

  const components: ComponentReadiness[] = [
    { name: 'OVN-Kubernetes', key: 'ovn', detected: ovn.detected, health: ovn.health },
    { name: 'KubeFlex', key: 'kubeflex', detected: kubeflex.detected, health: kubeflex.health },
    { name: 'K3s', key: 'k3s', detected: k3s.detected, health: k3s.health },
    { name: 'KubeVirt', key: 'kubevirt', detected: kubevirt.detected, health: kubevirt.health },
  ]

  const isolationLevels: IsolationLevel[] = (() => {
    const controlPlaneDetected = kubeflex.detected && k3s.detected
    const controlPlaneStatus: IsolationStatus = controlPlaneDetected
      ? (kubeflex.health === 'healthy' && k3s.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    const dataPlaneStatus: IsolationStatus = kubevirt.detected
      ? (kubevirt.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    const networkStatus: IsolationStatus = ovn.detected
      ? (ovn.health === 'healthy' ? 'ready' : 'degraded')
      : 'missing'

    return [
      { type: 'Control-plane', status: controlPlaneStatus, provider: 'KubeFlex + K3s' },
      { type: 'Data-plane', status: dataPlaneStatus, provider: 'KubeVirt' },
      { type: 'Network', status: networkStatus, provider: 'OVN-Kubernetes' },
    ]
  })()

  const readyCount = (components || []).filter(c => c.detected).length
  const allReady = readyCount === (components || []).length
  const isolationScore = (isolationLevels || []).filter(l => l.status === 'ready').length

  return {
    components,
    isolationLevels,
    allReady,
    readyCount,
    totalComponents: (components || []).length,
    isolationScore,
    totalIsolationLevels: TOTAL_ISOLATION_LEVELS,
    isLoading,
    isRefreshing,
    isDemoData }
}
