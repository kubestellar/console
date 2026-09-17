/**
 * Barrel module for the Helm hooks - re-exports the individually split
 * hook modules so `hooks/mcp/helm` import paths keep working.
 *
 * Split from a single 824-line helm.ts (Issue #23155) into:
 * - helmCache.ts: shared localStorage cache helpers and constants
 * - useHelmReleases.ts: useHelmReleases hook + releases cache
 * - useHelmHistory.ts: useHelmHistory hook + history cache
 * - useHelmValues.ts: useHelmValues hook + values cache
 */
import { getDemoHelmReleases, getDemoHelmHistory, getDemoHelmValues } from '../helm.demo'
import {
  HELM_RELEASES_CACHE_KEY,
  HELM_HISTORY_CACHE_KEY,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
  loadHelmReleasesFromStorage,
  saveHelmReleasesToStorage,
  loadHelmHistoryFromStorage,
  saveHelmHistoryToStorage,
} from './helmCache'
import { resetHelmReleasesCacheForTest } from './useHelmReleases'

export { useHelmReleases } from './useHelmReleases'
export { useHelmHistory } from './useHelmHistory'
export { useHelmValues } from './useHelmValues'

export const __helmTestables = {
  getDemoHelmReleases,
  getDemoHelmHistory,
  getDemoHelmValues,
  loadHelmReleasesFromStorage,
  saveHelmReleasesToStorage,
  loadHelmHistoryFromStorage,
  saveHelmHistoryToStorage,
  HELM_RELEASES_CACHE_KEY,
  HELM_HISTORY_CACHE_KEY,
  HELM_CACHE_TTL_MS,
  HELM_REFRESH_INTERVAL_MS,
  _resetHelmReleasesCacheForTest: resetHelmReleasesCacheForTest,
}
