import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const threatIntelDashboardConfig: UnifiedDashboardConfig = {
  id: 'threat-intel',
  name: 'Threat Intelligence',
  subtitle: 'Threat feed monitoring, IOC matching, and vulnerability correlation',
  route: '/enterprise/threat-intel',
  statsType: 'security',
  cards: [
    { id: 'ti-trivy-scan', cardType: 'trivy_scan', title: 'Trivy Scan', position: { w: 4, h: 3 } },
    { id: 'ti-security-issues', cardType: 'security_issues', title: 'Security Issues', position: { w: 4, h: 3 } },
    { id: 'ti-active-alerts', cardType: 'active_alerts', title: 'Active Alerts', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'threat-intel-dashboard-cards-v2',
}

export default threatIntelDashboardConfig
