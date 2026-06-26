/**
 * Demo data for the Multi-Tenancy Overview card.
 *
 * All 4 components detected and healthy. 3 tenants, 3/3 isolation score.
 */
import type { MultiTenancyOverviewData } from './useMultiTenancyOverview'

/** Number of demo tenants */
const DEMO_TENANT_COUNT = 3
/** All isolation levels ready in demo */
const DEMO_ISOLATION_SCORE = 3
/** Total isolation levels in the architecture */
const DEMO_TOTAL_LEVELS = 3

export const DEMO_MULTI_TENANCY_OVERVIEW: MultiTenancyOverviewData = {
  components: [
    { name: 'OVN-K8s', detected: true, health: 'healthy', icon: 'network' },
    { name: 'KubeFlex', detected: true, health: 'healthy', icon: 'layers' },
    { name: 'K3s', detected: true, health: 'healthy', icon: 'box' },
    { name: 'KubeVirt', detected: true, health: 'healthy', icon: 'monitor' },
  ],
  isolationLevels: [
    { type: 'Control-plane', status: 'ready', provider: 'KubeFlex + K3s' },
    { type: 'Data-plane', status: 'ready', provider: 'KubeVirt' },
    { type: 'Network', status: 'ready', provider: 'OVN-Kubernetes' },
  ],
  tenantCount: DEMO_TENANT_COUNT,
  overallScore: DEMO_ISOLATION_SCORE,
  totalLevels: DEMO_TOTAL_LEVELS,
  isLoading: false,
  isRefreshing: false,
  consecutiveFailures: 0,
  isDemoData: true,
  isFailed: false,
}
