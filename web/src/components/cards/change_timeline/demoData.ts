/**
 * Demo data for the ChangeTimeline card.
 *
 * Generates realistic change events across multiple clusters spanning
 * the last 24 hours. Used when the dashboard is in demo mode or the
 * live timeline API is unavailable.
 */

// ---------------------------------------------------------------------------
// Time constants
// ---------------------------------------------------------------------------
const ONE_MINUTE_MS = 60_000
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS
const ONE_DAY_MS = 24 * ONE_HOUR_MS

// ---------------------------------------------------------------------------
// Demo clusters
// ---------------------------------------------------------------------------
const DEMO_CLUSTERS = [
  'us-east-prod',
  'eu-west-staging',
  'ap-south-dev',
  'us-west-prod',
] as const

// ---------------------------------------------------------------------------
// Event types matching the backend API
// ---------------------------------------------------------------------------
export type TimelineEventType =
  | 'Created'
  | 'Modified'
  | 'Deleted'
  | 'Scaled'
  | 'Restarted'
  | 'Failed'
  | 'Warning'

export interface TimelineEvent {
  id: string
  cluster: string
  namespace: string
  resource: string
  eventType: TimelineEventType
  timestamp: string
  message: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPES: TimelineEventType[] = [
  'Created',
  'Modified',
  'Deleted',
  'Scaled',
  'Restarted',
  'Failed',
  'Warning',
]

const DEMO_NAMESPACES = ['default', 'kube-system', 'monitoring', 'app']
const DEMO_RESOURCES = [
  'nginx-deployment',
  'api-gateway',
  'redis-cluster',
  'prometheus-server',
  'cert-manager',
  'ingress-controller',
  'worker-pool',
  'metrics-collector',
]

const DEMO_MESSAGES: Record<TimelineEventType, string[]> = {
  Created: ['Deployment created', 'Pod scheduled', 'Service created'],
  Modified: ['ConfigMap updated', 'Deployment spec changed', 'HPA target adjusted'],
  Deleted: ['Pod terminated', 'Old ReplicaSet cleaned up', 'Completed job removed'],
  Scaled: ['Replicas scaled from 2 to 4', 'HPA scaled up', 'Replicas scaled from 5 to 3'],
  Restarted: ['Container restarted due to liveness probe', 'OOMKilled — restarting', 'CrashLoopBackOff recovery'],
  Failed: ['ImagePullBackOff', 'Readiness probe failed', 'Insufficient CPU'],
  Warning: ['High memory usage detected', 'Certificate expiring soon', 'Disk pressure on node'],
}

/** Deterministic-ish seed for stable demo data across renders. */
function seededIndex(seed: number, max: number): number {
  return Math.abs(seed * 2654435761) % max
}

const DEMO_EVENT_COUNT = 48

/** Generate demo timeline events distributed over the last 24 hours. */
export function getDemoTimelineEvents(): TimelineEvent[] {
  const now = Date.now()
  const events: TimelineEvent[] = []

  for (let i = 0; i < DEMO_EVENT_COUNT; i++) {
    const offsetMs = (i / DEMO_EVENT_COUNT) * ONE_DAY_MS
    const cluster = DEMO_CLUSTERS[seededIndex(i, DEMO_CLUSTERS.length)]
    const eventType = EVENT_TYPES[seededIndex(i + 3, EVENT_TYPES.length)]
    const namespace = DEMO_NAMESPACES[seededIndex(i + 7, DEMO_NAMESPACES.length)]
    const resource = DEMO_RESOURCES[seededIndex(i + 13, DEMO_RESOURCES.length)]
    const messages = DEMO_MESSAGES[eventType]
    const message = messages[seededIndex(i + 17, messages.length)]

    events.push({
      id: `demo-event-${i}`,
      cluster,
      namespace,
      resource,
      eventType,
      timestamp: new Date(now - offsetMs).toISOString(),
      message,
    })
  }

  return events
}

export { ONE_HOUR_MS }
