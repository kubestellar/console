/**
 * Contour Status Card — Demo Data & Type Definitions
 *
 * Models HTTPProxy CRD resources and Envoy fleet health for the
 * Contour (CNCF incubating) ingress proxy.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContourProxyStatus {
  name: string
  namespace: string
  cluster: string
  fqdn: string
  status: 'Valid' | 'Invalid'
  conditions: string[]
}

export interface ContourEnvoyFleet {
  total: number
  ready: number
  notReady: number
}

export interface ContourSummary {
  totalProxies: number
  validProxies: number
  invalidProxies: number
}

export interface ContourStatusData {
  proxies: ContourProxyStatus[]
  envoyFleet: ContourEnvoyFleet
  summary: ContourSummary
  health: 'healthy' | 'degraded' | 'not-installed'
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when Contour is not installed or in demo mode
// ---------------------------------------------------------------------------

export const CONTOUR_DEMO_DATA: ContourStatusData = {
  proxies: [
    {
      name: 'frontend-proxy',
      namespace: 'default',
      cluster: 'default',
      fqdn: 'app.example.com',
      status: 'Valid',
      conditions: [],
    },
    {
      name: 'api-proxy',
      namespace: 'api',
      cluster: 'default',
      fqdn: 'api.example.com',
      status: 'Valid',
      conditions: [],
    },
    {
      name: 'staging-proxy',
      namespace: 'staging',
      cluster: 'default',
      fqdn: 'staging.example.com',
      status: 'Invalid',
      conditions: ['IncompleteRule'],
    },
  ],
  envoyFleet: { total: 3, ready: 2, notReady: 1 },
  summary: { totalProxies: 3, validProxies: 2, invalidProxies: 1 },
  health: 'degraded',
  lastCheckTime: new Date().toISOString(),
}
