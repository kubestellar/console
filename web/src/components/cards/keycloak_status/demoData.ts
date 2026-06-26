/**
 * Demo data for the Keycloak Identity & Access Management status card.
 *
 * Represents a typical production environment running the Keycloak Operator
 * on Kubernetes. Used in demo mode or when no cluster is connected.
 *
 * Keycloak terminology:
 * - Realm: an isolated IAM domain (users, clients, sessions)
 * - Client: an application registered with Keycloak for SSO
 * - Session: an active authenticated user session within a realm
 *
 * The five demo realms cover all four possible status states so every
 * rendering branch is exercised in demo mode.
 */

/** Demo data shows as checked 30 seconds ago */
const DEMO_LAST_CHECK_OFFSET_MS = 30_000

export type KeycloakRealmStatus = 'ready' | 'provisioning' | 'degraded' | 'error'

export interface KeycloakRealm {
  name: string
  namespace: string
  /** Cluster the Keycloak instance runs on. Empty string when unknown. */
  cluster: string
  status: KeycloakRealmStatus
  /** Whether the realm is enabled for login */
  enabled: boolean
  /** Number of registered clients in this realm */
  clients: number
  /** Total users in this realm */
  users: number
  /** Currently active sessions in this realm */
  activeSessions: number
}

export interface KeycloakDemoData {
  health: 'healthy' | 'degraded' | 'not-installed'
  operatorPods: {
    ready: number
    total: number
  }
  realms: KeycloakRealm[]
  totalClients: number
  totalUsers: number
  totalActiveSessions: number
  lastCheckTime: string
}

export const KEYCLOAK_DEMO_DATA: KeycloakDemoData = {
  // One operator pod is down → degraded overall health
  health: 'degraded',
  operatorPods: { ready: 1, total: 2 },
  realms: [
    {
      // The built-in admin realm — always present in every Keycloak installation
      name: 'master',
      namespace: 'keycloak',
      cluster: 'prod-cluster',
      status: 'ready',
      enabled: true,
      clients: 12,
      users: 48,
      activeSessions: 21,
    },
    {
      // Primary production SSO realm serving the platform's end users
      name: 'platform',
      namespace: 'keycloak',
      cluster: 'prod-cluster',
      status: 'ready',
      enabled: true,
      clients: 24,
      users: 2840,
      activeSessions: 312,
    },
    {
      // Staging realm — degraded due to misconfigured identity provider
      name: 'staging',
      namespace: 'keycloak-staging',
      cluster: 'staging-cluster',
      status: 'degraded',
      enabled: true,
      clients: 8,
      users: 142,
      activeSessions: 0,
    },
    {
      // New dev realm currently being provisioned; login disabled until ready
      name: 'dev-sandbox',
      namespace: 'keycloak-dev',
      cluster: 'dev-cluster',
      status: 'provisioning',
      enabled: false,
      clients: 3,
      users: 12,
      activeSessions: 0,
    },
    {
      // Legacy SSO realm in error state — database backend unreachable
      name: 'legacy-sso',
      namespace: 'keycloak',
      cluster: 'prod-cluster',
      status: 'error',
      enabled: true,
      clients: 5,
      users: 203,
      activeSessions: 0,
    },
  ],
  // Totals must equal the sum of individual realm values:
  // clients: 12 + 24 + 8 + 3 + 5 = 52
  // users:   48 + 2840 + 142 + 12 + 203 = 3245
  // sessions: 21 + 312 + 0 + 0 + 0 = 333
  totalClients: 52,
  totalUsers: 3245,
  totalActiveSessions: 333,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
