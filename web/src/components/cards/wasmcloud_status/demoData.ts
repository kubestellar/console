/**
 * wasmCloud Status Card — Demo Data & Type Definitions
 *
 * wasmCloud is a CNCF incubating project for building distributed
 * applications on WebAssembly. A wasmCloud lattice is a self-forming
 * mesh of hosts that run portable Wasm actors (business logic) linked
 * at runtime to capability providers (HTTP server, NATS, Redis, Postgres,
 * etc.) via declarative link definitions.
 *
 * This card surfaces:
 *  - Lattice id + control-plane health
 *  - Host count with per-host labels and uptime
 *  - Actor count (Wasm components) with instance counts per host
 *  - Capability provider count (httpserver, nats, redis, postgres, ...)
 *  - Active link definitions (actor -> provider bindings)
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real wasmCloud control-interface bridge lands (`/api/wasmcloud/status`),
 * the hook's fetcher will pick up live data automatically with no
 * component changes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WasmcloudHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type WasmcloudHostStatus = 'ready' | 'starting' | 'unreachable'
export type WasmcloudProviderStatus = 'running' | 'starting' | 'failed'
export type WasmcloudLinkStatus = 'active' | 'pending' | 'failed'

export interface WasmcloudHost {
  hostId: string
  friendlyName: string
  status: WasmcloudHostStatus
  labels: Record<string, string>
  uptimeSeconds: number
  actorCount: number
  providerCount: number
  cluster: string
}

export interface WasmcloudActor {
  actorId: string
  name: string
  imageRef: string
  instanceCount: number
  hostId: string
  cluster: string
}

export interface WasmcloudProvider {
  providerId: string
  name: string
  contractId: string
  linkName: string
  imageRef: string
  status: WasmcloudProviderStatus
  hostId: string
  cluster: string
}

export interface WasmcloudLink {
  actorId: string
  providerId: string
  contractId: string
  linkName: string
  status: WasmcloudLinkStatus
}

export interface WasmcloudStats {
  hostCount: number
  actorCount: number
  providerCount: number
  linkCount: number
  latticeVersion: string
}

export interface WasmcloudSummary {
  latticeId: string
  totalHosts: number
  totalActors: number
  totalProviders: number
  totalLinks: number
}

export interface WasmcloudStatusData {
  health: WasmcloudHealth
  hosts: WasmcloudHost[]
  actors: WasmcloudActor[]
  providers: WasmcloudProvider[]
  links: WasmcloudLink[]
  stats: WasmcloudStats
  summary: WasmcloudSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_LATTICE_ID = 'default'
const DEMO_LATTICE_VERSION = '1.4.0'

// Host uptimes (seconds)
const HOST_UPTIME_LONG_SEC = 345_600 // ~4 days
const HOST_UPTIME_MEDIUM_SEC = 129_600 // ~1.5 days
const HOST_UPTIME_SHORT_SEC = 7_200 // 2 hours

// Actor instance counts
const ACTOR_INSTANCES_HIGH = 6
const ACTOR_INSTANCES_MED = 3
const ACTOR_INSTANCES_LOW = 1

// ---------------------------------------------------------------------------
// Demo data — shown when wasmCloud is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_HOSTS: WasmcloudHost[] = [
  {
    hostId: 'NBXYZ1ABC234DEF567GH1',
    friendlyName: 'breezy-sunset',
    status: 'ready',
    labels: { region: 'us-east-1', zone: 'a', 'node.role': 'worker' },
    uptimeSeconds: HOST_UPTIME_LONG_SEC,
    actorCount: 4,
    providerCount: 2,
    cluster: 'prod-east',
  },
  {
    hostId: 'NBXYZ2ABC234DEF567GH2',
    friendlyName: 'silent-waterfall',
    status: 'ready',
    labels: { region: 'us-east-1', zone: 'b', 'node.role': 'worker' },
    uptimeSeconds: HOST_UPTIME_MEDIUM_SEC,
    actorCount: 3,
    providerCount: 1,
    cluster: 'prod-east',
  },
  {
    hostId: 'NBXYZ3ABC234DEF567GH3',
    friendlyName: 'crimson-meadow',
    status: 'starting',
    labels: { region: 'us-west-2', zone: 'a', 'node.role': 'edge' },
    uptimeSeconds: HOST_UPTIME_SHORT_SEC,
    actorCount: 1,
    providerCount: 1,
    cluster: 'prod-west',
  },
]

const DEMO_ACTORS: WasmcloudActor[] = [
  {
    actorId: 'MBABC1XYZ234DEF567GH1',
    name: 'http-echo',
    imageRef: 'wasmcloud.azurecr.io/echo:0.3.8',
    instanceCount: ACTOR_INSTANCES_HIGH,
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC2XYZ234DEF567GH2',
    name: 'kv-counter',
    imageRef: 'wasmcloud.azurecr.io/kvcounter:0.4.2',
    instanceCount: ACTOR_INSTANCES_MED,
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC3XYZ234DEF567GH3',
    name: 'image-processor',
    imageRef: 'wasmcloud.azurecr.io/image-processor:0.2.1',
    instanceCount: ACTOR_INSTANCES_MED,
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC4XYZ234DEF567GH4',
    name: 'order-api',
    imageRef: 'ghcr.io/acme/order-api:0.9.0',
    instanceCount: ACTOR_INSTANCES_MED,
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC5XYZ234DEF567GH5',
    name: 'notifier',
    imageRef: 'ghcr.io/acme/notifier:0.5.3',
    instanceCount: ACTOR_INSTANCES_LOW,
    hostId: 'NBXYZ2ABC234DEF567GH2',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC6XYZ234DEF567GH6',
    name: 'session-cache',
    imageRef: 'ghcr.io/acme/session-cache:0.2.0',
    instanceCount: ACTOR_INSTANCES_MED,
    hostId: 'NBXYZ2ABC234DEF567GH2',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC7XYZ234DEF567GH7',
    name: 'billing',
    imageRef: 'ghcr.io/acme/billing:0.4.1',
    instanceCount: ACTOR_INSTANCES_LOW,
    hostId: 'NBXYZ2ABC234DEF567GH2',
    cluster: 'prod-east',
  },
  {
    actorId: 'MBABC8XYZ234DEF567GH8',
    name: 'edge-router',
    imageRef: 'ghcr.io/acme/edge-router:0.1.0',
    instanceCount: ACTOR_INSTANCES_LOW,
    hostId: 'NBXYZ3ABC234DEF567GH3',
    cluster: 'prod-west',
  },
]

const DEMO_PROVIDERS: WasmcloudProvider[] = [
  {
    providerId: 'VBHTTPSERVER1XYZ234DEF5',
    name: 'httpserver',
    contractId: 'wasmcloud:httpserver',
    linkName: 'default',
    imageRef: 'wasmcloud.azurecr.io/httpserver:0.22.0',
    status: 'running',
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    providerId: 'VBNATS2XYZ234DEF567GH2',
    name: 'nats-messaging',
    contractId: 'wasmcloud:messaging',
    linkName: 'default',
    imageRef: 'wasmcloud.azurecr.io/nats_messaging:0.19.1',
    status: 'running',
    hostId: 'NBXYZ1ABC234DEF567GH1',
    cluster: 'prod-east',
  },
  {
    providerId: 'VBREDIS3XYZ234DEF567GH3',
    name: 'redis-keyvalue',
    contractId: 'wasmcloud:keyvalue',
    linkName: 'default',
    imageRef: 'wasmcloud.azurecr.io/kv_redis:0.23.2',
    status: 'running',
    hostId: 'NBXYZ2ABC234DEF567GH2',
    cluster: 'prod-east',
  },
  {
    providerId: 'VBPOSTGRES4XYZ234DEF5GH',
    name: 'postgres-sqldb',
    contractId: 'wasmcloud:sqldb',
    linkName: 'default',
    imageRef: 'wasmcloud.azurecr.io/sqldb_postgres:0.7.1',
    status: 'starting',
    hostId: 'NBXYZ3ABC234DEF567GH3',
    cluster: 'prod-west',
  },
]

const DEMO_LINKS: WasmcloudLink[] = [
  { actorId: 'MBABC1XYZ234DEF567GH1', providerId: 'VBHTTPSERVER1XYZ234DEF5', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' },
  { actorId: 'MBABC2XYZ234DEF567GH2', providerId: 'VBHTTPSERVER1XYZ234DEF5', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' },
  { actorId: 'MBABC2XYZ234DEF567GH2', providerId: 'VBREDIS3XYZ234DEF567GH3', contractId: 'wasmcloud:keyvalue', linkName: 'default', status: 'active' },
  { actorId: 'MBABC3XYZ234DEF567GH3', providerId: 'VBNATS2XYZ234DEF567GH2', contractId: 'wasmcloud:messaging', linkName: 'default', status: 'active' },
  { actorId: 'MBABC3XYZ234DEF567GH3', providerId: 'VBHTTPSERVER1XYZ234DEF5', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' },
  { actorId: 'MBABC4XYZ234DEF567GH4', providerId: 'VBHTTPSERVER1XYZ234DEF5', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' },
  { actorId: 'MBABC4XYZ234DEF567GH4', providerId: 'VBPOSTGRES4XYZ234DEF5GH', contractId: 'wasmcloud:sqldb', linkName: 'default', status: 'pending' },
  { actorId: 'MBABC5XYZ234DEF567GH5', providerId: 'VBNATS2XYZ234DEF567GH2', contractId: 'wasmcloud:messaging', linkName: 'default', status: 'active' },
  { actorId: 'MBABC6XYZ234DEF567GH6', providerId: 'VBREDIS3XYZ234DEF567GH3', contractId: 'wasmcloud:keyvalue', linkName: 'default', status: 'active' },
  { actorId: 'MBABC7XYZ234DEF567GH7', providerId: 'VBPOSTGRES4XYZ234DEF5GH', contractId: 'wasmcloud:sqldb', linkName: 'default', status: 'pending' },
  { actorId: 'MBABC7XYZ234DEF567GH7', providerId: 'VBNATS2XYZ234DEF567GH2', contractId: 'wasmcloud:messaging', linkName: 'default', status: 'active' },
  { actorId: 'MBABC8XYZ234DEF567GH8', providerId: 'VBHTTPSERVER1XYZ234DEF5', contractId: 'wasmcloud:httpserver', linkName: 'default', status: 'active' },
]

export const WASMCLOUD_DEMO_DATA: WasmcloudStatusData = {
  health: 'healthy',
  hosts: DEMO_HOSTS,
  actors: DEMO_ACTORS,
  providers: DEMO_PROVIDERS,
  links: DEMO_LINKS,
  stats: {
    hostCount: DEMO_HOSTS.length,
    actorCount: DEMO_ACTORS.length,
    providerCount: DEMO_PROVIDERS.length,
    linkCount: DEMO_LINKS.length,
    latticeVersion: DEMO_LATTICE_VERSION,
  },
  summary: {
    latticeId: DEMO_LATTICE_ID,
    totalHosts: DEMO_HOSTS.length,
    totalActors: DEMO_ACTORS.length,
    totalProviders: DEMO_PROVIDERS.length,
    totalLinks: DEMO_LINKS.length,
  },
  lastCheckTime: new Date().toISOString(),
}
