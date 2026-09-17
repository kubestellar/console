import { useMemo, useState } from 'react'
import { FETCH_EXTERNAL_TIMEOUT_MS } from '../../lib/constants/network'
import { useCache } from '../../lib/cache'
import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor, GitHubRepo, GitHubActivityConfig } from './GitHubActivity.types'
import { getSavedRepos, saveRepos, getDemoGitHubData, DEFAULT_REPO, CURRENT_REPO_STORAGE_KEY, githubFetchError } from './GitHubActivity.utils'

export interface GitHubActivityData {
  repoInfo: GitHubRepo | null
  prs: GitHubPR[]
  issues: GitHubIssue[]
  releases: GitHubRelease[]
  contributors: GitHubContributor[]
  openPRCount: number
  openIssueCount: number
}

export const INITIAL_GITHUB_DATA: GitHubActivityData = {
  repoInfo: null,
  prs: [],
  issues: [],
  releases: [],
  contributors: [],
  openPRCount: 0,
  openIssueCount: 0,
}

export function useGitHubActivity(config?: GitHubActivityConfig) {

  // Use configured repos or default to kubestellar/console
  const repos = config?.repos?.length ? config.repos : [DEFAULT_REPO]
  const targetRepo = repos[0] || DEFAULT_REPO

  const demoData = useMemo(() => getDemoGitHubData(targetRepo), [targetRepo])

  const {
    data,
    isLoading,
    isRefreshing,
    error,
    isDemoFallback,
    refetch,
  } = useCache<GitHubActivityData>({
    key: `github-activity-${targetRepo}`,
    category: 'default',
    initialData: INITIAL_GITHUB_DATA,
    demoData: demoData,
    persist: true,
    demoWhenEmpty: true,
    isEmpty: (d) => !d.repoInfo && d.prs.length === 0,
    fetcher: async () => {
      const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json' }
      const fetchOptions = { headers }

      // Fetch repository info
      const repoResponse = await fetch(`/api/github/repos/${targetRepo}`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (!repoResponse.ok) throw await githubFetchError(repoResponse, 'Failed to fetch repo')
      const repoData = await repoResponse.json().catch(() => null)
      if (!repoData) throw new Error('Failed to parse GitHub repo response: invalid JSON')

      // Fetch open PRs and closed/merged PRs separately
      const [openPRsResponse, closedPRsResponse] = await Promise.all([
        fetch(`/api/github/repos/${targetRepo}/pulls?state=open&per_page=50&sort=updated`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }),
        fetch(`/api/github/repos/${targetRepo}/pulls?state=closed&per_page=50&sort=updated`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      ])

      if (!openPRsResponse.ok) throw await githubFetchError(openPRsResponse, 'Failed to fetch open PRs')
      if (!closedPRsResponse.ok) throw await githubFetchError(closedPRsResponse, 'Failed to fetch closed PRs')

      const openPRsData = await openPRsResponse.json().catch(() => null)
      const closedPRsData = await closedPRsResponse.json().catch(() => null)
      if (!openPRsData || !closedPRsData) throw new Error('Failed to parse GitHub PR response: invalid JSON')

      const allPRs = [...(openPRsData || []), ...(closedPRsData || [])]
        .sort((a: GitHubPR, b: GitHubPR) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 100)

      // Fetch open Issues count and recent issues
      const [openIssuesResponse, recentIssuesResponse] = await Promise.all([
        fetch(`/api/github/repos/${targetRepo}/issues?state=open&per_page=1`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) }),
        fetch(`/api/github/repos/${targetRepo}/issues?state=all&per_page=50&sort=updated`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      ])

      let calculatedOpenIssueCount = 0
      if (openIssuesResponse.ok) {
        const linkHeader = openIssuesResponse.headers.get('Link')
        if (linkHeader) {
          const match = linkHeader.match(/page=(\d+)>; rel="last"/)
          calculatedOpenIssueCount = match ? parseInt(match[1], 10) : 1
        } else {
          const openIssues = await openIssuesResponse.json().catch(() => null)
          calculatedOpenIssueCount = (openIssues || []).filter((i: GitHubIssue & { pull_request?: unknown }) => !i.pull_request).length
        }
      }

      if (!recentIssuesResponse.ok) throw await githubFetchError(recentIssuesResponse, 'Failed to fetch issues')
      const issuesData: GitHubIssue[] = await recentIssuesResponse.json().catch(() => null) ?? []
      const filteredIssues = issuesData.filter((issue: GitHubIssue & { pull_request?: unknown }) => !issue.pull_request)

      // Fetch Releases
      const releasesResponse = await fetch(`/api/github/repos/${targetRepo}/releases?per_page=10`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (!releasesResponse.ok) throw await githubFetchError(releasesResponse, 'Failed to fetch releases')
      const releasesData = await releasesResponse.json().catch(() => null)
      if (!releasesData) throw new Error('Failed to parse GitHub releases response: invalid JSON')

      // Fetch Contributors
      const contributorsResponse = await fetch(`/api/github/repos/${targetRepo}/contributors?per_page=20`, { ...fetchOptions, signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS) })
      if (!contributorsResponse.ok) throw await githubFetchError(contributorsResponse, 'Failed to fetch contributors')
      const contributorsData = await contributorsResponse.json().catch(() => null)
      if (!contributorsData) throw new Error('Failed to parse GitHub contributors response: invalid JSON')

      return {
        repoInfo: repoData,
        prs: allPRs,
        issues: filteredIssues,
        releases: releasesData,
        contributors: contributorsData,
        openPRCount: (openPRsData || []).length,
        openIssueCount: calculatedOpenIssueCount,
      }
    },
  })

  return {
    prs: data.prs,
    issues: data.issues,
    releases: data.releases,
    contributors: data.contributors,
    repoInfo: data.repoInfo,
    isLoading,
    isRefreshing,
    error,
    lastRefresh: new Date(),
    openPRCount: data.openPRCount,
    openIssueCount: data.openIssueCount,
    isDemoData: isDemoFallback && !isLoading,
    refetch: () => refetch() }
}

// Multi-repo state - inline CRUD pattern (matching GitHubCIMonitor)
export function useGitHubRepoSelection() {
  const [savedRepos, setSavedRepos] = useState<string[]>(() => getSavedRepos())
  const [currentRepo, setCurrentRepo] = useState<string>(() => {
    try {
      return (typeof window !== 'undefined' && localStorage.getItem(CURRENT_REPO_STORAGE_KEY)) || getSavedRepos()[0] || DEFAULT_REPO
    } catch {
      return getSavedRepos()[0] || DEFAULT_REPO
    }
  })
  const [repoInput, setRepoInput] = useState('')
  const [isEditingRepos, setIsEditingRepos] = useState(false)

  // Select a repo from the list
  const handleSelectRepo = (repo: string) => {
    setCurrentRepo(repo)
    try { localStorage.setItem(CURRENT_REPO_STORAGE_KEY, repo) } catch { /* ignore quota errors */ }
  }

  // Add a new repo to saved list (inline CRUD)
  const handleAddRepo = () => {
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
    try { localStorage.setItem(CURRENT_REPO_STORAGE_KEY, repo) } catch { /* ignore quota errors */ }
    setRepoInput('')
  }

  // Remove a repo from saved list
  const handleRemoveRepo = (repo: string) => {
    const newRepos = savedRepos.filter(r => r !== repo)
    if (newRepos.length === 0) return // Keep at least one repo
    setSavedRepos(newRepos)
    saveRepos(newRepos)
    if (currentRepo === repo) {
      setCurrentRepo(newRepos[0])
      try { localStorage.setItem(CURRENT_REPO_STORAGE_KEY, newRepos[0]) } catch { /* ignore quota errors */ }
    }
  }

  return {
    savedRepos,
    currentRepo,
    repoInput,
    setRepoInput,
    isEditingRepos,
    setIsEditingRepos,
    handleSelectRepo,
    handleAddRepo,
    handleRemoveRepo }
}
