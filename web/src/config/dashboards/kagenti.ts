/**
 * Kagenti AI Agents Dashboard Configuration
 */
import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const kagentiDashboardConfig: UnifiedDashboardConfig = {
  id: 'kagenti',
  name: 'AI Agents',
  subtitle: 'Kagenti agent deployment, builds, and MCP tools',
  route: '/ai-agents',
  statsType: 'kagenti',
  cards: [
    // Overview row
    { id: 'kagenti-status-1', cardType: 'kagenti_status', title: 'Kagenti Platform', position: { w: 6, h: 4 } },
    { id: 'kagenti-security-1', cardType: 'kagenti_security_posture', title: 'Security Posture', position: { w: 6, h: 4 } },
    // Detail row
    { id: 'kagenti-fleet-1', cardType: 'kagenti_agent_fleet', title: 'Agent Fleet', position: { w: 6, h: 4 } },
    { id: 'kagenti-builds-1', cardType: 'kagenti_build_pipeline', title: 'Build Pipeline', position: { w: 6, h: 4 } },
    // Tools row
    { id: 'kagenti-tools-1', cardType: 'kagenti_tool_registry', title: 'MCP Tool Registry', position: { w: 6, h: 4 } },
    { id: 'kagenti-discovery-1', cardType: 'kagenti_agent_discovery', title: 'Agent Discovery', position: { w: 6, h: 4 } },
  ],
  features: {
    dragDrop: true,
    addCard: true,
    autoRefresh: true,
    autoRefreshInterval: 30000,
  },
  storageKey: 'kagenti-dashboard-cards',
}

export default kagentiDashboardConfig
