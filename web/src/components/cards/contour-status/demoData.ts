/**
 * Demo data for the Contour ingress controller status card.
 *
 * Represents a mid-size environment with Contour managing ingress
 * across multiple namespaces. Used in demo mode or when no Kubernetes
 * clusters are connected.
 */

export interface ContourHTTPProxyStats {
  total: number
  valid: number
  invalid: number
  orphaned: number
}

export interface ContourPodStats {
  ready: number
  total: number
}

export interface ContourDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  contourPods: ContourPodStats
  envoyPods: ContourPodStats
  httpProxies: ContourHTTPProxyStats
  tlsEnabled: number
  lastCheckTime: string
}

export const CONTOUR_DEMO_DATA: ContourDemoData = {
  // One Envoy pod not ready → degraded, so the demo card shows a non-trivial state
  health: 'degraded',
  contourPods: { ready: 2, total: 2 },
  envoyPods: { ready: 5, total: 6 },
  httpProxies: {
    total: 18,
    valid: 15,
    invalid: 2,
    orphaned: 1,
  },
  tlsEnabled: 12,
  lastCheckTime: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
}
