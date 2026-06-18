import type { LocalCluster, LocalClusterTool, VClusterInstance } from './types'

export const DEMO_TOOLS: LocalClusterTool[] = [
  { name: 'kind', installed: true, version: '0.20.0', path: '/usr/local/bin/kind' },
  { name: 'k3d', installed: true, version: '5.6.0', path: '/usr/local/bin/k3d' },
  { name: 'minikube', installed: true, version: '1.32.0', path: '/usr/local/bin/minikube' },
  { name: 'vcluster', installed: true, version: '0.21.0', path: '/usr/local/bin/vcluster' },
]

export const DEMO_CLUSTERS: LocalCluster[] = [
  { name: 'kind-local', tool: 'kind', status: 'running' },
  { name: 'kind-test', tool: 'kind', status: 'stopped' },
  { name: 'k3d-dev', tool: 'k3d', status: 'running' },
  { name: 'minikube', tool: 'minikube', status: 'running' },
]

export const DEMO_VCLUSTER_INSTANCES: VClusterInstance[] = [
  { name: 'dev-tenant', namespace: 'vcluster', status: 'Running', connected: true, context: 'vcluster_dev-tenant_vcluster' },
  { name: 'staging', namespace: 'vcluster', status: 'Running', connected: false },
  { name: 'test-isolated', namespace: 'testing', status: 'Paused', connected: false },
]
