/**
 * Demo data for the Flatcar Container Linux status card.
 *
 * These numbers are representative of a mid-size multi-cluster environment
 * running Flatcar Container Linux as the node OS. They are used when the
 * dashboard is in demo mode or when no Kubernetes clusters are connected.
 *
 * Note: updatingNodes/outdatedNodes reflect a realistic mixed-version fleet
 * so the demo data is internally consistent with the health status.
 */

export interface FlatcarDemoData {
  totalNodes: number
  versions: Record<string, number>
  updatingNodes: number
  outdatedNodes: number
  health: 'healthy' | 'degraded'
  lastCheckTime: string
}

export const FLATCAR_DEMO_DATA: FlatcarDemoData = {
  totalNodes: 24,
  versions: {
    '3815.2.5': 18,
    '3760.1.0': 4,
    '3602.2.3': 2,
  },
  // 6 nodes are not on latest version → health is "degraded"
  updatingNodes: 2,
  outdatedNodes: 4,
  health: 'degraded',
  lastCheckTime: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes ago
}
