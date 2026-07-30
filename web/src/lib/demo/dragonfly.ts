import { BYTES_PER_GIB } from '../constants/units'

/**
 * Dragonfly Status Card — Demo Data & Type Definitions
 *
 * Models telemetry for Dragonfly (CNCF graduated) — a P2P image and file
 * distribution system for container registries. A typical Dragonfly
 * deployment has three control-plane components and one per-node agent:
 *
 *   - manager:   cluster-wide configuration, scheduling, seed-peer, and
 *                preheat coordination.
 *   - scheduler: assigns peers and builds the P2P task graph.
 *   - seed-peer: well-known peers that prefetch upstream blobs and
 *                accelerate first-hit downloads.
 *   - dfdaemon:  per-node agent that speaks to the container runtime and
 *                serves P2P traffic between nodes.
 *
 * Demo data is used when Dragonfly is not installed or when the user is
 * in demo mode (see CLAUDE.md — isDemoFallback rules).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DragonflyHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

export type DragonflyComponent = 'manager' | 'scheduler' | 'seed-peer' | 'dfdaemon'

/** Summary counts used for the stat tiles at the top of the card. */
export interface DragonflySummary {
  /** Manager replicas reporting Ready. */
  managerReplicas: number
  /** Scheduler replicas reporting Ready. */
  schedulerReplicas: number
  /** Total seed-peer pods (across seed-peer sets / clusters). */
  seedPeers: number
  /** Number of dfdaemon Pods in a Ready state. */
  dfdaemonNodesUp: number
  /** Total dfdaemon Pods observed (Ready + NotReady). */
  dfdaemonNodesTotal: number
  /** Currently running P2P download/preheat tasks. */
  activeTasks: number
  /** Peer-cache hit rate as a percentage (0–100). */
  cacheHitPercent: number
  /** Total bytes served by the P2P network in the current window. */
  p2pBytesServed: number
  /** Total bytes pulled from the upstream registry in the current window. */
  upstreamBytes: number
}

/** Per-component row shown in the component list. */
export interface DragonflyComponentRow {
  component: DragonflyComponent
  name: string
  namespace: string
  cluster: string
  /** Pods reporting Ready. */
  ready: number
  /** Total Pods observed. */
  desired: number
  version: string
}

export interface DragonflyStatusData {
  health: DragonflyHealth
  summary: DragonflySummary
  components: DragonflyComponentRow[]
  clusterName: string
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Named constants (no magic numbers) — demo values only
// ---------------------------------------------------------------------------

const DEMO_MANAGER_REPLICAS = 3
const DEMO_SCHEDULER_REPLICAS = 3
const DEMO_SEED_PEERS = 4
const DEMO_DFDAEMON_UP = 11
const DEMO_DFDAEMON_TOTAL = 12
const DEMO_ACTIVE_TASKS = 27
const DEMO_CACHE_HIT_PERCENT = 86
const DEMO_P2P_BYTES_GIB = 412
const DEMO_UPSTREAM_BYTES_GIB = 58

const DEMO_COMPONENTS: DragonflyComponentRow[] = [
  {
    component: 'manager',
    name: 'dragonfly-manager',
    namespace: 'dragonfly-system',
    cluster: 'prod-west',
    ready: DEMO_MANAGER_REPLICAS,
    desired: DEMO_MANAGER_REPLICAS,
    version: '2.1.48',
  },
  {
    component: 'scheduler',
    name: 'dragonfly-scheduler',
    namespace: 'dragonfly-system',
    cluster: 'prod-west',
    ready: DEMO_SCHEDULER_REPLICAS,
    desired: DEMO_SCHEDULER_REPLICAS,
    version: '2.1.48',
  },
  {
    component: 'seed-peer',
    name: 'dragonfly-seed-peer',
    namespace: 'dragonfly-system',
    cluster: 'prod-west',
    ready: DEMO_SEED_PEERS,
    desired: DEMO_SEED_PEERS,
    version: '2.1.48',
  },
  {
    component: 'dfdaemon',
    name: 'dragonfly-dfdaemon',
    namespace: 'dragonfly-system',
    cluster: 'prod-west',
    ready: DEMO_DFDAEMON_UP,
    desired: DEMO_DFDAEMON_TOTAL,
    version: '2.1.48',
  },
]

export const DRAGONFLY_DEMO_DATA: DragonflyStatusData = {
  // One dfdaemon Pod is NotReady, so the overall health is degraded.
  health: 'degraded',
  clusterName: 'dragonfly',
  lastCheckTime: new Date().toISOString(),
  summary: {
    managerReplicas: DEMO_MANAGER_REPLICAS,
    schedulerReplicas: DEMO_SCHEDULER_REPLICAS,
    seedPeers: DEMO_SEED_PEERS,
    dfdaemonNodesUp: DEMO_DFDAEMON_UP,
    dfdaemonNodesTotal: DEMO_DFDAEMON_TOTAL,
    activeTasks: DEMO_ACTIVE_TASKS,
    cacheHitPercent: DEMO_CACHE_HIT_PERCENT,
    p2pBytesServed: DEMO_P2P_BYTES_GIB * BYTES_PER_GIB,
    upstreamBytes: DEMO_UPSTREAM_BYTES_GIB * BYTES_PER_GIB,
  },
  components: DEMO_COMPONENTS,
}
