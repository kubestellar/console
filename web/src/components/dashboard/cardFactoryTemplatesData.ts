import type { DynamicCardColumn } from '../../lib/dynamic-cards/types'

// ============================================================================
// Declarative Templates
// ============================================================================

export interface T1Template {
  name: string
  title: string
  description: string
  layout: 'list' | 'stats' | 'stats-and-list'
  width: number
  columns: DynamicCardColumn[]
  data: Record<string, unknown>[]
}

export const T1_TEMPLATES: T1Template[] = [
  {
    name: 'Pod Status',
    title: 'Pod Status',
    description: 'Pod health across clusters',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Pod Name' },
      { field: 'namespace', label: 'Namespace' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Running: 'bg-green-500/20 text-green-400', Pending: 'bg-yellow-500/20 text-yellow-400', Failed: 'bg-red-500/20 text-red-400' } },
      { field: 'restarts', label: 'Restarts', format: 'number' },
    ],
    data: [
      { name: 'api-server-1', namespace: 'default', status: 'Running', restarts: 0 },
      { name: 'worker-2', namespace: 'production', status: 'Running', restarts: 2 },
      { name: 'cache-1', namespace: 'default', status: 'Pending', restarts: 0 },
      { name: 'scheduler-3', namespace: 'kube-system', status: 'Running', restarts: 1 },
      { name: 'ingress-5', namespace: 'ingress-nginx', status: 'Failed', restarts: 8 },
    ] },
  {
    name: 'Deployment Health',
    title: 'Deployment Health',
    description: 'Deployment status and readiness',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Deployment' },
      { field: 'replicas', label: 'Replicas', format: 'number' },
      { field: 'available', label: 'Available', format: 'number' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Healthy: 'bg-green-500/20 text-green-400', Degraded: 'bg-yellow-500/20 text-yellow-400', Critical: 'bg-red-500/20 text-red-400' } },
    ],
    data: [
      { name: 'api-gateway', replicas: 3, available: 3, status: 'Healthy' },
      { name: 'auth-service', replicas: 2, available: 2, status: 'Healthy' },
      { name: 'worker-pool', replicas: 5, available: 3, status: 'Degraded' },
      { name: 'cache-layer', replicas: 2, available: 0, status: 'Critical' },
    ] },
  {
    name: 'Node Resources',
    title: 'Node Resources',
    description: 'Node CPU and memory utilization',
    layout: 'list',
    width: 8,
    columns: [
      { field: 'node', label: 'Node' },
      { field: 'cpu', label: 'CPU' },
      { field: 'memory', label: 'Memory' },
      { field: 'status', label: 'Status', format: 'badge', badgeColors: { Ready: 'bg-green-500/20 text-green-400', NotReady: 'bg-red-500/20 text-red-400' } },
    ],
    data: [
      { node: 'worker-1', cpu: '45%', memory: '3.2Gi / 8Gi', status: 'Ready' },
      { node: 'worker-2', cpu: '72%', memory: '5.8Gi / 8Gi', status: 'Ready' },
      { node: 'worker-3', cpu: '18%', memory: '1.1Gi / 4Gi', status: 'Ready' },
      { node: 'control-1', cpu: '31%', memory: '2.4Gi / 16Gi', status: 'Ready' },
    ] },
  {
    name: 'Service Status',
    title: 'Service Status',
    description: 'Kubernetes services and their endpoints',
    layout: 'list',
    width: 6,
    columns: [
      { field: 'name', label: 'Service' },
      { field: 'type', label: 'Type', format: 'badge', badgeColors: { ClusterIP: 'bg-blue-500/20 text-blue-400', LoadBalancer: 'bg-purple-500/20 text-purple-400', NodePort: 'bg-cyan-500/20 text-cyan-400' } },
      { field: 'port', label: 'Port', format: 'number' },
      { field: 'namespace', label: 'Namespace' },
    ],
    data: [
      { name: 'api-gateway', type: 'LoadBalancer', port: 443, namespace: 'default' },
      { name: 'auth-service', type: 'ClusterIP', port: 8080, namespace: 'default' },
      { name: 'monitoring', type: 'NodePort', port: 9090, namespace: 'monitoring' },
    ] },
  {
    name: 'Namespace Summary',
    title: 'Namespace Summary',
    description: 'Resource counts per namespace',
    layout: 'stats-and-list',
    width: 8,
    columns: [
      { field: 'namespace', label: 'Namespace' },
      { field: 'pods', label: 'Pods', format: 'number' },
      { field: 'deployments', label: 'Deployments', format: 'number' },
      { field: 'services', label: 'Services', format: 'number' },
    ],
    data: [
      { namespace: 'default', pods: 12, deployments: 4, services: 3 },
      { namespace: 'production', pods: 45, deployments: 12, services: 8 },
      { namespace: 'monitoring', pods: 8, deployments: 3, services: 5 },
      { namespace: 'kube-system', pods: 15, deployments: 6, services: 4 },
    ] },
]
