/**
 * Demo data for the Tenant Topology card.
 *
 * In demo mode all components are shown as detected and healthy,
 * giving the user a complete picture of what the architecture looks like
 * when fully deployed.
 */

import type { TenantTopologyData } from './useTenantTopology'

export const DEMO_TENANT_TOPOLOGY: TenantTopologyData = {
  ovnDetected: true,
  ovnHealthy: true,
  kubeflexDetected: true,
  kubeflexHealthy: true,
  k3sDetected: true,
  k3sHealthy: true,
  kubevirtDetected: true,
  kubevirtHealthy: true,
  isLoading: false,
  isDemoData: true,
}
