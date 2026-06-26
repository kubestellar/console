import type { CardComponent } from './cardRegistry.types'
import { safeLazy } from '../../lib/safeLazy'

const _multiTenancyBundle = import('./multi-tenancy').catch(() => undefined as never)
const K3sStatus = safeLazy(() => _multiTenancyBundle, 'K3sStatus')
const KubeflexStatus = safeLazy(() => _multiTenancyBundle, 'KubeflexStatus')
const KubevirtStatus = safeLazy(() => _multiTenancyBundle, 'KubevirtStatus')
const MultiTenancyOverview = safeLazy(() => _multiTenancyBundle, 'MultiTenancyOverview')
const OvnStatus = safeLazy(() => _multiTenancyBundle, 'OvnStatus')
const TenantIsolationSetup = safeLazy(() => _multiTenancyBundle, 'TenantIsolationSetup')
const TenantTopology = safeLazy(() => _multiTenancyBundle, 'TenantTopology')
const VClusterStatus = safeLazy(() => import('./VClusterStatus'), 'VClusterStatus')

/**
 * Multi-tenancy and virtualization cards.
 * Cards:
 * k3s_status, kubeflex_status, kubevirt_status, multi_tenancy_overview, ovn_status,
 * tenant_isolation_setup, tenant_topology, vcluster_status
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const components: Record<string, CardComponent> = {
  k3s_status: K3sStatus,
  kubeflex_status: KubeflexStatus,
  kubevirt_status: KubevirtStatus,
  multi_tenancy_overview: MultiTenancyOverview,
  ovn_status: OvnStatus,
  tenant_isolation_setup: TenantIsolationSetup,
  tenant_topology: TenantTopology,
  vcluster_status: VClusterStatus,
}

export const multiTenancyCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'vcluster_status',
  ]),
  liveDataCards: new Set([
    'k3s_status',
    'kubeflex_status',
    'kubevirt_status',
    'multi_tenancy_overview',
    'ovn_status',
    'tenant_isolation_setup',
    'tenant_topology',
  ]),
  chunkPreloaders: {
    k3s_status: () => import('./multi-tenancy'),
    kubeflex_status: () => import('./multi-tenancy'),
    kubevirt_status: () => import('./multi-tenancy'),
    multi_tenancy_overview: () => import('./multi-tenancy'),
    ovn_status: () => import('./multi-tenancy'),
    tenant_isolation_setup: () => import('./multi-tenancy'),
    tenant_topology: () => import('./multi-tenancy'),
    vcluster_status: () => import('./VClusterStatus'),
  },
  defaultWidths: {
    k3s_status: 6,
    kubeflex_status: 6,
    kubevirt_status: 6,
    multi_tenancy_overview: 6,
    ovn_status: 6,
    tenant_isolation_setup: 6,
    tenant_topology: 6,
    vcluster_status: 6,
  },
}
