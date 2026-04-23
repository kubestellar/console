import type { UnifiedDashboardConfig } from '../../lib/unified/types'

export const threatIntelDashboardConfig: UnifiedDashboardConfig = {
  id: 'threat-intel',
  name: 'Threat Intelligence',
  subtitle: 'Threat feed monitoring, IOC matching, and vulnerability correlation',
  route: '/enterprise/threat-intel',
  statsType: 'security',
  cards: [
    { id: 'ti-feeds-1', cardType: 'threat_intel', title: 'Threat Feeds', position: { w: 4, h: 3 } },
    { id: 'ti-iocs-1', cardType: 'threat_intel', title: 'IOC Matches', position: { w: 4, h: 3 } },
    { id: 'ti-risk-1', cardType: 'threat_intel', title: 'Risk Score', position: { w: 4, h: 3 } },
  ],
  features: { dragDrop: true, addCard: true, autoRefresh: true, autoRefreshInterval: 120_000 },
  storageKey: 'threat-intel-dashboard-cards',
}

export default threatIntelDashboardConfig
