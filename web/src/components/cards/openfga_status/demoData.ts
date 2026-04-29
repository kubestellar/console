/**
 * OpenFGA Status Card — Demo Data & Type Definitions
 *
 * OpenFGA is a CNCF Sandbox fine-grained authorization system inspired by
 * Google's Zanzibar paper. It centralizes authorization decisions around
 * relationship tuples (user → relation → object) evaluated against a type-based
 * authorization model. Applications issue Check, Expand, and ListObjects calls
 * to an OpenFGA server; the server resolves them against stored tuples.
 *
 * This card surfaces:
 *  - Store health and reachable endpoint
 *  - Number of configured stores and active authorization models
 *  - Relationship-tuple count across stores
 *  - Per-API throughput (Check / Expand / ListObjects rps)
 *  - Latency percentiles (p50 / p95 / p99)
 *  - Recent authorization models with type counts
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real OpenFGA server bridge lands (`/api/openfga/status`), the hook's
 * fetcher will pick up live data automatically with no component changes.
 */

import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenfgaHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type OpenfgaStoreStatus = 'active' | 'paused' | 'draining'

export interface OpenfgaStore {
  id: string
  name: string
  tupleCount: number
  modelCount: number
  status: OpenfgaStoreStatus
  lastWriteTime: string
}

export interface OpenfgaAuthorizationModel {
  id: string
  storeName: string
  schemaVersion: string
  typeCount: number
  createdAt: string
}

export interface OpenfgaApiRps {
  check: number
  expand: number
  listObjects: number
}

export interface OpenfgaLatencyMs {
  p50: number
  p95: number
  p99: number
}

export interface OpenfgaStats {
  totalTuples: number
  totalStores: number
  totalModels: number
  serverVersion: string
  rps: OpenfgaApiRps
  latency: OpenfgaLatencyMs
}

export interface OpenfgaSummary {
  endpoint: string
  totalTuples: number
  totalStores: number
  totalModels: number
}

export interface OpenfgaStatusData {
  health: OpenfgaHealth
  stores: OpenfgaStore[]
  models: OpenfgaAuthorizationModel[]
  stats: OpenfgaStats
  summary: OpenfgaSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_ENDPOINT = 'openfga.prod.example.org:8080'
const DEMO_SERVER_VERSION = '1.8.3'

// Aggregate tuple count across demo stores = 25k (issue-specified).
const DEMO_TOTAL_TUPLES = 25_000

// Per-store tuple counts (sum to DEMO_TOTAL_TUPLES).
const DEMO_STORE_TUPLES_MAIN = 17_500
const DEMO_STORE_TUPLES_INTERNAL = 5_200
const DEMO_STORE_TUPLES_SANDBOX = 2_300

// Per-store model counts (sum to 6 — issue-specified).
const DEMO_STORE_MODELS_MAIN = 3
const DEMO_STORE_MODELS_INTERNAL = 2
const DEMO_STORE_MODELS_SANDBOX = 1
const DEMO_TOTAL_MODELS =
  DEMO_STORE_MODELS_MAIN + DEMO_STORE_MODELS_INTERNAL + DEMO_STORE_MODELS_SANDBOX

// API throughput (requests per second).
const DEMO_RPS_CHECK = 1_450
const DEMO_RPS_EXPAND = 82
const DEMO_RPS_LIST_OBJECTS = 214

// Latency percentiles in milliseconds.
const DEMO_LATENCY_P50_MS = 4
const DEMO_LATENCY_P95_MS = 18
const DEMO_LATENCY_P99_MS = 42

// Per-model type counts.
const DEMO_MODEL_TYPES_DOCS = 6
const DEMO_MODEL_TYPES_DOCS_V2 = 7
const DEMO_MODEL_TYPES_RBAC = 4
const DEMO_MODEL_TYPES_INTERNAL = 5
const DEMO_MODEL_TYPES_PARTNER = 3
const DEMO_MODEL_TYPES_SANDBOX = 2

const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR
const SIX_HOURS_MS = 6 * MS_PER_HOUR
const THREE_DAYS_MS = 3 * MS_PER_DAY
const ONE_WEEK_MS = 7 * MS_PER_DAY
const TWO_WEEKS_MS = 14 * MS_PER_DAY

// ---------------------------------------------------------------------------
// Demo data — shown when OpenFGA is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_STORES: OpenfgaStore[] = [
  {
    id: '01HZXR9V0000000000000MAIN',
    name: 'main',
    tupleCount: DEMO_STORE_TUPLES_MAIN,
    modelCount: DEMO_STORE_MODELS_MAIN,
    status: 'active',
    lastWriteTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
  },
  {
    id: '01HZXR9V0000000000INTERNAL',
    name: 'internal-tools',
    tupleCount: DEMO_STORE_TUPLES_INTERNAL,
    modelCount: DEMO_STORE_MODELS_INTERNAL,
    status: 'active',
    lastWriteTime: new Date(Date.now() - THIRTY_MINUTES_MS).toISOString(),
  },
  {
    id: '01HZXR9V000000000000SANDBOX',
    name: 'sandbox',
    tupleCount: DEMO_STORE_TUPLES_SANDBOX,
    modelCount: DEMO_STORE_MODELS_SANDBOX,
    status: 'paused',
    lastWriteTime: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
  },
]

const DEMO_MODELS: OpenfgaAuthorizationModel[] = [
  {
    id: '01HZXS0A0000000000DOCSV2',
    storeName: 'main',
    schemaVersion: '1.1',
    typeCount: DEMO_MODEL_TYPES_DOCS_V2,
    createdAt: new Date(Date.now() - SIX_HOURS_MS).toISOString(),
  },
  {
    id: '01HZXS0A0000000000DOCSV1',
    storeName: 'main',
    schemaVersion: '1.1',
    typeCount: DEMO_MODEL_TYPES_DOCS,
    createdAt: new Date(Date.now() - THREE_DAYS_MS).toISOString(),
  },
  {
    id: '01HZXS0A0000000000RBAC01',
    storeName: 'main',
    schemaVersion: '1.1',
    typeCount: DEMO_MODEL_TYPES_RBAC,
    createdAt: new Date(Date.now() - ONE_WEEK_MS).toISOString(),
  },
  {
    id: '01HZXS0A00000000INTERNAL1',
    storeName: 'internal-tools',
    schemaVersion: '1.1',
    typeCount: DEMO_MODEL_TYPES_INTERNAL,
    createdAt: new Date(Date.now() - MS_PER_DAY).toISOString(),
  },
  {
    id: '01HZXS0A00000000INTERNAL0',
    storeName: 'internal-tools',
    schemaVersion: '1.0',
    typeCount: DEMO_MODEL_TYPES_PARTNER,
    createdAt: new Date(Date.now() - TWO_WEEKS_MS).toISOString(),
  },
  {
    id: '01HZXS0A000000000SANDBOX1',
    storeName: 'sandbox',
    schemaVersion: '1.1',
    typeCount: DEMO_MODEL_TYPES_SANDBOX,
    createdAt: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
  },
]

export const OPENFGA_DEMO_DATA: OpenfgaStatusData = {
  health: 'healthy',
  stores: DEMO_STORES,
  models: DEMO_MODELS,
  stats: {
    totalTuples: DEMO_TOTAL_TUPLES,
    totalStores: DEMO_STORES.length,
    totalModels: DEMO_TOTAL_MODELS,
    serverVersion: DEMO_SERVER_VERSION,
    rps: {
      check: DEMO_RPS_CHECK,
      expand: DEMO_RPS_EXPAND,
      listObjects: DEMO_RPS_LIST_OBJECTS,
    },
    latency: {
      p50: DEMO_LATENCY_P50_MS,
      p95: DEMO_LATENCY_P95_MS,
      p99: DEMO_LATENCY_P99_MS,
    },
  },
  summary: {
    endpoint: DEMO_ENDPOINT,
    totalTuples: DEMO_TOTAL_TUPLES,
    totalStores: DEMO_STORES.length,
    totalModels: DEMO_TOTAL_MODELS,
  },
  lastCheckTime: new Date().toISOString(),
}
