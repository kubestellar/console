import { MS_PER_DAY } from '../../lib/constants/time'
import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor, GitHubRepo, ViewMode, SortByOption, GitHubItem, GitHubItemUnknown } from './GitHubActivity.types'
import { isStale } from './GitHubActivity.utils'

export const SORT_OPTIONS = [
  { value: 'date' as const, label: 'Date' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'status' as const, label: 'Status' },
]

export const TIME_RANGES = [
  { value: '7d' as const, label: '7 Days' },
  { value: '30d' as const, label: '30 Days' },
  { value: '90d' as const, label: '90 Days' },
  { value: '1y' as const, label: '1 Year' },
]

export type TimeRange = (typeof TIME_RANGES)[number]['value']

// Sort comparators for GitHub items (open-first sorting applied separately after)
export const SORT_COMPARATORS: Record<SortByOption, (a: GitHubItem, b: GitHubItem) => number> = {
  date: (a, b) => {
    const aUnknown = a as unknown as GitHubItemUnknown
    const bUnknown = b as unknown as GitHubItemUnknown
    const aDate = new Date((aUnknown.updated_at as string) || (aUnknown.published_at as string) || 0).getTime()
    const bDate = new Date((bUnknown.updated_at as string) || (bUnknown.published_at as string) || 0).getTime()
    return aDate - bDate
  },
  activity: (a, b) => {
    const aUnknown = a as unknown as GitHubItemUnknown
    const bUnknown = b as unknown as GitHubItemUnknown
    const aActivity = (aUnknown.comments as number) ?? (aUnknown.contributions as number) ?? 0
    const bActivity = (bUnknown.comments as number) ?? (bUnknown.contributions as number) ?? 0
    return aActivity - bActivity
  },
  status: (a, b) => {
    const aUnknown = a as unknown as GitHubItemUnknown
    const bUnknown = b as unknown as GitHubItemUnknown
    const statusOrder: Record<string, number> = { open: 0, merged: 1, closed: 2 }
    const aStatus = aUnknown.merged_at ? 'merged' : ((aUnknown.state as string) || '')
    const bStatus = bUnknown.merged_at ? 'merged' : ((bUnknown.state as string) || '')
    return (statusOrder[aStatus] ?? 999) - (statusOrder[bStatus] ?? 999)
  } }

// Custom search predicate for GitHub items (handles heterogeneous item types)
export function githubSearchPredicate(item: GitHubItem, query: string): boolean {
  const itemUnknown = item as unknown as GitHubItemUnknown
  return (
    (itemUnknown.title as string)?.toLowerCase().includes(query) ||
    (itemUnknown.name as string)?.toLowerCase().includes(query) ||
    (itemUnknown.tag_name as string)?.toLowerCase().includes(query) ||
    (itemUnknown.login as string)?.toLowerCase().includes(query) ||
    ((itemUnknown.user as { login?: string })?.login)?.toLowerCase().includes(query) ||
    ((itemUnknown.author as { login?: string })?.login)?.toLowerCase().includes(query) ||
    false
  )
}

// Pre-filter data by viewMode and timeRange before passing to useCardData
export function buildPreFilteredItems(
  viewMode: ViewMode,
  timeRange: TimeRange,
  data: { prs: GitHubPR[]; issues: GitHubIssue[]; releases: GitHubRelease[]; contributors: GitHubContributor[] },
): GitHubItem[] {
  const { prs, issues, releases, contributors } = data
  const now = Date.now()
  const rangeMs = {
    '7d': 7 * MS_PER_DAY,
    '30d': 30 * MS_PER_DAY,
    '90d': 90 * MS_PER_DAY,
    '1y': 365 * MS_PER_DAY }[timeRange]

  if (viewMode === 'prs') {
    // Sort PRs: open first, then by date within each group
    const filtered = prs.filter(pr => now - new Date(pr.updated_at).getTime() <= rangeMs)
    return filtered.sort((a, b) => {
      // Open PRs first
      if (a.state === 'open' && b.state !== 'open') return -1
      if (a.state !== 'open' && b.state === 'open') return 1
      // Then by date (most recent first)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  } else if (viewMode === 'issues') {
    // Sort issues: open first, then by date within each group
    const filtered = issues.filter(issue => now - new Date(issue.updated_at).getTime() <= rangeMs)
    return filtered.sort((a, b) => {
      // Open issues first
      if (a.state === 'open' && b.state !== 'open') return -1
      if (a.state !== 'open' && b.state === 'open') return 1
      // Then by date (most recent first)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  } else if (viewMode === 'releases') {
    return releases.filter(release => now - new Date(release.published_at).getTime() <= rangeMs)
  } else if (viewMode === 'contributors') {
    return contributors
  }
  return []
}

// Always show open items first (regardless of sort direction)
// This is a stable sort that preserves the relative order within each group
export function applyOpenFirstOrder(items: GitHubItem[], viewMode: ViewMode): GitHubItem[] {
  if (viewMode === 'contributors' || viewMode === 'releases') {
    return items // No open/closed concept for these
  }
  return [...items].sort((a, b) => {
    const aUnknown = a as unknown as GitHubItemUnknown
    const bUnknown = b as unknown as GitHubItemUnknown
    const aOpen = aUnknown.state === 'open' ? 0 : 1
    const bOpen = bUnknown.state === 'open' ? 0 : 1
    return aOpen - bOpen // Open (0) comes before closed (1)
  })
}

export interface GitHubActivityStats {
  openPRs: number
  mergedPRs: number
  openIssues: number
  stalePRs: number
  staleIssues: number
  stars: number
  totalContributors: number
}

// Calculate stats - use accurate counts from fetched data
export function computeGitHubActivityStats(
  prs: GitHubPR[],
  issues: GitHubIssue[],
  contributors: GitHubContributor[],
  repoInfo: GitHubRepo | null,
): GitHubActivityStats {
  const openPRs = prs.filter(pr => pr.state === 'open').length
  const mergedPRs = prs.filter(pr => pr.merged_at != null).length
  // Count open issues directly from fetched issues (already filtered to exclude PRs)
  const openIssues = issues.filter(issue => issue.state === 'open').length
  const stalePRs = prs.filter(pr => pr.state === 'open' && isStale(pr.updated_at)).length
  const staleIssues = issues.filter(issue => issue.state === 'open' && isStale(issue.updated_at)).length

  return {
    openPRs,
    mergedPRs,
    openIssues,
    stalePRs,
    staleIssues,
    stars: repoInfo?.stargazers_count || 0,
    totalContributors: contributors.length }
}
