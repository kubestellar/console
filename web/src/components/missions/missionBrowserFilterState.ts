/**
 * Pure helpers describing the *state* of MissionBrowser's recommendation
 * filter controls (active count, cleared sentinel values) and a small helper
 * for filtering the directory listing by free-text search.
 *
 * Extracted from MissionBrowser.tsx so the component file can stay focused on
 * React rendering. None of these touch React state, refs, or the DOM — they
 * are pure functions / constants safe to unit-test or reuse.
 *
 * The "filter state" types here intentionally mirror the local useState
 * variables in MissionBrowser; they are not exported as a single object type
 * so the component can keep its individual setters without an extra reducer
 * layer.
 */

import type { BrowseEntry } from '../../lib/missions/types'

// ============================================================================
// Active filter count
// ============================================================================

/**
 * Sentinel value for the "Match %" filter when no minimum is enforced.
 * Mirrors the `minMatchPercent === 0` "Any" choice in the chip group.
 */
export const NO_MIN_MATCH_PERCENT = 0

/**
 * Sentinel value for category-style chip filters that means "do not filter".
 * Used for category, maturity, missionClass, and difficulty filters.
 */
export const FILTER_SENTINEL_ALL = 'All'

/**
 * Sentinel value for the source filter that means "do not filter".
 */
export const FILTER_SENTINEL_SOURCE_ALL = 'all' as const

/**
 * Snapshot of the recommendation filter state as displayed in the filter bar.
 * Each property mirrors a single useState in MissionBrowser. Kept as a plain
 * structural type so callers can pass `{ ... }` literals without imports.
 */
export interface RecommendationFilterState {
  minMatchPercent: number
  categoryFilter: string
  matchSourceFilter: 'all' | 'cluster' | 'community'
  maturityFilter: string
  missionClassFilter: string
  difficultyFilter: string
  selectedTags: Set<string>
  cncfFilter: string
}

/**
 * Counts how many of the recommendation filters are currently set to a
 * non-default value. Drives the small purple badge on the filter toggle
 * button and the "Clear all" affordance.
 */
export function computeActiveFilterCount(state: RecommendationFilterState): number {
  let count = 0
  if (state.minMatchPercent > NO_MIN_MATCH_PERCENT) count++
  if (state.categoryFilter !== FILTER_SENTINEL_ALL) count++
  if (state.matchSourceFilter !== FILTER_SENTINEL_SOURCE_ALL) count++
  if (state.maturityFilter !== FILTER_SENTINEL_ALL) count++
  if (state.missionClassFilter !== FILTER_SENTINEL_ALL) count++
  if (state.difficultyFilter !== FILTER_SENTINEL_ALL) count++
  if (state.selectedTags.size > 0) count++
  if (state.cncfFilter) count++
  return count
}

// ============================================================================
// Directory entry filtering
// ============================================================================

/**
 * Filters a directory listing by a case-insensitive substring search across
 * the entry name and description. Empty queries return the input unchanged.
 *
 * Unlike `andMatch` in `missionBrowserFilters.ts`, this uses simple
 * substring matching (no AND tokenization) because directory entries do
 * not have rich metadata to match against.
 */
export function filterDirectoryEntries(
  entries: BrowseEntry[],
  query: string,
): BrowseEntry[] {
  if (!query) return entries
  const q = query.toLowerCase()
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.description?.toLowerCase().includes(q),
  )
}
