/**
 * Cluster Admin Dashboard Configuration
 *
 * Persona-based dashboard for platform engineers managing multi-cluster
 * Kubernetes environments. Covers health, operations, security, and tooling.
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const clusterAdminDashboardConfig: UnifiedDashboardConfig = {
  id: 'cluster-admin',
  name: 'Cluster Admin',
  subtitle: 'Multi-cluster operations, health, and infrastructure management',
  route: '/cluster-admin',
  statsType: 'cluster-admin',
  cards: [
    // Row 1: Health at a glance
    { id: 'ca-health-1', cardType: 'cluster_health', position: { w: 4, h: 3, x: 0, y: 0 } },
    { id: 'ca-cp-1', cardType: 'control_plane_health', title: 'Control Plane', position: { w: 4, h: 3, x: 4, y: 0 } },
    { id: 'ca-provider-1', cardType: 'provider_health', position: { w: 4, h: 3, x: 8, y: 0 } },
    // Row 2: Resources & prediction
    { id: 'ca-usage-1', cardType: 'resource_usage', position: { w: 4, h: 3, x: 0, y: 3 } },
    { id: 'ca-predict-1', cardType: 'predictive_health', title: 'Predictive Health', position: { w: 8, h: 3, x: 4, y: 3 } },
    // Row 3: Issues & events
    { id: 'ca-pods-1', cardType: 'pod_issues', position: { w: 4, h: 3, x: 0, y: 6 } },
    { id: 'ca-deploys-1', cardType: 'deployment_issues', position: { w: 4, h: 3, x: 4, y: 6 } },
    { id: 'ca-warnings-1', cardType: 'warning_events', position: { w: 4, h: 3, x: 8, y: 6 } },
    // Row 4: Operations tooling
    { id: 'ca-kubectl-1', cardType: 'kubectl', position: { w: 6, h: 4, x: 0, y: 9 } },
    { id: 'ca-nodedebug-1', cardType: 'node_debug', title: 'Node Debug', position: { w: 6, h: 4, x: 6, y: 9 } },
    // Row 5: Infrastructure
    { id: 'ca-hw-1', cardType: 'hardware_health', position: { w: 6, h: 3, x: 0, y: 13 } },
    { id: 'ca-upgrade-1', cardType: 'upgrade_status', position: { w: 6, h: 3, x: 6, y: 13 } },
    // Row 6: Node & cert management
    { id: 'ca-nodes-1', cardType: 'node_conditions', title: 'Node Conditions', position: { w: 6, h: 3, x: 0, y: 16 } },
    { id: 'ca-certs-1', cardType: 'cert_manager', position: { w: 6, h: 3, x: 6, y: 16 } },
    // Row 7: Operators
    { id: 'ca-ops-1', cardType: 'operator_status', position: { w: 6, h: 3, x: 0, y: 19 } },
    { id: 'ca-subs-1', cardType: 'operator_subscriptions', position: { w: 6, h: 3, x: 6, y: 19 } },
    // Row 8: OPA & Alerts
    { id: 'ca-opa-1', cardType: 'opa_policies', position: { w: 4, h: 3, x: 0, y: 22 } },
    { id: 'ca-alerts-1', cardType: 'active_alerts', position: { w: 4, h: 3, x: 4, y: 22 } },
    { id: 'ca-alertrules-1', cardType: 'alert_rules', position: { w: 4, h: 3, x: 8, y: 22 } },
    // Row 9: Security & info
    { id: 'ca-security-1', cardType: 'security_issues', position: { w: 4, h: 3, x: 0, y: 25 } },
    { id: 'ca-ai-1', cardType: 'console_ai_health_check', position: { w: 4, h: 3, x: 4, y: 25 } },
    { id: 'ca-rss-1', cardType: 'rss_feed', position: { w: 4, h: 3, x: 8, y: 25 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'cluster-admin-dashboard-cards',
}

export default clusterAdminDashboardConfig
