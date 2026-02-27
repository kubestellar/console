import type { KBMissionEntry } from '@/hooks/useConsoleKBIndex'

export interface ClusterIssue {
  type: string // CrashLoopBackOff, OOMKilled, Unavailable, etc.
  resource: string
  namespace: string
  cluster: string
}

export interface IndexMatchResult {
  mission: KBMissionEntry
  score: number
  reasons: string[]
  matchedIssue?: ClusterIssue
}

// Score weights
const ISSUE_TYPE_MATCH = 50
const CNCF_PROJECT_MATCH = 30
const RESOURCE_KIND_MATCH = 20
const TAG_MATCH = 10
const CATEGORY_MATCH = 5

function scoreEntry(
  entry: KBMissionEntry,
  issues: ClusterIssue[],
  detectedProjects: string[],
  resourceKinds: string[],
): IndexMatchResult | null {
  let score = 0
  const reasons: string[] = []
  let matchedIssue: ClusterIssue | undefined

  // Issue type match (highest value - directly addresses user's problem)
  for (const issue of issues) {
    if (entry.issueTypes.some(t => t.toLowerCase() === issue.type.toLowerCase())) {
      score += ISSUE_TYPE_MATCH
      reasons.push(`Addresses ${issue.type} in ${issue.resource}`)
      matchedIssue = issue
      break
    }
  }

  // CNCF project match
  for (const proj of detectedProjects) {
    if (entry.cncfProjects.some(p => p.toLowerCase() === proj.toLowerCase())) {
      score += CNCF_PROJECT_MATCH
      reasons.push(`Matches detected ${proj} in your cluster`)
      break
    }
  }

  // Resource kind match
  for (const kind of resourceKinds) {
    if (entry.targetResourceKinds.some(k => k.toLowerCase() === kind.toLowerCase())) {
      score += RESOURCE_KIND_MATCH
      reasons.push(`Targets ${kind} resources`)
      break
    }
  }

  // Tag overlap
  const allIssueTerms = issues.flatMap(i => [i.type.toLowerCase(), i.resource.toLowerCase(), i.namespace.toLowerCase()])
  const tagOverlap = entry.tags.filter(t => allIssueTerms.some(term => term.includes(t.toLowerCase()) || t.toLowerCase().includes(term)))
  if (tagOverlap.length > 0) {
    score += TAG_MATCH * Math.min(tagOverlap.length, 3)
    reasons.push(`Tags match: ${tagOverlap.slice(0, 3).join(', ')}`)
  }

  // Category bonus for troubleshooting when there are issues
  if (entry.category === 'troubleshooting' && issues.length > 0) {
    score += CATEGORY_MATCH
  }

  if (score < 20) return null // threshold
  return { mission: entry, score, reasons, matchedIssue }
}

export type MatchProgressCallback = (results: IndexMatchResult[], done: boolean) => void

/**
 * Lazily matches KB index entries against cluster issues using requestIdleCallback.
 * Processes in batches of ~20, yields between batches, and calls back with progressive results.
 * Returns a cancel function.
 */
export function lazyMatchIndex(
  entries: KBMissionEntry[],
  issues: ClusterIssue[],
  detectedProjects: string[],
  resourceKinds: string[],
  onProgress: MatchProgressCallback,
  batchSize = 20,
): () => void {
  let cancelled = false
  let index = 0
  const results: IndexMatchResult[] = []
  const seenPaths = new Set<string>()

  function processBatch(deadline?: IdleDeadline) {
    if (cancelled) return

    const end = Math.min(index + batchSize, entries.length)

    while (index < end) {
      if (deadline && deadline.timeRemaining() < 1) break

      const entry = entries[index++]
      const match = scoreEntry(entry, issues, detectedProjects, resourceKinds)
      if (match && !seenPaths.has(match.mission.path)) {
        seenPaths.add(match.mission.path)
        // Insert sorted by score (descending)
        const insertIdx = results.findIndex(r => r.score < match.score)
        if (insertIdx === -1) results.push(match)
        else results.splice(insertIdx, 0, match)
      }
    }

    const done = index >= entries.length
    onProgress([...results], done)

    if (!done && !cancelled) {
      if ('requestIdleCallback' in window) {
        ;(window as unknown as { requestIdleCallback: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => void }).requestIdleCallback(processBatch, { timeout: 2000 })
      } else {
        setTimeout(() => processBatch(), 16)
      }
    }
  }

  // Start processing
  if ('requestIdleCallback' in window) {
    ;(window as unknown as { requestIdleCallback: (cb: (d: IdleDeadline) => void, opts?: { timeout: number }) => void }).requestIdleCallback(processBatch, { timeout: 2000 })
  } else {
    setTimeout(() => processBatch(), 16)
  }

  return () => { cancelled = true }
}

/**
 * Synchronous version for testing — processes all entries at once.
 */
export function matchIndexSync(
  entries: KBMissionEntry[],
  issues: ClusterIssue[],
  detectedProjects: string[],
  resourceKinds: string[],
): IndexMatchResult[] {
  const results: IndexMatchResult[] = []
  const seenPaths = new Set<string>()

  for (const entry of entries) {
    const match = scoreEntry(entry, issues, detectedProjects, resourceKinds)
    if (match && !seenPaths.has(match.mission.path)) {
      seenPaths.add(match.mission.path)
      results.push(match)
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
