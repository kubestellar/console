/**
 * Containerd Status — Demo Data & Type Definitions
 *
 * Models running containers surfaced by the containerd (CNCF graduated)
 * container runtime. Shown when no cluster is connected or in demo mode.
 *
 * Marketplace preset: cncf-containerd
 * Upstream issue: kubestellar/console-marketplace#4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerdContainerState = 'running' | 'paused' | 'stopped'

export interface ContainerdContainer {
  /** Short container ID (first 12 chars, matching ctr / crictl output) */
  id: string
  /** Container image reference */
  image: string
  /** Kubernetes namespace the container was launched under */
  namespace: string
  /** Runtime state */
  state: ContainerdContainerState
  /** Human-readable uptime, e.g. "3h 12m" */
  uptime: string
  /** Node the container is running on */
  node: string
}

export interface ContainerdSummary {
  totalContainers: number
  running: number
  paused: number
  stopped: number
}

export interface ContainerdStatusData {
  health: 'healthy' | 'degraded' | 'not-installed'
  containers: ContainerdContainer[]
  summary: ContainerdSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo rows — realistic but synthetic
// ---------------------------------------------------------------------------

export const CONTAINERD_DEMO_CONTAINERS: ContainerdContainer[] = [
  {
    id: '3f9a1c4b2e7d',
    image: 'nginx:1.27-alpine',
    namespace: 'default',
    state: 'running',
    uptime: '3h 12m',
    node: 'worker-1',
  },
  {
    id: '7d2e5f8a9c1b',
    image: 'ghcr.io/kubestellar/console:latest',
    namespace: 'kubestellar',
    state: 'running',
    uptime: '1d 4h',
    node: 'worker-2',
  },
  {
    id: 'b4c6a8d0e2f5',
    image: 'redis:7.2',
    namespace: 'cache',
    state: 'running',
    uptime: '17h 45m',
    node: 'worker-1',
  },
  {
    id: 'a1b2c3d4e5f6',
    image: 'prom/prometheus:v2.54.0',
    namespace: 'monitoring',
    state: 'paused',
    uptime: '22m',
    node: 'worker-3',
  },
  {
    id: 'f0e9d8c7b6a5',
    image: 'busybox:1.36',
    namespace: 'default',
    state: 'stopped',
    uptime: '0s',
    node: 'worker-2',
  },
]

export const CONTAINERD_DEMO_DATA: ContainerdStatusData = {
  health: 'degraded',
  containers: CONTAINERD_DEMO_CONTAINERS,
  summary: {
    totalContainers: CONTAINERD_DEMO_CONTAINERS.length,
    running: CONTAINERD_DEMO_CONTAINERS.filter(c => c.state === 'running').length,
    paused: CONTAINERD_DEMO_CONTAINERS.filter(c => c.state === 'paused').length,
    stopped: CONTAINERD_DEMO_CONTAINERS.filter(c => c.state === 'stopped').length,
  },
  lastCheckTime: new Date().toISOString(),
}
