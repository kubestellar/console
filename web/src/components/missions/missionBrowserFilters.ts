/**
 * Pure filter, search, and faceting helpers used by MissionBrowser.
 *
 * Extracted from MissionBrowser.tsx so the component can stay focused on React
 * rendering. None of these functions touch React state, refs, the DOM, or any
 * browser API beyond plain object iteration — they are pure functions of their
 * arguments and safe to unit-test or reuse.
 */

import type { MissionExport, MissionMatch } from '../../lib/missions/types'

// ============================================================================
// Text matching
// ============================================================================

/**
 * AND-style search: every space-separated term in `query` must appear somewhere
 * in `text` (case-insensitive). Empty queries match everything.
 */
export function andMatch(text: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const lower = text.toLowerCase()
  return terms.every(term => lower.includes(term))
}

/**
 * Returns true when `query` AND-matches the mission's title, description, and
 * tags concatenated together.
 */
export function matchesMission(m: MissionExport, query: string): boolean {
  const haystack = [m.title || '', m.description || '', ...(m.tags || [])].join(' ')
  return andMatch(haystack, query)
}

// ============================================================================
// Installer / fixer filtering
// ============================================================================

export interface InstallerFilterArgs {
  categoryFilter: string
  maturityFilter: string
  search: string
}

/**
 * Filters an installer mission list by category, maturity tag, and free-text
 * search. Each filter is applied only when its value is not the sentinel
 * 'All' / empty string.
 */
export function filterInstallers(
  missions: MissionExport[],
  { categoryFilter, maturityFilter, search }: InstallerFilterArgs,
): MissionExport[] {
  let list = missions
  if (categoryFilter !== 'All') {
    list = list.filter(m => m.category === categoryFilter)
  }
  if (maturityFilter !== 'All') {
    list = list.filter(m => m.tags?.includes(maturityFilter))
  }
  if (search) {
    list = list.filter(m => matchesMission(m, search))
  }
  return list
}

export interface FixerFilterArgs {
  typeFilter: string
  search: string
}

/**
 * Filters a fixer mission list by mission type and free-text search.
 * `typeFilter` is compared case-insensitively against `mission.type`.
 */
export function filterFixers(
  missions: MissionExport[],
  { typeFilter, search }: FixerFilterArgs,
): MissionExport[] {
  let list = missions
  if (typeFilter !== 'All') {
    list = list.filter(m => m.type === typeFilter.toLowerCase())
  }
  if (search) {
    list = list.filter(m => matchesMission(m, search))
  }
  return list
}

// ============================================================================
// Recommendation faceting
// ============================================================================

/** Maximum number of distinct tags surfaced as facet chips */
const TOP_TAG_LIMIT = 12

/** Score threshold above which a recommendation is treated as a cluster match */
const CLUSTER_MATCH_SCORE_THRESHOLD = 1

export interface FacetCounts {
  clusterMatched: number
  community: number
  maturity: Map<string, number>
  difficulty: Map<string, number>
  missionClass: Map<string, number>
  topTags: Array<{ tag: string; count: number }>
}

/**
 * Computes facet counts (cluster vs community, maturity / difficulty /
 * missionClass histograms, and top tags) over an unfiltered list of
 * recommendations. Used to populate filter chips with live counts.
 */
export function computeFacetCounts(recommendations: MissionMatch[]): FacetCounts {
  const tags = new Map<string, number>()
  const maturity = new Map<string, number>()
  const difficulty = new Map<string, number>()
  const missionClass = new Map<string, number>()
  let clusterMatched = 0
  let community = 0

  for (const r of recommendations) {
    if (r.score > CLUSTER_MATCH_SCORE_THRESHOLD) clusterMatched++
    else community++
    const mat = r.mission.metadata?.maturity || 'unknown'
    maturity.set(mat, (maturity.get(mat) || 0) + 1)
    const diff = r.mission.difficulty || 'unspecified'
    difficulty.set(diff, (difficulty.get(diff) || 0) + 1)
    const cls = r.mission.missionClass || 'unspecified'
    missionClass.set(cls, (missionClass.get(cls) || 0) + 1)
    for (const tag of (r.mission.tags || [])) {
      const t = tag.toLowerCase()
      tags.set(t, (tags.get(t) || 0) + 1)
    }
  }
  const topTags = [...tags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TAG_LIMIT)
    .map(([tag, count]: [string, number]) => ({ tag, count }))

  return { clusterMatched, community, maturity, difficulty, missionClass, topTags }
}

// ============================================================================
// Recommendation filtering
// ============================================================================

export interface RecommendationFilterArgs {
  minMatchPercent: number
  matchSourceFilter: 'all' | 'cluster' | 'community'
  categoryFilter: string
  maturityFilter: string
  missionClassFilter: string
  difficultyFilter: string
  selectedTags: Set<string>
  cncfFilter: string
  searchQuery: string
}

/**
 * Applies the full recommendation filter pipeline: minimum match threshold,
 * cluster/community source, category, maturity, missionClass, difficulty,
 * tags (any-of), CNCF project substring, and free-text search across
 * title / description / tags.
 *
 * All comparisons that involve user-provided strings are case-insensitive.
 */
export function filterRecommendations(
  recommendations: MissionMatch[],
  args: RecommendationFilterArgs,
): MissionMatch[] {
  const {
    minMatchPercent, matchSourceFilter, categoryFilter, maturityFilter,
    missionClassFilter, difficultyFilter, selectedTags, cncfFilter, searchQuery,
  } = args
  let recs = recommendations

  if (minMatchPercent > 0) {
    recs = recs.filter((r) => r.matchPercent >= minMatchPercent)
  }

  if (matchSourceFilter === 'cluster') {
    recs = recs.filter((r) => r.score > CLUSTER_MATCH_SCORE_THRESHOLD)
  } else if (matchSourceFilter === 'community') {
    recs = recs.filter((r) => r.score <= CLUSTER_MATCH_SCORE_THRESHOLD)
  }

  if (categoryFilter !== 'All') {
    recs = recs.filter(
      (r) => (r.mission.type || '').toLowerCase() === categoryFilter.toLowerCase()
    )
  }

  if (maturityFilter !== 'All') {
    recs = recs.filter((r) => (r.mission.metadata?.maturity || 'unknown').toLowerCase() === maturityFilter.toLowerCase())
  }

  if (missionClassFilter !== 'All') {
    recs = recs.filter((r) => (r.mission.missionClass || 'unspecified').toLowerCase() === missionClassFilter.toLowerCase())
  }

  if (difficultyFilter !== 'All') {
    recs = recs.filter((r) => (r.mission.difficulty || 'unspecified').toLowerCase() === difficultyFilter.toLowerCase())
  }

  if (selectedTags.size > 0) {
    recs = recs.filter((r) =>
      (r.mission.tags || []).some((tag) => selectedTags.has(tag.toLowerCase()))
    )
  }

  if (cncfFilter) {
    const q = cncfFilter.toLowerCase()
    recs = recs.filter(
      (r) => r.mission.cncfProject?.toLowerCase().includes(q)
    )
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    recs = recs.filter(
      (r) =>
        (r.mission.title || '').toLowerCase().includes(q) ||
        (r.mission.description || '').toLowerCase().includes(q) ||
        (r.mission.tags || []).some((tag) => tag.toLowerCase().includes(q))
    )
  }

  return recs
}
