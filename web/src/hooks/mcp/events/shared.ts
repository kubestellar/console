import type { ClusterEvent } from '../types'
import { registerCacheReset } from '../../../lib/modeTransition'

// ---------------------------------------------------------------------------
// Shared Events State - enables cache reset notifications to all consumers
// ---------------------------------------------------------------------------

export interface EventsSharedState {
  cacheVersion: number
  isResetting: boolean
}

export let eventsSharedState: EventsSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

type EventsSubscriber = (state: EventsSharedState) => void
const eventsSubscribers = new Set<EventsSubscriber>()

function notifyEventsSubscribers() {
  Array.from(eventsSubscribers).forEach(subscriber => subscriber(eventsSharedState))
}

export function subscribeEventsCache(callback: EventsSubscriber): () => void {
  eventsSubscribers.add(callback)
  return () => eventsSubscribers.delete(callback)
}

// ---------------------------------------------------------------------------
// Demo Data
// ---------------------------------------------------------------------------

export function getDemoEvents(): ClusterEvent[] {
  const now = new Date()
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString()

  return [
    {
      type: 'Warning',
      reason: 'FailedScheduling',
      message: 'No nodes available to schedule pod',
      object: 'Pod/worker-5c6d7e8f9-n3p2q',
      namespace: 'batch',
      cluster: 'vllm-gpu-cluster',
      count: 3,
      firstSeen: minutesAgo(25),
      lastSeen: minutesAgo(5),
    },
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned pod to node-2',
      object: 'Pod/api-server-7d8f9c6b5-abc12',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      count: 1,
      firstSeen: minutesAgo(12),
      lastSeen: minutesAgo(12),
    },
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container',
      object: 'Pod/api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      count: 15,
      firstSeen: minutesAgo(45),
      lastSeen: minutesAgo(2),
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image pulled successfully',
      object: 'Pod/frontend-8e9f0a1b2-def34',
      namespace: 'web',
      cluster: 'gke-staging',
      count: 1,
      firstSeen: minutesAgo(8),
      lastSeen: minutesAgo(8),
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: connection refused',
      object: 'Pod/cache-redis-0',
      namespace: 'data',
      cluster: 'gke-staging',
      count: 8,
      firstSeen: minutesAgo(30),
      lastSeen: minutesAgo(1),
    },
    {
      type: 'Normal',
      reason: 'ScalingReplicaSet',
      message: 'Scaled up replica set api-gateway-7d8c to 3',
      object: 'Deployment/api-gateway',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      count: 1,
      firstSeen: minutesAgo(18),
      lastSeen: minutesAgo(18),
    },
    {
      type: 'Normal',
      reason: 'SuccessfulCreate',
      message: 'Created pod: worker-5c6d7e8f9-abc12',
      object: 'ReplicaSet/worker-5c6d7e8f9',
      namespace: 'batch',
      cluster: 'vllm-gpu-cluster',
      count: 1,
      firstSeen: minutesAgo(22),
      lastSeen: minutesAgo(22),
    },
    {
      type: 'Warning',
      reason: 'FailedMount',
      message: 'MountVolume.SetUp failed for volume "config": configmap "app-config" not found',
      object: 'Pod/ml-inference-7f8g9h-xyz99',
      namespace: 'ml',
      cluster: 'vllm-gpu-cluster',
      count: 4,
      firstSeen: minutesAgo(35),
      lastSeen: minutesAgo(3),
    },
  ]
}

// ---------------------------------------------------------------------------
// Module-level caches
// ---------------------------------------------------------------------------

export interface EventsCache {
  data: ClusterEvent[]
  timestamp: Date
  key: string
}

export let eventsCache: EventsCache | null = null
export let warningEventsCache: EventsCache | null = null

// ---------------------------------------------------------------------------
// Register with mode transition coordinator for unified cache clearing
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  registerCacheReset('events', () => {
    eventsSharedState = {
      cacheVersion: eventsSharedState.cacheVersion + 1,
      isResetting: true,
    }
    notifyEventsSubscribers()

    eventsCache = null
    warningEventsCache = null

    setTimeout(() => {
      eventsSharedState = { ...eventsSharedState, isResetting: false }
      notifyEventsSubscribers()
    }, 0)
  })
}
