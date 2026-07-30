import type { UnifiedDashboardConfig } from '../../lib/unified/types'

const AUTO_REFRESH_INTERVAL_MS = 30000

export const llmdMonitoringDashboardConfig: UnifiedDashboardConfig = {
  id: 'llm-d-monitoring',
  name: 'llm-d Monitoring',
  subtitle: 'EPP health, model endpoint status, and autoscaler overview',
  route: '/llm-d-monitoring',
  projects: ['kubestellar'],
  statsType: 'ai-ml',
  cards: [
    { id: 'mon-epp-health-1', cardType: 'epp_health', title: 'EPP Health', position: { w: 6, h: 3 } },
    { id: 'mon-endpoint-health-1', cardType: 'model_endpoint_health', title: 'Model Endpoint Health', position: { w: 6, h: 3 } },
    { id: 'mon-stack-1', cardType: 'llmd_stack_monitor', title: 'llm-d Stack Overview', position: { w: 12, h: 4 } },
    { id: 'mon-epp-routing-1', cardType: 'epp_routing', title: 'EPP Routing', position: { w: 6, h: 4 } },
    { id: 'mon-kvcache-1', cardType: 'kvcache_monitor', title: 'KV Cache Monitor', position: { w: 6, h: 4 } },
    { id: 'mon-flow-1', cardType: 'llmd_flow', title: 'Request Flow', position: { w: 6, h: 5 } },
    { id: 'mon-ai-insights-1', cardType: 'llmd_ai_insights', title: 'AI Insights', position: { w: 6, h: 5 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: AUTO_REFRESH_INTERVAL_MS,
  },
  storageKey: 'llmd-monitoring-dashboard-cards',
}

export default llmdMonitoringDashboardConfig
