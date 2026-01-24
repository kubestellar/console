import { useState, useMemo, useEffect, useCallback } from 'react'
import { GitPullRequest, GitBranch, Star, Users, Package, TrendingUp, AlertCircle, Clock, CheckCircle, XCircle, GitMerge, Settings, X, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { Skeleton } from '../ui/Skeleton'
import { cn } from '../../lib/cn'

// Types for GitHub activity data
interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed'
  merged: boolean
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

// Default repository to show if none configured
const DEFAULT_REPO = 'kubestellar/kubestellar'

// Preset popular repos for quick selection
const PRESET_REPOS = [
  'kubestellar/kubestellar',
  'kubernetes/kubernetes',
  'facebook/react',
  'microsoft/vscode',
  'golang/go',
  'rust-lang/rust',
  'vercel/next.js',
  'openai/openai-python',
]

// LocalStorage key for saved repos
const SAVED_REPOS_KEY = 'github_activity_saved_repos'
const CURRENT_REPO_KEY = 'github_activity_repo'
const CACHE_KEY_PREFIX = 'github_activity_cache_'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes cache TTL

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
    console.warn('Failed to cache GitHub data:', e)
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

  // Use configured repos or default to kubestellar/kubestellar
  const repos = config?.repos?.length ? config.repos : [DEFAULT_REPO]
  const org = config?.org
  // Note: Token stored in localStorage - consider using sessionStorage or encrypted storage for production
  const token = config?.token || localStorage.getItem('github_token') || ''
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
      if (cached) {
        // Use cached data
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

      // Fetch open PRs count and recent PRs
      const [openPRsResponse, recentPRsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${targetRepo}/pulls?state=open&per_page=1`, { headers }),
        fetch(`https://api.github.com/repos/${targetRepo}/pulls?state=all&per_page=50&sort=updated`, { headers })
      ])

      // Get open PR count from Link header or response body
      let calculatedOpenPRCount = 0
      if (openPRsResponse.ok) {
        const linkHeader = openPRsResponse.headers.get('Link')
        if (linkHeader) {
          const match = linkHeader.match(/page=(\d+)>; rel="last"/)
          calculatedOpenPRCount = match ? parseInt(match[1], 10) : 1
        } else {
          const openPRs = await openPRsResponse.json()
          calculatedOpenPRCount = openPRs.length
        }
        setOpenPRCount(calculatedOpenPRCount)
      }

      if (!recentPRsResponse.ok) throw new Error(`Failed to fetch PRs: ${recentPRsResponse.statusText}`)
      const prsData = await recentPRsResponse.json()
      setPRs(prsData)

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
          calculatedOpenIssueCount = openIssues.filter((i: any) => !i.pull_request).length
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
        prs: prsData,
        issues: filteredIssues,
        releases: releasesData,
        contributors: contributorsData,
        openPRCount: calculatedOpenPRCount,
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

export function GitHubActivity({ config }: { config?: GitHubActivityConfig }) {
  const [viewMode, setViewMode] = useState<ViewMode>('prs')
  const [sortBy, setSortBy] = useState<SortByOption>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(10)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>(config?.timeRange || '30d')

  // Multi-repo state
  const [savedRepos, setSavedRepos] = useState<string[]>(() => getSavedRepos())
  const [currentRepo, setCurrentRepo] = useState<string>(() => {
    return localStorage.getItem(CURRENT_REPO_KEY) || savedRepos[0] || DEFAULT_REPO
  })
  const [repoInput, setRepoInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showRepoDropdown, setShowRepoDropdown] = useState(false)

  // Use current repo for data fetching
  const effectiveConfig = useMemo(() => {
    return { ...config, repos: [currentRepo] }
  }, [config, currentRepo])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showRepoDropdown) return
    const handleClickOutside = () => setShowRepoDropdown(false)
    // Add small delay to avoid immediate close on open click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showRepoDropdown])

  const {
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
    refetch,
  } = useGitHubActivity(effectiveConfig)

  // Select a repo from the list
  const handleSelectRepo = useCallback((repo: string) => {
    setCurrentRepo(repo)
    localStorage.setItem(CURRENT_REPO_KEY, repo)
    setShowRepoDropdown(false)
  }, [])

  // Add a new repo to saved list
  const handleAddRepo = useCallback(() => {
    const repo = repoInput.trim()
    if (repo && repo.includes('/') && !savedRepos.includes(repo)) {
      const newRepos = [...savedRepos, repo]
      setSavedRepos(newRepos)
      saveRepos(newRepos)
      setCurrentRepo(repo)
      localStorage.setItem(CURRENT_REPO_KEY, repo)
      setRepoInput('')
      setShowSettings(false)
    }
  }, [repoInput, savedRepos])

  // Remove a repo from saved list
  const handleRemoveRepo = useCallback((repo: string) => {
    const newRepos = savedRepos.filter(r => r !== repo)
    if (newRepos.length === 0) newRepos.push(DEFAULT_REPO)
    setSavedRepos(newRepos)
    saveRepos(newRepos)
    if (currentRepo === repo) {
      setCurrentRepo(newRepos[0])
      localStorage.setItem(CURRENT_REPO_KEY, newRepos[0])
    }
  }, [savedRepos, currentRepo])

  // Add preset repo
  const handleAddPreset = useCallback((repo: string) => {
    if (!savedRepos.includes(repo)) {
      const newRepos = [...savedRepos, repo]
      setSavedRepos(newRepos)
      saveRepos(newRepos)
    }
    setCurrentRepo(repo)
    localStorage.setItem(CURRENT_REPO_KEY, repo)
    setShowSettings(false)
  }, [savedRepos])

  // Filter and sort data based on view mode
  const filteredAndSorted = useMemo(() => {
    const now = Date.now()
    const rangeMs = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      '1y': 365 * 24 * 60 * 60 * 1000,
    }[timeRange]

    let data: any[] = []

    if (viewMode === 'prs') {
      data = prs.filter(pr => now - new Date(pr.updated_at).getTime() <= rangeMs)
      data.sort((a, b) => {
        if (sortBy === 'date') {
          return sortDirection === 'desc'
            ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            : new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        }
        if (sortBy === 'status') {
          const statusOrder = { open: 0, merged: 1, closed: 2 }
          const aStatus = a.merged ? 'merged' : a.state
          const bStatus = b.merged ? 'merged' : b.state
          return sortDirection === 'desc'
            ? statusOrder[bStatus as keyof typeof statusOrder] - statusOrder[aStatus as keyof typeof statusOrder]
            : statusOrder[aStatus as keyof typeof statusOrder] - statusOrder[bStatus as keyof typeof statusOrder]
        }
        return 0
      })
    } else if (viewMode === 'issues') {
      data = issues.filter(issue => now - new Date(issue.updated_at).getTime() <= rangeMs)
      data.sort((a, b) => {
        if (sortBy === 'date') {
          return sortDirection === 'desc'
            ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            : new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        }
        if (sortBy === 'activity') {
          return sortDirection === 'desc' ? b.comments - a.comments : a.comments - b.comments
        }
        return 0
      })
    } else if (viewMode === 'releases') {
      data = releases.filter(release => now - new Date(release.published_at).getTime() <= rangeMs)
      data.sort((a, b) => {
        return sortDirection === 'desc'
          ? new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
          : new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
      })
    } else if (viewMode === 'contributors') {
      data = contributors
      data.sort((a, b) => {
        return sortDirection === 'desc'
          ? b.contributions - a.contributions
          : a.contributions - b.contributions
      })
    }

    return data
  }, [viewMode, prs, issues, releases, contributors, sortBy, sortDirection, timeRange])

  const effectivePerPage = itemsPerPage === 'unlimited' ? 1000 : itemsPerPage
  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    needsPagination,
  } = usePagination(filteredAndSorted, effectivePerPage)

  // Calculate stats - use accurate counts from API when available
  const stats = useMemo(() => {
    // Use accurate counts from dedicated API calls
    const openPRs = openPRCount || prs.filter(pr => pr.state === 'open').length
    const mergedPRs = prs.filter(pr => pr.merged).length
    // For issues, use the repo's open_issues_count minus open PRs as it's more accurate
    const openIssues = repoInfo?.open_issues_count
      ? Math.max(0, repoInfo.open_issues_count - openPRs)
      : openIssueCount || issues.filter(issue => issue.state === 'open').length
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

  if (isLoading) {
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
        {/* Header with settings */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              GitHub Activity
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
              Error
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={cn(
                'p-1.5 rounded transition-colors',
                showSettings ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
              )}
              title="Add repositories"
            >
              <Plus className="w-4 h-4" />
            </button>
            <RefreshButton
              isRefreshing={isRefreshing}
              lastRefresh={lastRefresh}
              onRefresh={refetch}
            />
          </div>
        </div>

        {/* Placeholder Stats Grid - shows even in error state */}
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

        {/* Repository selector */}
        <div className="mb-3">
          <span className="text-xs text-muted-foreground block mb-2">Your repositories:</span>
          <div className="flex flex-wrap gap-1">
            {savedRepos.map(repo => (
              <span
                key={repo}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border cursor-pointer transition-colors',
                  repo === currentRepo
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-secondary/50 border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
                onClick={() => handleSelectRepo(repo)}
                title={repo === currentRepo ? 'Currently selected (error)' : `Switch to ${repo}`}
              >
                {repo === currentRepo && <AlertCircle className="w-3 h-3" />}
                {repo}
                {savedRepos.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveRepo(repo) }}
                    className="hover:text-red-400 ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Settings Panel for adding repos */}
        {showSettings && (
          <div className="mb-3 p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Add Repository</span>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Add custom repo */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo (e.g., facebook/react)"
                className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
              />
              <button
                onClick={handleAddRepo}
                disabled={!repoInput.trim() || !repoInput.includes('/')}
                className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>

            {/* Preset repos */}
            {PRESET_REPOS.filter(r => !savedRepos.includes(r)).length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground block mb-2">Popular repositories:</span>
                <div className="flex flex-wrap gap-1">
                  {PRESET_REPOS.filter(r => !savedRepos.includes(r)).slice(0, 4).map(repo => (
                    <button
                      key={repo}
                      onClick={() => handleAddPreset(repo)}
                      className="px-2 py-1 text-xs rounded-full bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      + {repo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

  return (
    <div className="h-full flex flex-col content-loaded">
      {/* Header with Repo Picker */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setShowRepoDropdown(!showRepoDropdown)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {repoInfo?.full_name || currentRepo || 'Select Repo'}
            <ChevronDown className={cn('w-4 h-4 transition-transform', showRepoDropdown && 'rotate-180')} />
          </button>
          {repoInfo && (
            <a
              href={repoInfo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              View on GitHub
            </a>
          )}
          {/* Repo Dropdown */}
          {showRepoDropdown && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                {savedRepos.map(repo => (
                  <div
                    key={repo}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-secondary/50',
                      repo === currentRepo && 'bg-primary/10 text-primary'
                    )}
                  >
                    <span
                      onClick={() => handleSelectRepo(repo)}
                      className="flex-1 truncate"
                    >
                      {repo}
                    </span>
                    {savedRepos.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveRepo(repo) }}
                        className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-red-400"
                        title="Remove from list"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-2">
                <button
                  onClick={() => { setShowRepoDropdown(false); setShowSettings(true) }}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded"
                >
                  <Plus className="w-3 h-3" />
                  Add repository...
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Configure repositories"
          >
            <Settings className="w-4 h-4" />
          </button>
          <RefreshButton
            isRefreshing={isRefreshing}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
          />
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-4 p-3 rounded-lg bg-secondary/30 border border-border/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">Manage Repositories</span>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1 rounded hover:bg-secondary text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Add custom repo */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo (e.g., facebook/react)"
              className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleAddRepo()}
            />
            <button
              onClick={handleAddRepo}
              disabled={!repoInput.trim() || !repoInput.includes('/')}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {/* Saved repos */}
          <div className="mb-3">
            <span className="text-xs text-muted-foreground block mb-2">Your saved repositories:</span>
            <div className="flex flex-wrap gap-1">
              {savedRepos.map(repo => (
                <span
                  key={repo}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border',
                    repo === currentRepo
                      ? 'bg-primary/20 border-primary/50 text-primary'
                      : 'bg-secondary/50 border-border text-muted-foreground'
                  )}
                >
                  <button
                    onClick={() => handleSelectRepo(repo)}
                    className="hover:underline"
                  >
                    {repo}
                  </button>
                  {savedRepos.length > 1 && (
                    <button
                      onClick={() => handleRemoveRepo(repo)}
                      className="hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Preset repos */}
          <div className="mb-3">
            <span className="text-xs text-muted-foreground block mb-2">Popular repositories:</span>
            <div className="flex flex-wrap gap-1">
              {PRESET_REPOS.filter(r => !savedRepos.includes(r)).slice(0, 6).map(repo => (
                <button
                  key={repo}
                  onClick={() => handleAddPreset(repo)}
                  className="px-2 py-1 text-xs rounded-full bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  + {repo}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: Add a GitHub token via <code className="px-1 bg-secondary rounded">localStorage.setItem('github_token', 'ghp_...')</code> for higher rate limits.
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
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

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto">
        <button
          onClick={() => setViewMode('prs')}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap',
            viewMode === 'prs'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
          )}
        >
          <GitPullRequest className="w-3 h-3 inline mr-1" />
          Pull Requests
        </button>
        <button
          onClick={() => setViewMode('issues')}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap',
            viewMode === 'issues'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
          )}
        >
          <AlertCircle className="w-3 h-3 inline mr-1" />
          Issues
        </button>
        <button
          onClick={() => setViewMode('releases')}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap',
            viewMode === 'releases'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
          )}
        >
          <Package className="w-3 h-3 inline mr-1" />
          Releases
        </button>
        <button
          onClick={() => setViewMode('contributors')}
          className={cn(
            'px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap',
            viewMode === 'contributors'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
          )}
        >
          <Users className="w-3 h-3 inline mr-1" />
          Contributors
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
        <CardControls
          limit={itemsPerPage}
          onLimitChange={setItemsPerPage}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSortBy}
          sortDirection={sortDirection}
          onSortDirectionChange={setSortDirection}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
        {paginatedItems.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No {viewMode} found for this time range
          </div>
        ) : (
          paginatedItems.map((item: any) => {
            if (viewMode === 'prs') {
              return <PRItem key={item.number} pr={item} />
            } else if (viewMode === 'issues') {
              return <IssueItem key={item.number} issue={item} />
            } else if (viewMode === 'releases') {
              return <ReleaseItem key={item.id} release={item} />
            } else if (viewMode === 'contributors') {
              return <ContributorItem key={item.login} contributor={item} />
            }
            return null
          })
        )}
      </div>

      {/* Pagination */}
      {needsPagination && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={effectivePerPage}
            onPageChange={goToPage}
          />
        </div>
      )}
    </div>
  )
}

// Sub-components for rendering different item types
function PRItem({ pr }: { pr: GitHubPR }) {
  const isOpen = pr.state === 'open'
  const isMerged = pr.merged
  const isStaleItem = isOpen && isStale(pr.updated_at)

  return (
    <a
      href={pr.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
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
            {pr.draft && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400">Draft</span>
            )}
            {isStaleItem && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Stale</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={pr.user.avatar_url} alt={pr.user.login} className="w-4 h-4 rounded-full" />
              {pr.user.login}
            </span>
            <span className="flex items-center gap-1">
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
      className="block p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 border border-border/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {isOpen ? (
            <AlertCircle className="w-4 h-4 text-orange-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">#{issue.number} {issue.title}</span>
            {isStaleItem && (
              <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Stale</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <img src={issue.user.avatar_url} alt={issue.user.login} className="w-4 h-4 rounded-full" />
              {issue.user.login}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimeAgo(issue.updated_at)}
            </span>
            {issue.comments > 0 && (
              <span>{issue.comments} comments</span>
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
