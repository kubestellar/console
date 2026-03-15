/**
 * Demo data for the CRI-O container runtime status card.
 *
 * These numbers represent a typical multi-node cluster running CRI-O
 * as the container runtime. They are used when the dashboard is in demo
 * mode or when no Kubernetes clusters are connected.
 *
 * Metrics include: runtime status, image pulls, pod sandbox status,
 * container metrics, and version distribution.
 */

export interface CrioStatusDemoData {
  detected: boolean
  totalNodes: number
  versions: Record<string, number>
  health: 'healthy' | 'degraded' | 'not-installed'
  runtimeMetrics: {
    runningContainers: number
    pausedContainers: number
    stoppedContainers: number
  }
  imagePulls: {
    total: number
    successful: number
    failed: number
  }
  podSandboxes: {
    ready: number
    notReady: number
    total: number
  }
  recentImagePulls: Array<{
    image: string
    status: 'success' | 'failed'
    time: string
    size?: string
  }>
  lastCheckTime: string
}

/** Demo: timestamp offset for latest refresh (2 minutes ago). */
const DEMO_LAST_CHECK_AGO_MS = 2 * 60 * 1000

/** Demo: image pull happened 2 minutes ago. */
const DEMO_PULL_1_AGO_MS = 2 * 60 * 1000
/** Demo: image pull happened 5 minutes ago. */
const DEMO_PULL_2_AGO_MS = 5 * 60 * 1000
/** Demo: image pull happened 8 minutes ago. */
const DEMO_PULL_3_AGO_MS = 8 * 60 * 1000
/** Demo: image pull happened 12 minutes ago. */
const DEMO_PULL_4_AGO_MS = 12 * 60 * 1000
/** Demo: image pull happened 18 minutes ago. */
const DEMO_PULL_5_AGO_MS = 18 * 60 * 1000

export const CRIO_DEMO_DATA: CrioStatusDemoData = {
  detected: true,
  totalNodes: 12,
  versions: {
    '1.30.0': 8,
    '1.29.2': 3,
    '1.28.5': 1,
  },
  health: 'healthy',
  runtimeMetrics: {
    runningContainers: 156,
    pausedContainers: 0,
    stoppedContainers: 12,
  },
  imagePulls: {
    total: 342,
    successful: 338,
    failed: 4,
  },
  podSandboxes: {
    ready: 145,
    notReady: 3,
    total: 148,
  },
  recentImagePulls: [
    {
      image: 'ghcr.io/kubestellar/console:latest',
      status: 'success',
      time: new Date(Date.now() - DEMO_PULL_1_AGO_MS).toISOString(),
      size: '245 MB',
    },
    {
      image: 'registry.k8s.io/kube-proxy:v1.30.0',
      status: 'success',
      time: new Date(Date.now() - DEMO_PULL_2_AGO_MS).toISOString(),
      size: '89 MB',
    },
    {
      image: 'docker.io/library/nginx:alpine',
      status: 'success',
      time: new Date(Date.now() - DEMO_PULL_3_AGO_MS).toISOString(),
      size: '41 MB',
    },
    {
      image: 'quay.io/prometheus/node-exporter:latest',
      status: 'failed',
      time: new Date(Date.now() - DEMO_PULL_4_AGO_MS).toISOString(),
    },
    {
      image: 'gcr.io/cadvisor/cadvisor:v0.47.0',
      status: 'success',
      time: new Date(Date.now() - DEMO_PULL_5_AGO_MS).toISOString(),
      size: '124 MB',
    },
  ],
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_AGO_MS).toISOString(),
}
