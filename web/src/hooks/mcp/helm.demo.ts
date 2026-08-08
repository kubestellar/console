import type { HelmRelease, HelmHistoryEntry } from './types'

// Cached demo releases so we don't rebuild the array on every access
let _cachedDemoReleases: HelmRelease[] | null = null

export function getDemoHelmReleases(): HelmRelease[] {
  if (_cachedDemoReleases) return _cachedDemoReleases
  _cachedDemoReleases = [
    { name: 'prometheus', namespace: 'monitoring', revision: '5', updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', cluster: 'eks-prod-us-east-1' },
    { name: 'grafana', namespace: 'monitoring', revision: '3', updated: new Date(Date.now() - 5 * 3600000).toISOString(), status: 'deployed', chart: 'grafana-7.0.11', app_version: '10.2.3', cluster: 'eks-prod-us-east-1' },
    { name: 'nginx-ingress', namespace: 'ingress', revision: '8', updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'deployed', chart: 'ingress-nginx-4.8.3', app_version: '1.9.4', cluster: 'eks-prod-us-east-1' },
    { name: 'cert-manager', namespace: 'cert-manager', revision: '2', updated: new Date(Date.now() - 72 * 3600000).toISOString(), status: 'deployed', chart: 'cert-manager-1.13.3', app_version: '1.13.3', cluster: 'gke-staging' },
    { name: 'redis', namespace: 'data', revision: '4', updated: new Date(Date.now() - 12 * 3600000).toISOString(), status: 'deployed', chart: 'redis-18.4.0', app_version: '7.2.3', cluster: 'gke-staging' },
    { name: 'api-gateway', namespace: 'production', revision: '6', updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', cluster: 'eks-prod-us-east-1' },
    { name: 'elasticsearch', namespace: 'logging', revision: '3', updated: new Date(Date.now() - 48 * 3600000).toISOString(), status: 'deployed', chart: 'elasticsearch-8.5.1', app_version: '8.11.1', cluster: 'vllm-gpu-cluster' },
    { name: 'vault', namespace: 'security', revision: '2', updated: new Date(Date.now() - 168 * 3600000).toISOString(), status: 'deployed', chart: 'vault-0.27.0', app_version: '1.15.4', cluster: 'vllm-gpu-cluster' },
  ]
  return _cachedDemoReleases
}

export function getDemoHelmHistory(): HelmHistoryEntry[] {
  return [
    { revision: 6, updated: new Date(Date.now() - 1 * 3600000).toISOString(), status: 'failed', chart: 'api-gateway-2.1.0', app_version: '3.5.0', description: 'Upgrade failed: container crashed' },
    { revision: 5, updated: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'deployed', chart: 'prometheus-25.8.0', app_version: '2.48.1', description: 'Upgrade complete' },
    { revision: 4, updated: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.7.0', app_version: '2.48.0', description: 'Upgrade complete' },
    { revision: 3, updated: new Date(Date.now() - 72 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.6.0', app_version: '2.47.2', description: 'Upgrade complete' },
    { revision: 2, updated: new Date(Date.now() - 168 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.5.0', app_version: '2.47.0', description: 'Upgrade complete' },
    { revision: 1, updated: new Date(Date.now() - 720 * 3600000).toISOString(), status: 'superseded', chart: 'prometheus-25.0.0', app_version: '2.45.0', description: 'Install complete' },
  ]
}

export function getDemoHelmValues(): Record<string, unknown> {
  return {
    replicaCount: 2,
    image: { repository: 'prom/prometheus', tag: 'v2.48.1', pullPolicy: 'IfNotPresent' },
    service: { type: 'ClusterIP', port: 9090 },
    resources: { limits: { cpu: '500m', memory: '512Mi' }, requests: { cpu: '200m', memory: '256Mi' } },
    persistence: { enabled: true, size: '50Gi', storageClass: 'gp3' },
    alertmanager: { enabled: true },
    nodeExporter: { enabled: true },
    serverFiles: { 'alerting_rules.yml': {}, 'recording_rules.yml': {} },
  }
}
