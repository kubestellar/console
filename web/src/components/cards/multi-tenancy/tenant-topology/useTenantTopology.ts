/**
 * useTenantTopology — Aggregates the 4 technology hooks to determine
 * component detection status for each topology node.
 *
 * Returns simple detected/healthy booleans per component, plus a combined
 * isDemoData flag that the card uses for the Demo badge via useCardLoadingState.
 */
import { useMemo } from 'react'
import { useOvnStatus } from '../ovn-status/useOvnStatus'
import { useKubeFlexStatus } from '../kubeflex-status/useKubeflexStatus'
import { useK3sStatus } from '../k3s-status/useK3sStatus'
import { useKubevirtStatus } from '../kubevirt-status/useKubevirtStatus'

export interface TenantTopologyData {
  ovnDetected: boolean
  ovnHealthy: boolean
  kubeflexDetected: boolean
  kubeflexHealthy: boolean
  k3sDetected: boolean
  k3sHealthy: boolean
  kubevirtDetected: boolean
  kubevirtHealthy: boolean
  isLoading: boolean
  isDemoData: boolean
}

export function useTenantTopology(): TenantTopologyData {
  const ovnResult = useOvnStatus()
  const kubeflexResult = useKubeFlexStatus()
  const k3sResult = useK3sStatus()
  const kubevirtResult = useKubevirtStatus()

  const ovn = ovnResult.data
  const kubeflex = kubeflexResult.data
  const k3s = k3sResult.data
  const kubevirt = kubevirtResult.data

  const isLoading =
    ovnResult.loading || kubeflexResult.loading || k3sResult.loading || kubevirtResult.loading

  // Consider demo when no data is detected from any source
  const isDemoData = !ovn.detected && !kubeflex.detected && !k3s.detected && !kubevirt.detected

  return useMemo(
    () => ({
      ovnDetected: ovn.detected,
      ovnHealthy: ovn.health === 'healthy',
      kubeflexDetected: kubeflex.detected,
      kubeflexHealthy: kubeflex.health === 'healthy',
      k3sDetected: k3s.detected,
      k3sHealthy: k3s.health === 'healthy',
      kubevirtDetected: kubevirt.detected,
      kubevirtHealthy: kubevirt.health === 'healthy',
      isLoading,
      isDemoData,
    }),
    [
      ovn.detected, ovn.health,
      kubeflex.detected, kubeflex.health,
      k3s.detected, k3s.health,
      kubevirt.detected, kubevirt.health,
      isLoading, isDemoData,
    ],
  )
}
