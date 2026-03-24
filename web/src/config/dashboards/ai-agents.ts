/**
 * AI Agents Dashboard Configuration
 * Tabbed view: Kagent | Kagenti
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const aiAgentsDashboardConfig: UnifiedDashboardConfig = {
  id: 'ai-agents',
  name: 'AI Agents',
  subtitle: 'Deploy, secure, and manage AI agents across your clusters',
  route: '/ai-agents',
  projects: ['kubestellar', 'kagent', 'kagenti'],
  statsType: 'ai-agents',

  // Default cards (used when no tab is active / fallback)
  cards: [],

  // Tabbed layout — Kagent and Kagenti each get their own card set
  tabs: [
    {
      id: 'kagent',
      label: 'Kagent',
      icon: 'kagent',
      installUrl: 'https://github.com/kagent-dev/kagent',
      cards: [
        { id: 'kagent-status-1', cardType: 'kagent_status', title: 'Kagent Overview', position: { w: 4, h: 5 } },
        { id: 'kagent-fleet-1', cardType: 'kagent_agent_fleet', title: 'Agent Fleet', position: { w: 8, h: 5 } },
        { id: 'kagent-tools-1', cardType: 'kagent_tool_registry', title: 'Tool Servers', position: { w: 4, h: 4 } },
        { id: 'kagent-models-1', cardType: 'kagent_model_providers', title: 'Model Providers', position: { w: 4, h: 4 } },
        { id: 'kagent-discovery-1', cardType: 'kagent_agent_discovery', title: 'Agent Discovery', position: { w: 4, h: 4 } },
        { id: 'kagent-security-1', cardType: 'kagent_security', title: 'Security', position: { w: 4, h: 4 } },
        { id: 'kagent-topology-1', cardType: 'kagent_topology', title: 'Agent Topology', position: { w: 8, h: 4 } },
      ],
    },
    {
      id: 'kagenti',
      label: 'Kagenti',
      icon: 'kagenti',
      installUrl: 'https://github.com/kagenti/kagenti',
      cards: [
        { id: 'kagenti-status-1', cardType: 'kagenti_status', title: 'Kagenti Overview', position: { w: 4, h: 5 } },
        { id: 'kagenti-fleet-1', cardType: 'kagenti_agent_fleet', title: 'Agent Fleet', position: { w: 8, h: 5 } },
        { id: 'kagenti-builds-1', cardType: 'kagenti_build_pipeline', title: 'Build Pipeline', position: { w: 4, h: 4 } },
        { id: 'kagenti-tools-1', cardType: 'kagenti_tool_registry', title: 'MCP Tool Registry', position: { w: 4, h: 4 } },
        { id: 'kagenti-discovery-1', cardType: 'kagenti_agent_discovery', title: 'Agent Discovery', position: { w: 4, h: 4 } },
        { id: 'kagenti-security-1', cardType: 'kagenti_security', title: 'Security Posture', position: { w: 4, h: 4 } },
        { id: 'kagenti-topology-1', cardType: 'kagenti_topology', title: 'Agent Topology', position: { w: 8, h: 4 } },
      ],
    },
  ],

  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'ai-agents-dashboard-cards',
}

export default aiAgentsDashboardConfig
