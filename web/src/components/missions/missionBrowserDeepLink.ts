/**
 * Deep-link matching helpers for MissionBrowser.
 *
 * Extracted from MissionBrowser.tsx so the component can stay focused on React
 * rendering. These pure helpers implement fuzzy matching of a URL slug against
 * mission metadata so that a deep-link such as
 * `/missions/install-open-policy-agent-opa` can resolve to a mission titled
 * "Install and Configure Open Policy Agent Opa-".
 *
 * Strategy (in priority order, see `scoreMission`):
 *   1. Exact slug match (`getMissionSlug(m) === slug`)
 *   2. cncfProject match (strip "install-" prefix from slug; installers only)
 *   3. Fuzzy word-overlap: extract meaningful words from the slug and from the
 *      mission title+cncfProject, then pick the mission whose word overlap
 *      ratio is highest (>= MIN_WORD_OVERLAP_RATIO).
 *
 * None of these functions touch React state, refs, the DOM, or any browser
 * API — they are pure functions of their arguments and safe to unit-test or
 * reuse from other components.
 */

import type { MissionExport } from '../../lib/missions/types'
import { getMissionSlug } from './browser'

// ============================================================================
// Constants
// ============================================================================

/**
 * Words stripped from slug/title token sets before computing overlap. These
 * are common English stopwords plus generic Kubernetes terms that would
 * otherwise inflate the overlap score for every mission.
 */
export const FILLER_WORDS: ReadonlySet<string> = new Set([
  'and', 'on', 'for', 'the', 'in', 'with', 'a', 'an', 'to', 'of',
  'kubernetes', 'k8s',
])

/**
 * Minimum fraction of slug words that must appear in a mission's word set
 * for that mission to be considered a candidate match.
 */
export const MIN_WORD_OVERLAP_RATIO = 0.6

/**
 * Score at or above which a deep-link match is considered "high confidence"
 * and the deep-link slug ref is permanently consumed. Lower-scoring matches
 * are kept tentative so that a better match can replace them once more
 * missions finish loading (#5654).
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.9

/**
 * Match score returned for an exact slug equality.
 */
const EXACT_SLUG_MATCH_SCORE = 1

/**
 * Match score returned when the slug matches the mission's cncfProject
 * (with or without the "install-" prefix). Slightly below an exact slug
 * match so an exact title hit always wins.
 */
const CNCF_PROJECT_MATCH_SCORE = 0.95

/**
 * Minimum word length that survives slug/title tokenization. Single-letter
 * fragments are too noisy to contribute meaningful overlap.
 */
const MIN_TOKEN_LENGTH = 1

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract the unique meaningful lowercase words from a string, stripping
 * filler words and short fragments. Used to build comparable token sets
 * for both the URL slug and a mission's title+cncfProject.
 */
export function toWordSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > MIN_TOKEN_LENGTH && !FILLER_WORDS.has(w))
  )
}

/**
 * Score how well a single mission matches the deep-link slug.
 *
 * Returns a value in [0, 1]:
 *   - 1.0 — exact slug equality
 *   - 0.95 — cncfProject match (installers only)
 *   - 0..1 — fuzzy word overlap ratio (matched / slugWordSet.size)
 *
 * `isInstaller` controls whether the cncfProject shortcut is applied;
 * fixers always fall through to the fuzzy overlap path.
 */
export function scoreMission(
  m: MissionExport,
  slug: string,
  slugWordSet: Set<string>,
  isInstaller: boolean,
): number {
  // Exact slug match
  if (getMissionSlug(m) === slug) return EXACT_SLUG_MATCH_SCORE

  // cncfProject match (installers only — fixers use slug/title matching)
  if (isInstaller) {
    const project = (m.cncfProject || '').toLowerCase()
    const slugProject = slug.replace(/^install-/, '')
    if (project && (project === slugProject || project === slug)) {
      return CNCF_PROJECT_MATCH_SCORE
    }
  }

  // Fuzzy word-overlap (set intersection) on title + cncfProject
  const missionWordSet = toWordSet(`${m.title || ''} ${m.cncfProject || ''}`)
  if (slugWordSet.size === 0 || missionWordSet.size === 0) return 0
  let matched = 0
  for (const w of slugWordSet) {
    if (missionWordSet.has(w)) matched++
  }
  return matched / slugWordSet.size
}

/**
 * Find the best-scoring mission at or above MIN_WORD_OVERLAP_RATIO in a list.
 * Returns the matched mission (if any) and the winning score so the caller
 * can decide whether to permanently consume the deep-link ref.
 */
export function findBestDeepLinkMatch(
  list: MissionExport[],
  slug: string,
  slugWordSet: Set<string>,
  isInstaller: boolean,
): { match?: MissionExport; score: number } {
  let best: MissionExport | undefined
  let bestScore = MIN_WORD_OVERLAP_RATIO
  for (const m of list) {
    const score = scoreMission(m, slug, slugWordSet, isInstaller)
    if (score >= bestScore) {
      best = m
      bestScore = score
    }
  }
  return { match: best, score: bestScore }
}
