/**
 * useCachedTuf — Cached hook for TUF (The Update Framework) status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real TUF metadata bridge lands (for example /api/tuf/status surfacing
 * parsed role metadata from a TUF repository), the fetcher picks up live
 * data automatically with no component changes.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  TUF_DEMO_DATA,
  type TufHealth,
  type TufMetadataStatus,
  type TufRole,
  type TufStatusData,
} from '../lib/demo/tuf'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_TUF = 'tuf-status'
const TUF_STATUS_ENDPOINT = '/api/tuf/status'
const DEFAULT_SPEC_VERSION = 'unknown'
const DEFAULT_REPOSITORY = ''

// An expiration window inside which a role is flagged "expiring-soon".
// 7 days mirrors the typical TUF snapshot cadence and gives operators a
// clear warning before any single role expires.
const EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const NOT_FOUND_STATUS = 404

const INITIAL_DATA: TufStatusData = {
  health: 'not-installed',
  specVersion: DEFAULT_SPEC_VERSION,
  repository: DEFAULT_REPOSITORY,
  roles: [],
  summary: {
    totalRoles: 0,
    signedRoles: 0,
    expiredRoles: 0,
    expiringSoonRoles: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/tuf/status response)
// ---------------------------------------------------------------------------

interface TufStatusResponse {
  specVersion?: string
  repository?: string
  roles?: TufRole[]
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function deriveStatus(role: TufRole, nowMs: number): TufMetadataStatus {
  // Respect an already-computed status from the backend when it's one of
  // the terminal values we can't re-derive locally.
  if (role.status === 'unsigned') return 'unsigned'

  const expiresMs = new Date(role.expiresAt).getTime()
  if (!Number.isFinite(expiresMs)) return role.status

  if (expiresMs <= nowMs) return 'expired'
  if (expiresMs - nowMs <= EXPIRING_SOON_WINDOW_MS) return 'expiring-soon'
  return 'signed'
}

function summarize(roles: TufRole[]): TufStatusData['summary'] {
  let signedRoles = 0
  let expiredRoles = 0
  let expiringSoonRoles = 0
  for (const role of roles ?? []) {
    if (role.status === 'signed') signedRoles += 1
    else if (role.status === 'expired') expiredRoles += 1
    else if (role.status === 'expiring-soon') expiringSoonRoles += 1
  }
  return {
    totalRoles: roles.length,
    signedRoles,
    expiredRoles,
    expiringSoonRoles,
  }
}

function deriveHealth(roles: TufRole[]): TufHealth {
  if (roles.length === 0) return 'not-installed'
  const hasExpired = roles.some(r => r.status === 'expired' || r.status === 'unsigned')
  if (hasExpired) return 'degraded'
  const hasExpiringSoon = roles.some(r => r.status === 'expiring-soon')
  if (hasExpiringSoon) return 'degraded'
  return 'healthy'
}

function buildTufStatus(
  roles: TufRole[],
  specVersion: string,
  repository: string,
): TufStatusData {
  const nowMs = Date.now()
  const normalizedRoles = (roles ?? []).map<TufRole>(role => ({
    ...role,
    status: deriveStatus(role, nowMs),
  }))
  return {
    health: deriveHealth(normalizedRoles),
    specVersion,
    repository,
    roles: normalizedRoles,
    summary: summarize(normalizedRoles),
    lastCheckTime: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTufStatus(): Promise<TufStatusData> {
  const resp = await authFetch(TUF_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (resp.status === NOT_FOUND_STATUS) {
      // Endpoint not yet wired — surface "not-installed" so the cache layer
      // will fall back to demo data instead of flagging a hard failure.
      return buildTufStatus([], DEFAULT_SPEC_VERSION, DEFAULT_REPOSITORY)
    }
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as TufStatusResponse
  const roles = Array.isArray(body.roles) ? body.roles : []
  const specVersion = body.specVersion ?? DEFAULT_SPEC_VERSION
  const repository = body.repository ?? DEFAULT_REPOSITORY
  return buildTufStatus(roles, specVersion, repository)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedTuf(): CachedHookResult<TufStatusData> {
  const result = useCache<TufStatusData>({
    key: CACHE_KEY_TUF,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: TUF_DEMO_DATA,
    persist: true,
    fetcher: fetchTufStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    isDemoFallback: result.isDemoFallback,
    error: result.error,
    isFailed: result.isFailed,
    consecutiveFailures: result.consecutiveFailures,
    lastRefresh: result.lastRefresh,
    refetch: result.refetch,
  }
}

// ---------------------------------------------------------------------------
// Exported testables — pure functions for unit testing
// ---------------------------------------------------------------------------

export const __testables = {
  deriveStatus,
  summarize,
  deriveHealth,
  buildTufStatus,
  EXPIRING_SOON_WINDOW_MS,
}
