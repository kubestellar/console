/**
 * Dapr Status Card — Demo Data & Type Definitions
 *
 * Models Dapr (Distributed Application Runtime, CNCF graduated) control
 * plane health, sidecar-injected application count, and configured
 * components (state stores, pub/sub brokers, bindings).
 *
 * This is scaffolding — a real Dapr integration (dashboard API or direct
 * control plane scrape) can be wired into `fetchDaprStatus` in a follow-up.
 * Until then, cards fall back to this demo data via `useCache`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DaprControlPlanePodStatus = 'running' | 'pending' | 'failed' | 'unknown'
export type DaprComponentType = 'state-store' | 'pubsub' | 'binding'
export type DaprHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'

export interface DaprControlPlanePod {
  /** Logical name of the control plane component. */
  name: 'operator' | 'placement' | 'sentry' | 'sidecarInjector'
  namespace: string
  status: DaprControlPlanePodStatus
  replicasDesired: number
  replicasReady: number
  cluster: string
}

export interface DaprComponent {
  name: string
  namespace: string
  type: DaprComponentType
  /** e.g. "state.redis", "pubsub.kafka", "bindings.kafka" */
  componentImpl: string
  cluster: string
}

export interface DaprAppSidecar {
  /** Count of Deployments/Pods that have the Dapr sidecar injected. */
  total: number
  /** Distinct namespaces running at least one Dapr-enabled app. */
  namespaces: number
}

export interface DaprBuildingBlockCounts {
  /** Number of state-store components configured. */
  stateStores: number
  /** Number of pub/sub components configured. */
  pubsubs: number
  /** Number of binding components configured. */
  bindings: number
}

export interface DaprSummary {
  totalControlPlanePods: number
  runningControlPlanePods: number
  totalComponents: number
  totalDaprApps: number
}

export interface DaprStatusData {
  health: DaprHealth
  controlPlane: DaprControlPlanePod[]
  components: DaprComponent[]
  apps: DaprAppSidecar
  buildingBlocks: DaprBuildingBlockCounts
  summary: DaprSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_REPLICAS_SINGLE = 1
const DEMO_REPLICAS_HA = 3
const DEMO_PLACEMENT_REPLICAS = 3
const DEMO_APP_SIDECAR_TOTAL = 42
const DEMO_APP_SIDECAR_NAMESPACES = 7

const DEMO_NAMESPACE_SYSTEM = 'dapr-system'
const DEMO_NAMESPACE_ORDERS = 'orders'
const DEMO_NAMESPACE_CHECKOUT = 'checkout'
const DEMO_NAMESPACE_INVENTORY = 'inventory'

// ---------------------------------------------------------------------------
// Demo data — shown when Dapr is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_CONTROL_PLANE: DaprControlPlanePod[] = [
  {
    name: 'operator',
    namespace: DEMO_NAMESPACE_SYSTEM,
    status: 'running',
    replicasDesired: DEMO_REPLICAS_SINGLE,
    replicasReady: DEMO_REPLICAS_SINGLE,
    cluster: 'default',
  },
  {
    name: 'placement',
    namespace: DEMO_NAMESPACE_SYSTEM,
    status: 'running',
    replicasDesired: DEMO_PLACEMENT_REPLICAS,
    replicasReady: DEMO_PLACEMENT_REPLICAS,
    cluster: 'default',
  },
  {
    name: 'sentry',
    namespace: DEMO_NAMESPACE_SYSTEM,
    status: 'running',
    replicasDesired: DEMO_REPLICAS_SINGLE,
    replicasReady: DEMO_REPLICAS_SINGLE,
    cluster: 'default',
  },
  {
    name: 'sidecarInjector',
    namespace: DEMO_NAMESPACE_SYSTEM,
    status: 'pending',
    replicasDesired: DEMO_REPLICAS_HA,
    replicasReady: 2,
    cluster: 'default',
  },
]

const DEMO_COMPONENTS: DaprComponent[] = [
  {
    name: 'orders-statestore',
    namespace: DEMO_NAMESPACE_ORDERS,
    type: 'state-store',
    componentImpl: 'state.redis',
    cluster: 'default',
  },
  {
    name: 'checkout-statestore',
    namespace: DEMO_NAMESPACE_CHECKOUT,
    type: 'state-store',
    componentImpl: 'state.postgresql',
    cluster: 'default',
  },
  {
    name: 'orders-pubsub',
    namespace: DEMO_NAMESPACE_ORDERS,
    type: 'pubsub',
    componentImpl: 'pubsub.kafka',
    cluster: 'default',
  },
  {
    name: 'checkout-pubsub',
    namespace: DEMO_NAMESPACE_CHECKOUT,
    type: 'pubsub',
    componentImpl: 'pubsub.rabbitmq',
    cluster: 'default',
  },
  {
    name: 'inventory-binding-kafka',
    namespace: DEMO_NAMESPACE_INVENTORY,
    type: 'binding',
    componentImpl: 'bindings.kafka',
    cluster: 'default',
  },
  {
    name: 'inventory-binding-cron',
    namespace: DEMO_NAMESPACE_INVENTORY,
    type: 'binding',
    componentImpl: 'bindings.cron',
    cluster: 'default',
  },
]

function countByType(components: DaprComponent[], type: DaprComponentType): number {
  return components.filter(c => c.type === type).length
}

function buildSummary(
  controlPlane: DaprControlPlanePod[],
  components: DaprComponent[],
  apps: DaprAppSidecar,
): DaprSummary {
  return {
    totalControlPlanePods: controlPlane.length,
    runningControlPlanePods: controlPlane.filter(p => p.status === 'running').length,
    totalComponents: components.length,
    totalDaprApps: apps.total,
  }
}

export const DAPR_DEMO_DATA: DaprStatusData = {
  health: 'degraded',
  controlPlane: DEMO_CONTROL_PLANE,
  components: DEMO_COMPONENTS,
  apps: {
    total: DEMO_APP_SIDECAR_TOTAL,
    namespaces: DEMO_APP_SIDECAR_NAMESPACES,
  },
  buildingBlocks: {
    stateStores: countByType(DEMO_COMPONENTS, 'state-store'),
    pubsubs: countByType(DEMO_COMPONENTS, 'pubsub'),
    bindings: countByType(DEMO_COMPONENTS, 'binding'),
  },
  summary: buildSummary(
    DEMO_CONTROL_PLANE,
    DEMO_COMPONENTS,
    { total: DEMO_APP_SIDECAR_TOTAL, namespaces: DEMO_APP_SIDECAR_NAMESPACES },
  ),
  lastCheckTime: new Date().toISOString(),
}
