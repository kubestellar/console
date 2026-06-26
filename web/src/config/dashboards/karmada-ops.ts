/**
 * Karmada Operations Dashboard Configuration
 *
 * Multi-cluster operations dashboard for Karmada-based environments.
 * Monitors KubeRay fleet, Trino gateways, SLO compliance, and failover events.
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const karmadaOpsDashboardConfig: UnifiedDashboardConfig = {
  id: 'karmada-ops',
  name: 'Karmada Ops',
  subtitle: 'Multi-cluster orchestration, AI inference, and data platform operations',
  route: '/karmada-ops',
  statsType: 'karmada-ops',
  cards: [
    // Top row: fleet overview
    { id: 'karmada-status-1', cardType: 'karmada_status', title: 'Karmada Status', position: { w: 6, h: 4 } },
    { id: 'kuberay-fleet-1', cardType: 'kuberay_fleet', title: 'KubeRay Fleet', position: { w: 6, h: 4 } },

    // Middle row: operational intelligence
    { id: 'slo-compliance-1', cardType: 'slo_compliance', title: 'SLO Compliance', position: { w: 6, h: 4 } },
    { id: 'failover-timeline-1', cardType: 'failover_timeline', title: 'Failover Timeline', position: { w: 6, h: 4 } },

    // Bottom row: data platform + cluster health
    { id: 'trino-gateway-1', cardType: 'trino_gateway', title: 'Trino Gateway', position: { w: 6, h: 4 } },
    { id: 'cluster-health-1', cardType: 'cluster_health', title: 'Cluster Health', position: { w: 6, h: 4 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'karmada-ops-dashboard-cards',
}

export default karmadaOpsDashboardConfig
