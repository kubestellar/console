import { kubectlProxy } from '../../lib/kubectlProxy'
import { DEFAULT_REFRESH_INTERVAL_MS as REFRESH_INTERVAL_MS } from '../../lib/constants'
import { CRD_CHECK_TIMEOUT_MS, CRD_DATA_FETCH_TIMEOUT_MS } from '../../lib/constants/network'
import { STORAGE_KEY_INTOTO_CACHE, STORAGE_KEY_INTOTO_CACHE_TIME } from '../../lib/constants/storage'
import {
  applyLinkStatuses,
  buildClusterStatus,
  emptyStatus,
  markMissingSteps,
  transformLayoutResources,
} from './transforms'
import type {
  CacheData,
  IntotoClusterStatus,
  IntotoLayoutResource,
  IntotoLinkResource,
} from './types'

export const INTOTO_CACHE_MAX_AGE_MS = REFRESH_INTERVAL_MS

function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`[useIntoto] Failed to parse ${context}, using default`, err)
    return fallback
  }
}

export function loadFromCache(): CacheData | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE)
    const cacheTime = localStorage.getItem(STORAGE_KEY_INTOTO_CACHE_TIME)
    if (!cached || !cacheTime) return null

    return {
      statuses: safeJsonParse<Record<string, IntotoClusterStatus>>(cached, {}, 'localStorage cache'),
      timestamp: parseInt(cacheTime, 10),
    }
  } catch {
    return null
  }
}

export function saveToCache(statuses: Record<string, IntotoClusterStatus>): void {
  try {
    const completed = Object.fromEntries(
      Object.entries(statuses).filter(([, status]) => !status.loading && !status.error)
    )

    if (Object.keys(completed).length > 0) {
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE, JSON.stringify(completed))
      localStorage.setItem(STORAGE_KEY_INTOTO_CACHE_TIME, Date.now().toString())
    }
  } catch {
    // Ignore storage errors
  }
}

/** Clear localStorage cache so stale data doesn't persist across mode transitions */
export function clearCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE)
    localStorage.removeItem(STORAGE_KEY_INTOTO_CACHE_TIME)
  } catch {
    // Ignore storage errors
  }
}

export async function fetchSingleCluster(cluster: string): Promise<IntotoClusterStatus> {
  try {
    const crdCheck = await kubectlProxy.exec(
      ['get', 'crd', 'layouts.in-toto.io', '-o', 'name'],
      { context: cluster, timeout: CRD_CHECK_TIMEOUT_MS }
    )

    if (crdCheck.exitCode !== 0) {
      return emptyStatus(cluster, false)
    }

    const layoutResult = await kubectlProxy.exec(
      ['get', 'layouts.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (layoutResult.exitCode !== 0) {
      return emptyStatus(
        cluster,
        true,
        layoutResult.output?.trim() || 'intoto_supply_chain.fetchErrorLayouts'
      )
    }

    const layoutData = layoutResult.output
      ? safeJsonParse<{ items?: IntotoLayoutResource[] }>(layoutResult.output, { items: [] }, `${cluster} layouts.in-toto.io`)
      : { items: [] }

    const layouts = transformLayoutResources(cluster, layoutData.items || [])

    const linkResult = await kubectlProxy.exec(
      ['get', 'links.in-toto.io', '-A', '-o', 'json'],
      { context: cluster, timeout: CRD_DATA_FETCH_TIMEOUT_MS }
    )

    if (linkResult.exitCode === 0 && linkResult.output) {
      const linkData = safeJsonParse<{ items?: IntotoLinkResource[] }>(linkResult.output, { items: [] }, `${cluster} links.in-toto.io`)
      applyLinkStatuses(layouts, linkData.items || [])
    }

    markMissingSteps(layouts)
    return buildClusterStatus(cluster, layouts)
  } catch (err: unknown) {
    const isDemoError = err instanceof Error && err.message.includes('demo mode')
    if (!isDemoError) {
      console.error(`[useIntoto] Error fetching from ${cluster}:`, err)
    }

    return emptyStatus(
      cluster,
      false,
      err instanceof Error ? err.message : 'intoto_supply_chain.connectionFailed'
    )
  }
}
