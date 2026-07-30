export type FluxResourceKind = 'GitRepository' | 'Kustomization' | 'HelmRelease'

export interface FluxResourceStatus {
  kind: FluxResourceKind
  name: string
  namespace: string
  cluster: string
  ready: boolean
  reason?: string
  revision?: string
  lastUpdated?: string
}

export interface FluxResourceSummary {
  total: number
  ready: number
  notReady: number
}

export interface FluxStatusData {
  health: 'healthy' | 'degraded' | 'not-installed'
  sources: FluxResourceSummary
  kustomizations: FluxResourceSummary
  helmReleases: FluxResourceSummary
  resources: {
    sources: FluxResourceStatus[]
    kustomizations: FluxResourceStatus[]
    helmReleases: FluxResourceStatus[]
  }
  lastCheckTime: string
}

const NOW = Date.now()
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

const demoSources: FluxResourceStatus[] = [
  {
    kind: 'GitRepository',
    name: 'flux-system',
    namespace: 'flux-system',
    cluster: 'dev-us-east',
    ready: true,
    revision: 'main@sha1:2f4a9e3',
    lastUpdated: new Date(NOW - (8 * MINUTE_MS)).toISOString(),
  },
  {
    kind: 'GitRepository',
    name: 'platform-config',
    namespace: 'flux-system',
    cluster: 'prod-us-central',
    ready: false,
    reason: 'AuthenticationFailed',
    revision: 'main@sha1:6c8d2f1',
    lastUpdated: new Date(NOW - (55 * MINUTE_MS)).toISOString(),
  },
]

const demoKustomizations: FluxResourceStatus[] = [
  {
    kind: 'Kustomization',
    name: 'infrastructure',
    namespace: 'flux-system',
    cluster: 'dev-us-east',
    ready: true,
    revision: 'main@sha1:2f4a9e3',
    lastUpdated: new Date(NOW - (6 * MINUTE_MS)).toISOString(),
  },
  {
    kind: 'Kustomization',
    name: 'apps',
    namespace: 'flux-system',
    cluster: 'prod-us-central',
    ready: true,
    revision: 'main@sha1:6c8d2f1',
    lastUpdated: new Date(NOW - (12 * MINUTE_MS)).toISOString(),
  },
  {
    kind: 'Kustomization',
    name: 'monitoring',
    namespace: 'flux-system',
    cluster: 'prod-us-central',
    ready: false,
    reason: 'ReconciliationFailed',
    revision: 'main@sha1:6c8d2f1',
    lastUpdated: new Date(NOW - (2 * HOUR_MS)).toISOString(),
  },
]

const demoHelmReleases: FluxResourceStatus[] = [
  {
    kind: 'HelmRelease',
    name: 'ingress-nginx',
    namespace: 'ingress-nginx',
    cluster: 'dev-us-east',
    ready: true,
    revision: 'ingress-nginx-4.10.0',
    lastUpdated: new Date(NOW - (20 * MINUTE_MS)).toISOString(),
  },
  {
    kind: 'HelmRelease',
    name: 'kube-prometheus-stack',
    namespace: 'monitoring',
    cluster: 'prod-us-central',
    ready: false,
    reason: 'UpgradeFailed',
    revision: 'kube-prometheus-stack-57.0.2',
    lastUpdated: new Date(NOW - (95 * MINUTE_MS)).toISOString(),
  },
]

export const FLUX_DEMO_DATA: FluxStatusData = {
  health: 'degraded',
  sources: { total: 2, ready: 1, notReady: 1 },
  kustomizations: { total: 3, ready: 2, notReady: 1 },
  helmReleases: { total: 2, ready: 1, notReady: 1 },
  resources: {
    sources: demoSources,
    kustomizations: demoKustomizations,
    helmReleases: demoHelmReleases,
  },
  lastCheckTime: new Date(NOW).toISOString(),
}
