/**
 * useCachedBackstage — Cached hook for Backstage developer portal status.
 *
 * Follows the mandatory caching contract defined in CLAUDE.md:
 * - useCache with fetcher + demoData
 * - isDemoFallback guarded so it's false during loading
 * - Standard CachedHookResult return shape
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Backstage bridge lands (for example /api/backstage/status reading
 * the Backstage Deployment plus /api/catalog/entities counts), the fetcher
 * picks up live data automatically with no component changes.
 */

import { useCache, type RefreshCategory, type CachedHookResult } from '../lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { authFetch } from '../lib/api'
import {
  BACKSTAGE_DEMO_DATA,
  BACKSTAGE_ENTITY_KINDS,
  BACKSTAGE_MS_PER_HOUR,
  type BackstageCatalogCounts,
  type BackstageEntityKind,
  type BackstageHealth,
  type BackstagePlugin,
  type BackstageScaffolderTemplate,
  type BackstageStatusData,
} from '../lib/demo/backstage'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY_BACKSTAGE = 'backstage-status'
const BACKSTAGE_STATUS_ENDPOINT = '/api/backstage/status'

const DEFAULT_VERSION = 'unknown'
const DEFAULT_REPLICAS = 0
const DEFAULT_DESIRED_REPLICAS = 0

// Hours after which the catalog is considered stale enough to mark the
// instance "degraded" even if everything else is fine. Six hours mirrors
// the typical full-refresh cadence an operator expects from a healthy
// Backstage install against a real SCM provider.
const STALE_CATALOG_WINDOW_HOURS = 6
const STALE_CATALOG_WINDOW_MS = STALE_CATALOG_WINDOW_HOURS * BACKSTAGE_MS_PER_HOUR

const NOT_FOUND_STATUS = 404

const EMPTY_CATALOG: BackstageCatalogCounts = {
  Component: 0,
  API: 0,
  System: 0,
  Domain: 0,
  Resource: 0,
  User: 0,
  Group: 0,
}

const INITIAL_DATA: BackstageStatusData = {
  health: 'not-installed',
  version: DEFAULT_VERSION,
  replicas: DEFAULT_REPLICAS,
  desiredReplicas: DEFAULT_DESIRED_REPLICAS,
  catalog: { ...EMPTY_CATALOG },
  plugins: [],
  templates: [],
  lastCatalogSync: new Date().toISOString(),
  lastCheckTime: new Date().toISOString(),
  summary: {
    totalEntities: 0,
    enabledPlugins: 0,
    pluginErrors: 0,
    scaffolderTemplates: 0,
  },
}

// ---------------------------------------------------------------------------
// Internal types (shape of the future /api/backstage/status response)
// ---------------------------------------------------------------------------

interface BackstageStatusResponse {
  version?: string
  replicas?: number
  desiredReplicas?: number
  catalog?: Partial<BackstageCatalogCounts>
  plugins?: BackstagePlugin[]
  templates?: BackstageScaffolderTemplate[]
  lastCatalogSync?: string
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

function normalizeCatalog(
  partial: Partial<BackstageCatalogCounts> | undefined,
): BackstageCatalogCounts {
  const normalized: BackstageCatalogCounts = { ...EMPTY_CATALOG }
  for (const kind of BACKSTAGE_ENTITY_KINDS) {
    const value = partial?.[kind]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      normalized[kind] = value
    }
  }
  return normalized
}

function totalEntities(catalog: BackstageCatalogCounts): number {
  let total = 0
  for (const kind of BACKSTAGE_ENTITY_KINDS) {
    total += catalog[kind] ?? 0
  }
  return total
}

function summarize(
  catalog: BackstageCatalogCounts,
  plugins: BackstagePlugin[],
  templates: BackstageScaffolderTemplate[],
): BackstageStatusData['summary'] {
  let enabledPlugins = 0
  let pluginErrors = 0
  for (const plugin of plugins ?? []) {
    if (plugin.status === 'enabled') enabledPlugins += 1
    else if (plugin.status === 'error') pluginErrors += 1
  }
  return {
    totalEntities: totalEntities(catalog),
    enabledPlugins,
    pluginErrors,
    scaffolderTemplates: (templates ?? []).length,
  }
}

function deriveHealth(
  replicas: number,
  desiredReplicas: number,
  plugins: BackstagePlugin[],
  lastCatalogSync: string,
  totalEntitiesCount: number,
  nowMs: number,
): BackstageHealth {
  if (
    totalEntitiesCount === 0 &&
    (plugins ?? []).length === 0 &&
    desiredReplicas === 0
  ) {
    return 'not-installed'
  }
  if (desiredReplicas > 0 && replicas < desiredReplicas) return 'degraded'
  const hasPluginError = (plugins ?? []).some(p => p.status === 'error')
  if (hasPluginError) return 'degraded'
  const syncMs = new Date(lastCatalogSync).getTime()
  if (Number.isFinite(syncMs) && nowMs - syncMs > STALE_CATALOG_WINDOW_MS) {
    return 'degraded'
  }
  return 'healthy'
}

function buildBackstageStatus(
  raw: BackstageStatusResponse,
): BackstageStatusData {
  const nowMs = Date.now()
  const catalog = normalizeCatalog(raw.catalog)
  const plugins = Array.isArray(raw.plugins) ? raw.plugins : []
  const templates = Array.isArray(raw.templates) ? raw.templates : []
  const version = raw.version ?? DEFAULT_VERSION
  const replicas =
    typeof raw.replicas === 'number' && Number.isFinite(raw.replicas)
      ? raw.replicas
      : DEFAULT_REPLICAS
  const desiredReplicas =
    typeof raw.desiredReplicas === 'number' && Number.isFinite(raw.desiredReplicas)
      ? raw.desiredReplicas
      : DEFAULT_DESIRED_REPLICAS
  const lastCatalogSync = raw.lastCatalogSync ?? new Date(nowMs).toISOString()
  const entityCount = totalEntities(catalog)

  return {
    health: deriveHealth(
      replicas,
      desiredReplicas,
      plugins,
      lastCatalogSync,
      entityCount,
      nowMs,
    ),
    version,
    replicas,
    desiredReplicas,
    catalog,
    plugins,
    templates,
    lastCatalogSync,
    lastCheckTime: new Date(nowMs).toISOString(),
    summary: summarize(catalog, plugins, templates),
  }
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchBackstageStatus(): Promise<BackstageStatusData> {
  const resp = await authFetch(BACKSTAGE_STATUS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!resp.ok) {
    if (resp.status === NOT_FOUND_STATUS) {
      // Endpoint not yet wired — surface "not-installed" so the cache layer
      // will fall back to demo data instead of flagging a hard failure.
      return buildBackstageStatus({})
    }
    throw new Error(`HTTP ${resp.status}`)
  }

  const body = (await resp.json()) as BackstageStatusResponse
  return buildBackstageStatus(body)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCachedBackstage(): CachedHookResult<BackstageStatusData> {
  const result = useCache<BackstageStatusData>({
    key: CACHE_KEY_BACKSTAGE,
    category: 'default' as RefreshCategory,
    initialData: INITIAL_DATA,
    demoData: BACKSTAGE_DEMO_DATA,
    persist: true,
    fetcher: fetchBackstageStatus,
  })

  return {
    data: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    // Rule: never mark demo fallback while still loading — prevents the
    // card from flashing demo content before the first fetch resolves.
    isDemoFallback: result.isDemoFallback && !result.isLoading,
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
  normalizeCatalog,
  totalEntities,
  summarize,
  deriveHealth,
  buildBackstageStatus,
  STALE_CATALOG_WINDOW_MS,
}

// Re-export commonly used types for convenience.
export type { BackstageEntityKind }
