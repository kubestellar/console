/**
 * Compliance Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const complianceDashboardConfig: UnifiedDashboardConfig = {
  id: 'compliance',
  name: 'Compliance',
  subtitle: 'Security posture and compliance metrics',
  route: '/compliance',
  statsType: 'compliance',
  cards: [
    { id: 'recommended-policies-1', cardType: 'recommended_policies', position: { w: 6, h: 4 } },
    { id: 'compliance-score-1', cardType: 'compliance_score', position: { w: 4, h: 3 } },
    { id: 'policy-violations-1', cardType: 'policy_violations', position: { w: 8, h: 4 } },
    { id: 'fleet-compliance-heatmap-1', cardType: 'fleet_compliance_heatmap', position: { w: 12, h: 4 } },
    { id: 'opa-policies-1', cardType: 'opa_policies', position: { w: 6, h: 3 } },
    { id: 'kyverno-policies-1', cardType: 'kyverno_policies', position: { w: 6, h: 3 } },
    { id: 'kubescape-scan-1', cardType: 'kubescape_scan', position: { w: 6, h: 3 } },
    { id: 'trivy-scan-1', cardType: 'trivy_scan', position: { w: 6, h: 3 } },
    { id: 'trestle-scan-1', cardType: 'trestle_scan', position: { w: 6, h: 3 } },
    { id: 'compliance-drift-1', cardType: 'compliance_drift', position: { w: 6, h: 3 } },
    { id: 'cross-cluster-policy-comparison-1', cardType: 'cross_cluster_policy_comparison', position: { w: 6, h: 3 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 60000,
  },
  storageKey: 'compliance-dashboard-cards',
}

export default complianceDashboardConfig
