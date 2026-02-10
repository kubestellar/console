import { useState, useMemo, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { GitPullRequest, GitBranch, Star, Users, Package, TrendingUp, AlertCircle, Clock, CheckCircle, XCircle, GitMerge, Settings, X, Plus, Check } from 'lucide-react'
import { Skeleton } from '../ui/Skeleton'
import { cn } from '../../lib/cn'
import {
  useCardData,
  CardSearchInput,
  CardControlsRow,
  CardPaginationFooter,
} from '../../lib/cards'
import { useCardLoadingState } from './CardDataContext'
import type { SortDirection } from '../../lib/cards'

// Types for GitHub activity data
interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed'
  merged_at: string | null  // timestamp if merged, null otherwise (from GitHub API)
  created_at: string
  updated_at: string
  closed_at?: string
  user: {
    login: string
    avatar_url: string
  }
  html_url: string
  draft: boolean
  labels: Array<{ name: string; color: string }>
}

interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  created_at: string
  updated_at: string
  closed_at?: string
  user: {
    login: string
    avatar_url: string
  }
  html_url: string
  labels: Array<{ name: string; color: string }>
  comments: number
}

interface GitHubRelease {
  id: number
  tag_name: string
  name: string
  published_at: string
  html_url: string
  author: {
    login: string
  }
  prerelease: boolean
}

interface GitHubContributor {
  login: string
  avatar_url: string
  contributions: number
  html_url: string
}

interface GitHubRepo {
  name: string
  full_name: string
  stargazers_count: number
  open_issues_count: number
  html_url: string
}

interface GitHubActivityConfig {
  repos?: string[]  // e.g., ["owner/repo"]
  org?: string      // e.g., "kubestellar"
  mode?: 'repo' | 'org' | 'multi-repo'
  token?: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
}

type ViewMode = 'prs' | 'issues' | 'stars' | 'contributors' | 'releases'
type SortByOption = 'date' | 'activity' | 'status'

// Union type for all GitHub items that can be displayed
type GitHubItem = GitHubPR | GitHubIssue | GitHubRelease | GitHubContributor

// Helper type for accessing properties on heterogeneous GitHub items
// Used when we need to dynamically access properties across different item types
type GitHubItemUnknown = Record<string, unknown>

const SORT_OPTIONS = [
  { value: 'date' as const, label: 'Date' },
  { value: 'activity' as const, label: 'Activity' },
  { value: 'status' as const, label: 'Status' },
]

const TIME_RANGES = [
  { value: '7d' as const, label: '7 Days' },
  { value: '30d' as const, label: '30 Days' },
  { value: '90d' as const, label: '90 Days' },
  { value: '1y' as const, label: '1 Year' },
]

// Utility functions
function formatTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

function isStale(date: string, days: number = 30): boolean {
  const ageInDays = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
  return ageInDays > days
}

// Decode base64 encoded token from localStorage (Settings stores it encoded)
const decodeToken = (encoded: string): string => {
  try {
    return atob(encoded)
  } catch {
    return encoded // Return as-is if not encoded (migration from old format)
  }
}

// Default repository to show if none configured
const DEFAULT_REPO = 'kubestellar/console'

// LocalStorage key for saved repos
const SAVED_REPOS_KEY = 'github_activity_saved_repos'
const CURRENT_REPO_KEY = 'github_activity_repo'
const CACHE_KEY_PREFIX = 'github_activity_cache_v2_' // v2: fixed PR fetching
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes cache TTL - shorter for fresher data

// Cache data structure
interface CachedGitHubData {
  timestamp: number
  repoInfo: GitHubRepo | null
  prs: GitHubPR[]
  issues: GitHubIssue[]
  releases: GitHubRelease[]
  contributors: GitHubContributor[]
  openPRCount: number
  openIssueCount: number
}

// Get cached data for a repo
function getCachedData(repo: string): CachedGitHubData | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY_PREFIX + repo.replace('/', '_'))
    if (!cached) return null
    const data = JSON.parse(cached) as CachedGitHubData
    // Check if cache is still fresh
    if (Date.now() - data.timestamp < CACHE_TTL_MS) {
      return data
    }
    return null // Cache expired
  } catch {
    return null
  }
}

// Save data to cache
function setCachedData(repo: string, data: Omit<CachedGitHubData, 'timestamp'>) {
  try {
    const cached: CachedGitHubData = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(CACHE_KEY_PREFIX + repo.replace('/', '_'), JSON.stringify(cached))
  } catch (e) {
    // Storage might be full, ignore
    console.error('Failed to cache GitHub data:', e)
  }
}

// Get saved repos from localStorage
function getSavedRepos(): string[] {
  try {
    const saved = localStorage.getItem(SAVED_REPOS_KEY)
    return saved ? JSON.parse(saved) : [DEFAULT_REPO]
  } catch {
    return [DEFAULT_REPO]
  }
}

// Save repos to localStorage
function saveRepos(repos: string[]) {
  localStorage.setItem(SAVED_REPOS_KEY, JSON.stringify(repos))
}

// Custom hook for GitHub data fetching
function useGitHubActivity(config?: GitHubActivityConfig) {
  const [prs, setPRs] = useState<GitHubPR[]>([])
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [releases, setReleases] = useState<GitHubRelease[]>([])
  const [contributors, setContributors] = useState<GitHubContributor[]>([])
  const [repoInfo, setRepoInfo] = useState<GitHubRepo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [openPRCount, setOpenPRCount] = useState(0)
  const [openIssueCount, setOpenIssueCount] = useState(0)

  // Use configured repos or default to kubestellar/console
  const repos = config?.repos?.length ? config.repos : [DEFAULT_REPO]
  const org = config?.org
  // Note: Token stored in localStorage base64 encoded - decode before use
  const encodedToken = config?.token || localStorage.getItem('github_token') || ''
  const token = encodedToken ? decodeToken(encodedToken) : ''
  const reposKey = useMemo(() => repos.join(','), [repos.join(',')])

  const fetchGitHubData = async (isManualRefresh = false) => {
    if (repos.length === 0 && !org) {
      setIsLoading(false)
      setError('No repositories or organization configured')
      return
    }

    // For simplicity, fetch data for the first repo
    const targetRepo = repos[0]

    if (!targetRepo) {
      setIsLoading(false)
      setError('No valid repository specified. Please configure at least one repository in the format "owner/repo".')
      return
    }

    // Check cache first (unless manual refresh)
    if (!isManualRefresh) {
      const cached = getCachedData(targetRepo)
      // Use cached data only if it has valid PR data (not empty from old buggy cache)
      if (cached && cached.prs && cached.prs.length > 0) {
        setRepoInfo(cached.repoInfo)
        setPRs(cached.prs)
        setIssues(cached.issues)
        setReleases(cached.releases)
        setContributors(cached.contributors)
        setOpenPRCount(cached.openPRCount)
        setOpenIssueCount(cached.openIssueCount)
        setLastRefresh(new Date(cached.timestamp))
        setIsLoading(false)
        setError(null)
        return
      }
    }

    if (isManualRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
      }

      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      // Fetch repository info
      const repoResponse = await fetch(`https://api.github.com/repos/${targetRepo}`, { headers })
      if (!repoResponse.ok) throw new Error(`Failed to fetch repo: ${repoResponse.statusText}`)
      const repoData = await repoResponse.json()
      setRepoInfo(repoData)

      // Fetch open PRs and closed/merged PRs separately to ensure we get merged PRs
      // For active repos, all "recently updated" PRs might be open ones
      const [openPRsResponse, closedPRsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${targetRepo}/pulls?state=open&per_page=50&sort=updated`, { headers }),
        fetch(`https://api.github.com/repos/${targetRepo}/pulls?state=closed&per_page=50&sort=updated`, { headers })
      ])

      if (!openPRsResponse.ok) throw new Error(`Failed to fetch open PRs: ${openPRsResponse.statusText}`)
      if (!closedPRsResponse.ok) throw new Error(`Failed to fetch closed PRs: ${closedPRsResponse.statusText}`)

      const openPRsData = await openPRsResponse.json()
      const closedPRsData = await closedPRsResponse.json()

      // Combine and sort by updated_at (most recent first)
      const allPRs = [...openPRsData, ...closedPRsData]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 100) // Keep top 100 for display

      setPRs(allPRs)
      setOpenPRCount(openPRsData.length)

      // Fetch open Issues count and recent issues
      const [openIssuesResponse, recentIssuesResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${targetRepo}/issues?state=open&per_page=1`, { headers }),
        fetch(`https://api.github.com/repos/${targetRepo}/issues?state=all&per_page=50&sort=updated`, { headers })
      ])

      // Get open issue count from Link header or response body
      let calculatedOpenIssueCount = 0
      if (openIssuesResponse.ok) {
        const linkHeader = openIssuesResponse.headers.get('Link')
        if (linkHeader) {
          const match = linkHeader.match(/page=(\d+)>; rel="last"/)
          calculatedOpenIssueCount = match ? parseInt(match[1], 10) : 1
        } else {
          const openIssues = await openIssuesResponse.json()
          calculatedOpenIssueCount = openIssues.filter((i: GitHubIssue & { pull_request?: unknown }) => !i.pull_request).length
        }
        setOpenIssueCount(calculatedOpenIssueCount)
      }

      if (!recentIssuesResponse.ok) throw new Error(`Failed to fetch issues: ${recentIssuesResponse.statusText}`)
      const issuesData: GitHubIssue[] = await recentIssuesResponse.json()
      // Filter out pull requests (they come with issues endpoint but have pull_request field)
      const filteredIssues = issuesData.filter((issue: GitHubIssue & { pull_request?: unknown }) => !issue.pull_request)
      setIssues(filteredIssues)

      // Fetch Releases
      const releasesResponse = await fetch(`https://api.github.com/repos/${targetRepo}/releases?per_page=10`, { headers })
      if (!releasesResponse.ok) throw new Error(`Failed to fetch releases: ${releasesResponse.statusText}`)
      const releasesData = await releasesResponse.json()
      setReleases(releasesData)

      // Fetch Contributors
      const contributorsResponse = await fetch(`https://api.github.com/repos/${targetRepo}/contributors?per_page=20`, { headers })
      if (!contributorsResponse.ok) throw new Error(`Failed to fetch contributors: ${contributorsResponse.statusText}`)
      const contributorsData = await contributorsResponse.json()
      setContributors(contributorsData)

      // Cache the fetched data using the calculated counts
      setCachedData(targetRepo, {
        repoInfo: repoData,
        prs: allPRs,
        issues: filteredIssues,
        releases: releasesData,
        contributors: contributorsData,
        openPRCount: openPRsData.length,
        openIssueCount: calculatedOpenIssueCount,
      })

      setLastRefresh(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch GitHub data'
      console.error('GitHub API error:', err)

      // Try to use stale cache as fallback (ignore TTL)
      try {
        const cachedStr = localStorage.getItem(CACHE_KEY_PREFIX + targetRepo.replace('/', '_'))
        if (cachedStr) {
          const cached = JSON.parse(cachedStr) as CachedGitHubData
          setRepoInfo(cached.repoInfo)
          setPRs(cached.prs)
          setIssues(cached.issues)
          setReleases(cached.releases)
          setContributors(cached.contributors)
          setOpenPRCount(cached.openPRCount)
          setOpenIssueCount(cached.openIssueCount)
          setLastRefresh(new Date(cached.timestamp))
          // Show warning that we're using cached data
          setError(`Using cached data (${formatTimeAgo(new Date(cached.timestamp).toISOString())}). ${errorMessage}`)
          return
        }
      } catch {
        // Cache read failed, show original error
      }

      setError(errorMessage)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchGitHubData()
    // Auto-refresh every 60 seconds (bypasses cache for fresh data)
    const interval = setInterval(() => fetchGitHubData(true), 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reposKey, org])

  return {
    prs,
    issues,
    releases,
    contributors,
    repoInfo,
    isLoading,
    isRefreshing,
    error,
    lastRefresh,
    openPRCount,
    openIssueCount,
    refetch: () => fetchGitHubData(true),
  }
}

// Sort comparators for GitHub items (open-first sorting applied separately after)
const SORT_COMPARATORS: Record<SortByOption, (a: GitHubItem, b: GitHubItem) => number> = {
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
  },
}

// Custom search predicate for GitHub items (handles heterogeneous item types)
function githubSearchPredicate(item: GitHubItem, query: string): boolean {
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

// Expose refresh method for CardWrapper
export interface GitHubActivityRef {
  refresh: () => void
}

export const GitHubActivity = forwardRef<GitHubActivityRef, { config?: GitHubActivityConfig }>(function GitHubActivity({ config }, ref) {
  const [viewMode, setViewMode] = useState<ViewMode>('prs')
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>(config?.timeRange || '30d')

  // Multi-repo state - inline CRUD pattern (matching GitHubCIMonitor)
  const [savedRepos, setSavedRepos] = useState<string[]>(() => getSavedRepos())
  const [currentRepo, setCurrentRepo] = useState<string>(() => {
    return localStorage.getItem(CURRENT_REPO_KEY) || savedRepos[0] || DEFAULT_REPO
  })
  const [repoInput, setRepoInput] = useState('')
  const [isEditingRepos, setIsEditingRepos] = useState(false)

  // Use current repo for data fetching
  const effectiveConfig = useMemo(() => {
    return { ...config, repos: [currentRepo] }
  }, [config, currentRepo])

  const {
    prs,
    issues,
    releases,
    contributors,
    repoInfo,
    isLoading,
    error,
    openPRCount,
    openIssueCount,
    refetch,
  } = useGitHubActivity(effectiveConfig)

  useCardLoadingState({ isLoading, hasAnyData: !!repoInfo })

  // Expose refresh method via ref for CardWrapper refresh button
  useImperativeHandle(ref, () => ({
    refresh: () => refetch()
  }), [refetch])

  // Select a repo from the list
  const handleSelectRepo = useCallback((repo: string) => {
    setCurrentRepo(repo)
    localStorage.setItem(CURRENT_REPO_KEY, repo)
  }, [])

  // Add a new repo to saved list (inline CRUD)
  const handleAddRepo = useCallback(() => {
    const repo = repoInput.trim()
    if (!repo) return
    // Validate format: owner/repo
    if (!repo.match(/^[\w-]+\/[\w.-]+$/)) return
    if (savedRepos.includes(repo)) {
      setRepoInput('')
      return
    }
    const newRepos = [...savedRepos, repo]
    setSavedRepos(newRepos)
    saveRepos(newRepos)
    setCurrentRepo(repo)
    localStorage.setItem(CURRENT_REPO_KEY, repo)
    setRepoInput('')
  }, [repoInput, savedRepos])

  // Remove a repo from saved list
  const handleRemoveRepo = useCallback((repo: string) => {
    const newRepos = savedRepos.filter(r => r !== repo)
    if (newRepos.length === 0) return // Keep at least one repo
    setSavedRepos(newRepos)
    saveRepos(newRepos)
    if (currentRepo === repo) {
      setCurrentRepo(newRepos[0])
      localStorage.setItem(CURRENT_REPO_KEY, newRepos[0])
    }
  }, [savedRepos, currentRepo])

  // Pre-filter data by viewMode and timeRange before passing to useCardData
  const preFilteredData = useMemo(() => {
    const now = Date.now()
    const rangeMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    }[timeRange]

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
  }, [viewMode, prs, issues, releases, contributors, timeRange])

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: rawPaginatedItems,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: searchQuery,
      setSearch: setSearchQuery,
    },
    sorting,
  } = useCardData<GitHubItem, SortByOption>(preFilteredData, {
    filter: {
      searchFields: [] as (keyof GitHubItem)[],
      customPredicate: githubSearchPredicate,
      storageKey: 'github-activity',
    },
    sort: {
      defaultField: 'date',
      defaultDirection: 'desc' as SortDirection,
      comparators: SORT_COMPARATORS,
    },
    defaultLimit: 10,
  })

  // Always show open items first (regardless of sort direction)
  // This is a stable sort that preserves the relative order within each group
  const paginatedItems = useMemo(() => {
    if (viewMode === 'contributors' || viewMode === 'releases') {
      return rawPaginatedItems // No open/closed concept for these
    }
    return [...rawPaginatedItems].sort((a, b) => {
      const aUnknown = a as unknown as GitHubItemUnknown
      const bUnknown = b as unknown as GitHubItemUnknown
      const aOpen = aUnknown.state === 'open' ? 0 : 1
      const bOpen = bUnknown.state === 'open' ? 0 : 1
      return aOpen - bOpen // Open (0) comes before closed (1)
    })
  }, [rawPaginatedItems, viewMode])

  // Calculate stats - use accurate counts from fetched data
  const stats = useMemo(() => {
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
      totalContributors: contributors.length,
    }
  }, [prs, issues, contributors, repoInfo, openPRCount, openIssueCount])

  if (isLoading && !repoInfo) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-3">
          <Skeleton variant="text" width={150} height={16} />
          <Skeleton variant="rounded" width={100} height={28} />
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
          <Skeleton variant="rounded" height={60} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
          <Skeleton variant="rounded" height={70} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col content-loaded">
        {/* Header with inline repo editor */}
        <div className="flex items-center justify-between mb-3">
          <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
            Error
          </span>
          <button
            onClick={() => setIsEditingRepos(!isEditingRepos)}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
              isEditingRepos && "text-purple-400"
            )}
            title="Configure repos"
          >
            {currentRepo}
            <Settings className="w-3 h-3" />
          </button>
        </div>

        {/* Inline repo editor */}
        {isEditingRepos && (
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
                placeholder="owner/repo (e.g., facebook/react)"
                className="flex-1 px-2 py-1 text-xs rounded bg-secondary border border-border text-foreground"
              />
              <button
                onClick={handleAddRepo}
                disabled={!repoInput.trim()}
                className="p-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add repo"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsEditingRepos(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                title="Done"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {savedRepos.map((repo) => (
                <span
                  key={repo}
                  onClick={() => handleSelectRepo(repo)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors",
                    repo === currentRepo
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
                      : "bg-purple-500/10 text-purple-400/70 border border-purple-500/20 hover:bg-purple-500/20"
                  )}
                >
                  {repo === currentRepo && <AlertCircle className="w-3 h-3" />}
                  {repo}
                  {savedRepos.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveRepo(repo) }}
                      className="hover:text-red-400 transition-colors"
                      title="Remove repo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Placeholder Stats Grid */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
            <div className="flex items-center gap-2 mb-1">
              <GitPullRequest className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Open PRs</span>
            </div>
            <div className="text-lg font-bold text-muted-foreground">--</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="w-4 h-4 text-green-400" />
              <span className="text-xs text-muted-foreground">Merged PRs</span>
            </div>
            <div className="text-lg font-bold text-muted-foreground">--</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Open Issues</span>
            </div>
            <div className="text-lg font-bold text-muted-foreground">--</div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-3 border border-border/50 opacity-50">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-xs text-muted-foreground">Stars</span>
            </div>
            <div className="text-lg font-bold text-muted-foreground">--</div>
          </div>
        </div>

        {/* Prominent error message */}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-sm text-foreground mb-2">Unable to load GitHub data</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">{error}</p>
          <button
            onClick={refetch}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
          <p className="mt-4 text-xs text-muted-foreground/70 max-w-xs">
            Tip: GitHub has rate limits for unauthenticated requests. Add a personal access token via localStorage for higher limits.
          </p>
        </div>
      </div>
    )
  }

  const effectivePerPage = itemsPerPage === 'unlimited' ? 1000 : itemsPerPage

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Row 1: Header with repo selector and controls - inline CRUD style */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {totalItems} items
          </span>
          <button
            onClick={() => setIsEditingRepos(!isEditingRepos)}
            className={cn(
              "text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1",
              isEditingRepos && "text-purple-400"
            )}
            title="Configure repos"
          >
            {repoInfo?.full_name || currentRepo}
            <Settings className="w-3 h-3" />
          </button>
        </div>
        <CardControlsRow
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
        />
      </div>

      {/* Inline repo editor (matching GitHubCIMonitor pattern) */}
      {isEditingRepos && (
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 mb-3 space-y-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
              placeholder="owner/repo (e.g., facebook/react)"
              className="flex-1 px-2 py-1 text-xs rounded bg-secondary border border-border text-foreground"
            />
            <button
              onClick={handleAddRepo}
              disabled={!repoInput.trim()}
              className="p-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Add repo"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsEditingRepos(false)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
              title="Done"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {savedRepos.map((repo) => (
              <span
                key={repo}
                onClick={() => handleSelectRepo(repo)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-colors",
                  repo === currentRepo
                    ? "bg-purple-500/30 text-purple-400 border border-purple-500/50"
                    : "bg-purple-500/10 text-purple-400/70 border border-purple-500/20 hover:bg-purple-500/20"
                )}
              >
                {repo}
                {savedRepos.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveRepo(repo) }}
                    className="hover:text-red-400 transition-colors"
                    title="Remove repo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Row 2: Search input */}
      <CardSearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder={`Search ${viewMode}...`}
        className="mb-2 flex-shrink-0"
      />

      {/* Row 3: View Mode Tabs (act as filter pills) */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setViewMode('prs')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
            viewMode === 'prs'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <GitPullRequest className="w-3 h-3 inline mr-1" />
          Pull Requests
        </button>
        <button
          onClick={() => setViewMode('issues')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
            viewMode === 'issues'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <AlertCircle className="w-3 h-3 inline mr-1" />
          Issues
        </button>
        <button
          onClick={() => setViewMode('releases')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
            viewMode === 'releases'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <Package className="w-3 h-3 inline mr-1" />
          Releases
        </button>
        <button
          onClick={() => setViewMode('contributors')}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap',
            viewMode === 'contributors'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <Users className="w-3 h-3 inline mr-1" />
          Contributors
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 flex-shrink-0">
        <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <GitPullRequest className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Open PRs</span>
          </div>
          <div className="text-lg font-bold">{stats.openPRs}</div>
          {stats.stalePRs > 0 && (
            <div className="text-xs text-yellow-400 mt-1">{stats.stalePRs} stale</div>
          )}
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-green-400" />
            <span className="text-xs text-muted-foreground">Merged PRs</span>
          </div>
          <div className="text-lg font-bold">{stats.mergedPRs}</div>
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-muted-foreground">Open Issues</span>
          </div>
          <div className="text-lg font-bold">{stats.openIssues}</div>
          {stats.staleIssues > 0 && (
            <div className="text-xs text-yellow-400 mt-1">{stats.staleIssues} stale</div>
          )}
        </div>
        <div className="bg-secondary/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-muted-foreground">Stars</span>
          </div>
          <div className="text-lg font-bold">{stats.stars}</div>
        </div>
      </div>

      {/* Time Range Controls */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Time Range:</span>
        {TIME_RANGES.map(range => (
          <button
            key={range.value}
            onClick={() => setTimeRange(range.value)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              timeRange === range.value
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:bg-secondary/50'
            )}
          >
            {range.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin min-h-0">
        {paginatedItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No {viewMode} found{searchQuery ? ' matching search' : ' for this time range'}
          </div>
        ) : (
          paginatedItems.map((item) => {
            const itemUnknown = item as unknown as GitHubItemUnknown
            if (viewMode === 'prs') {
              return <PRItem key={itemUnknown.number as number} pr={item as GitHubPR} />
            } else if (viewMode === 'issues') {
              return <IssueItem key={itemUnknown.number as number} issue={item as GitHubIssue} />
            } else if (viewMode === 'releases') {
              return <ReleaseItem key={itemUnknown.id as number} release={item as GitHubRelease} />
            } else if (viewMode === 'contributors') {
              return <ContributorItem key={itemUnknown.login as string} contributor={item as GitHubContributor} />
            }
            return null
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={effectivePerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />
    </div>
  )
})

// Sub-components for rendering different item types
function PRItem({ pr }: { pr: GitHubPR }) {
  const isOpen = pr.state === 'open'
  const isMerged = pr.merged_at != null
  const isStaleItem = isOpen && isStale(pr.updated_at)

  const statusText = isMerged ? 'Merged' : isOpen ? 'Open' : 'Closed'
  const statusTitle = isMerged ? 'Merged pull request' : isOpen ? 'Open pull request' : 'Closed pull request (not merged)'

  return (
    <a
      href={pr.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block p-3 rounded-lg hover:bg-secondary/40 border transition-colors",
        isOpen
          ? "bg-green-500/5 border-green-500/20 hover:border-green-500/30"
          : isMerged
            ? "bg-purple-500/5 border-purple-500/20 hover:border-purple-500/30"
            : "bg-secondary/20 border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5" title={statusTitle}>
          {isMerged ? (
            <GitMerge className="w-4 h-4 text-purple-400" />
          ) : isOpen ? (
            <GitPullRequest className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">#{pr.number} {pr.title}</span>
            {/* Status badge */}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              isMerged
                ? "bg-purple-500/20 text-purple-400"
                : isOpen
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
            )}>
              {statusText}
            </span>
            {pr.draft && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 shrink-0">Draft</span>
            )}
            {isStaleItem && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 shrink-0">Stale</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={pr.user.avatar_url} alt={pr.user.login} className="w-4 h-4 rounded-full" />
              {pr.user.login}
            </span>
            <span className="flex items-center gap-1" title={`Updated ${formatTimeAgo(pr.updated_at)}`}>
              <Clock className="w-3 h-3" />
              {formatTimeAgo(pr.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

function IssueItem({ issue }: { issue: GitHubIssue }) {
  const isOpen = issue.state === 'open'
  const isStaleItem = isOpen && isStale(issue.updated_at)

  return (
    <a
      href={issue.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block p-3 rounded-lg hover:bg-secondary/40 border transition-colors",
        isOpen
          ? "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/30"
          : "bg-secondary/20 border-border/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5" title={isOpen ? "Open issue" : "Closed issue"}>
          {isOpen ? (
            <AlertCircle className="w-4 h-4 text-orange-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">#{issue.number} {issue.title}</span>
            {/* Status badge - show Open or Closed */}
            <span className={cn(
              "text-xs px-2 py-0.5 rounded shrink-0",
              isOpen
                ? "bg-orange-500/20 text-orange-400"
                : "bg-green-500/20 text-green-400"
            )}>
              {isOpen ? 'Open' : 'Closed'}
            </span>
            {isStaleItem && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 shrink-0">Stale</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={issue.user.avatar_url} alt={issue.user.login} className="w-4 h-4 rounded-full" />
              {issue.user.login}
            </span>
            <span className="flex items-center gap-1" title={`Updated ${formatTimeAgo(issue.updated_at)}`}>
              <Clock className="w-3 h-3" />
              {formatTimeAgo(issue.updated_at)}
            </span>
            {issue.comments > 0 && (
              <span title={`${issue.comments} comments`}>{issue.comments} comments</span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

function ReleaseItem({ release }: { release: GitHubRelease }) {
  return (
    <a
      href={release.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Package className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">{release.name || release.tag_name}</span>
            {release.prerelease && (
              <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">Pre-release</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{release.author.login}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(release.published_at)}
            </span>
          </div>
        </div>
      </div>
    </a>
  )
}

function ContributorItem({ contributor }: { contributor: GitHubContributor }) {
  return (
    <a
      href={contributor.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <img src={contributor.avatar_url} alt={contributor.login} className="w-10 h-10 rounded-full" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{contributor.login}</div>
          <div className="text-xs text-muted-foreground">
            {contributor.contributions} contributions
          </div>
        </div>
        <TrendingUp className="w-4 h-4 text-green-400" />
      </div>
    </a>
  )
}
