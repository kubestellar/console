/**
 * SPIFFE Status Card — Demo Data & Type Definitions
 *
 * SPIFFE (Secure Production Identity Framework For Everyone) is a CNCF
 * graduated project that defines a standard for cryptographically
 * identifying workloads across heterogeneous environments. SPIRE is the
 * reference runtime that issues SPIFFE Verifiable Identity Documents
 * (SVIDs) — either x509 certificates or JWT tokens.
 *
 * This card surfaces:
 *  - Trust domain (the root of trust — typically a DNS-style name)
 *  - Number of active SVIDs issued (x509 and JWT)
 *  - Federated trust domains (cross-domain relationships for multi-cluster)
 *  - Per-workload registration entries (SPIFFE ID → selector bindings)
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real SPIRE server bridge lands (`/api/spiffe/status`), the hook's
 * fetcher will pick up live data automatically with no component changes.
 */

import { MS_PER_MINUTE, MS_PER_HOUR, MS_PER_DAY, SECONDS_PER_HOUR, SECONDS_PER_DAY } from '../../../lib/constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpiffeHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type SvidType = 'x509' | 'jwt'
export type FederationStatus = 'active' | 'pending' | 'failed'

export interface SpiffeRegistrationEntry {
  spiffeId: string
  parentId: string
  selector: string
  svidType: SvidType
  ttlSeconds: number
  cluster: string
}

export interface SpiffeFederatedDomain {
  trustDomain: string
  bundleEndpoint: string
  status: FederationStatus
  lastRefresh: string
}

export interface SpiffeStats {
  x509SvidCount: number
  jwtSvidCount: number
  registrationEntryCount: number
  agentCount: number
  serverVersion: string
}

export interface SpiffeSummary {
  trustDomain: string
  totalSvids: number
  totalFederatedDomains: number
  totalEntries: number
}

export interface SpiffeStatusData {
  health: SpiffeHealth
  entries: SpiffeRegistrationEntry[]
  federatedDomains: SpiffeFederatedDomain[]
  stats: SpiffeStats
  summary: SpiffeSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_TRUST_DOMAIN = 'prod.example.org'
const DEMO_X509_SVID_COUNT = 48
const DEMO_JWT_SVID_COUNT = 17
const DEMO_AGENT_COUNT = 6
const DEMO_SERVER_VERSION = '1.9.4'

// Per-entry TTLs
const TTL_ONE_HOUR_SECONDS = SECONDS_PER_HOUR
const TTL_FOUR_HOURS_SECONDS = 4 * SECONDS_PER_HOUR
const TTL_TWELVE_HOURS_SECONDS = 12 * SECONDS_PER_HOUR
const TTL_ONE_DAY_SECONDS = SECONDS_PER_DAY

const TEN_MINUTES_MS = 10 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR

// ---------------------------------------------------------------------------
// Demo data — shown when SPIFFE/SPIRE is not installed or in demo mode
// ---------------------------------------------------------------------------

const DEMO_ENTRIES: SpiffeRegistrationEntry[] = [
  {
    spiffeId: 'spiffe://prod.example.org/ns/frontend/sa/web',
    parentId: 'spiffe://prod.example.org/spire/agent/k8s_psat/prod/node-1',
    selector: 'k8s:ns:frontend,k8s:sa:web',
    svidType: 'x509',
    ttlSeconds: TTL_ONE_HOUR_SECONDS,
    cluster: 'prod-east',
  },
  {
    spiffeId: 'spiffe://prod.example.org/ns/api/sa/api-gateway',
    parentId: 'spiffe://prod.example.org/spire/agent/k8s_psat/prod/node-2',
    selector: 'k8s:ns:api,k8s:sa:api-gateway',
    svidType: 'x509',
    ttlSeconds: TTL_ONE_HOUR_SECONDS,
    cluster: 'prod-east',
  },
  {
    spiffeId: 'spiffe://prod.example.org/ns/auth/sa/oidc',
    parentId: 'spiffe://prod.example.org/spire/agent/k8s_psat/prod/node-1',
    selector: 'k8s:ns:auth,k8s:sa:oidc',
    svidType: 'jwt',
    ttlSeconds: TTL_FOUR_HOURS_SECONDS,
    cluster: 'prod-east',
  },
  {
    spiffeId: 'spiffe://prod.example.org/ns/payments/sa/billing',
    parentId: 'spiffe://prod.example.org/spire/agent/k8s_psat/prod/node-3',
    selector: 'k8s:ns:payments,k8s:sa:billing',
    svidType: 'x509',
    ttlSeconds: TTL_TWELVE_HOURS_SECONDS,
    cluster: 'prod-west',
  },
  {
    spiffeId: 'spiffe://prod.example.org/ns/data/sa/etl',
    parentId: 'spiffe://prod.example.org/spire/agent/k8s_psat/prod/node-4',
    selector: 'k8s:ns:data,k8s:sa:etl',
    svidType: 'jwt',
    ttlSeconds: TTL_ONE_DAY_SECONDS,
    cluster: 'prod-west',
  },
]

const DEMO_FEDERATED_DOMAINS: SpiffeFederatedDomain[] = [
  {
    trustDomain: 'staging.example.org',
    bundleEndpoint: 'https://spire-server.staging.example.org/bundle',
    status: 'active',
    lastRefresh: new Date(Date.now() - TEN_MINUTES_MS).toISOString(),
  },
  {
    trustDomain: 'partner.acme.io',
    bundleEndpoint: 'https://spire.partner.acme.io/bundle',
    status: 'active',
    lastRefresh: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
  },
  {
    trustDomain: 'edge.example.org',
    bundleEndpoint: 'https://spire-edge.example.org/bundle',
    status: 'pending',
    lastRefresh: new Date(Date.now() - MS_PER_DAY).toISOString(),
  },
]

export const SPIFFE_DEMO_DATA: SpiffeStatusData = {
  health: 'healthy',
  entries: DEMO_ENTRIES,
  federatedDomains: DEMO_FEDERATED_DOMAINS,
  stats: {
    x509SvidCount: DEMO_X509_SVID_COUNT,
    jwtSvidCount: DEMO_JWT_SVID_COUNT,
    registrationEntryCount: DEMO_ENTRIES.length,
    agentCount: DEMO_AGENT_COUNT,
    serverVersion: DEMO_SERVER_VERSION,
  },
  summary: {
    trustDomain: DEMO_TRUST_DOMAIN,
    totalSvids: DEMO_X509_SVID_COUNT + DEMO_JWT_SVID_COUNT,
    totalFederatedDomains: DEMO_FEDERATED_DOMAINS.length,
    totalEntries: DEMO_ENTRIES.length,
  },
  lastCheckTime: new Date().toISOString(),
}
