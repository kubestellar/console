import { MS_PER_HOUR, MS_PER_DAY } from '../../lib/constants/time'
import type { GitHubPR, GitHubIssue, GitHubRelease, GitHubContributor, GitHubRepo } from './GitHubActivity.types'

const GITHUB_ACTIVITY_MAX_AGE_MS = 14 * MS_PER_DAY

function isStale(date: string): boolean {
  const ageMs = Date.now() - new Date(date).getTime()
  return ageMs > GITHUB_ACTIVITY_MAX_AGE_MS
}


// Default repository to show if none configured
const DEFAULT_REPO = 'kubestellar/console'

// LocalStorage keys for saved repos
const SAVED_REPOS_STORAGE_KEY = 'github_activity_saved_repos'
const CURRENT_REPO_STORAGE_KEY = 'github_activity_repo'

// Get saved repos from localStorage
function getSavedRepos(): string[] {
  if (typeof window === 'undefined') return [DEFAULT_REPO]
  try {
    const saved = localStorage.getItem(SAVED_REPOS_STORAGE_KEY)
    return saved ? JSON.parse(saved) : [DEFAULT_REPO]
  } catch {
    return [DEFAULT_REPO]
  }
}

// Save repos to localStorage
function saveRepos(repos: string[]) {
  try {
    localStorage.setItem(SAVED_REPOS_STORAGE_KEY, JSON.stringify(repos))
  } catch {
    // Silently ignore quota errors or private browsing restrictions
  }
}

// Demo data for GitHub Activity card
/**
 * Build an Error for a failed /api/github/* fetch that prefers the proxy's
 * JSON body `error` field over response.statusText (#8307). The console proxy
 * returns context-rich 429 messages like "Console proxy rate limit exceeded
 * (not GitHub)." that never reached users when we only read statusText.
 */
async function githubFetchError(response: Response, label: string): Promise<Error> {
  try {
    const body = await response.clone().json()
    if (body && typeof body.error === 'string' && body.error) {
      return new Error(`${label}: ${body.error}`)
    }
  } catch {
    // Fall through to statusText
  }
  return new Error(`${label}: ${response.statusText || response.status}`)
}

function getDemoGitHubData(repoName: string) {
  const now = new Date()
  const daysAgo = (d: number) => new Date(now.getTime() - d * MS_PER_DAY).toISOString()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * MS_PER_HOUR).toISOString()
  const demoUser = { login: 'demo-user', avatar_url: 'https://github.com/ghost.png' }
  const prs: GitHubPR[] = [
    { number: 842, title: 'feat: Add multi-cluster GPU scheduling', state: 'open', merged_at: null, created_at: hoursAgo(2), updated_at: hoursAgo(1), user: demoUser, html_url: '#', draft: false, labels: [{ name: 'enhancement', color: 'a2eeef' }] },
    { number: 841, title: 'fix: Resolve SSE reconnection on timeout', state: 'closed', merged_at: hoursAgo(4), created_at: daysAgo(1), updated_at: hoursAgo(4), user: { login: 'contributor-1', avatar_url: 'https://github.com/ghost.png' }, html_url: '#', draft: false, labels: [{ name: 'bug', color: 'd73a4a' }] },
    { number: 840, title: 'docs: Update deployment guide for v0.9', state: 'closed', merged_at: hoursAgo(8), created_at: daysAgo(2), updated_at: hoursAgo(8), user: { login: 'doc-writer', avatar_url: 'https://github.com/ghost.png' }, html_url: '#', draft: false, labels: [{ name: 'documentation', color: '0075ca' }] },
    { number: 839, title: 'feat: Dashboard card preloading optimization', state: 'closed', merged_at: daysAgo(1), created_at: daysAgo(3), updated_at: daysAgo(1), user: demoUser, html_url: '#', draft: false, labels: [{ name: 'performance', color: 'fbca04' }] },
    { number: 838, title: 'chore: Upgrade React to v19', state: 'open', merged_at: null, created_at: daysAgo(5), updated_at: daysAgo(2), user: { login: 'maintainer', avatar_url: 'https://github.com/ghost.png' }, html_url: '#', draft: true, labels: [{ name: 'dependencies', color: '0366d6' }] },
  ]
  const issues: GitHubIssue[] = [
    { number: 201, title: 'Card skeleton flickers on fast connections', state: 'open', created_at: hoursAgo(6), updated_at: hoursAgo(3), user: demoUser, html_url: '#', labels: [{ name: 'bug', color: 'd73a4a' }], comments: 4 },
    { number: 200, title: 'Add Prometheus metrics export', state: 'open', created_at: daysAgo(3), updated_at: daysAgo(1), user: { login: 'feature-req', avatar_url: 'https://github.com/ghost.png' }, html_url: '#', labels: [{ name: 'enhancement', color: 'a2eeef' }], comments: 7 },
    { number: 199, title: 'Dark mode contrast issues on Alerts card', state: 'closed', created_at: daysAgo(7), updated_at: daysAgo(2), closed_at: daysAgo(2), user: { login: 'ui-tester', avatar_url: 'https://github.com/ghost.png' }, html_url: '#', labels: [{ name: 'accessibility', color: 'c5def5' }], comments: 2 },
  ]
  const releases: GitHubRelease[] = [
    { id: 1, tag_name: 'v0.9.0', name: 'v0.9.0 - Multi-Cluster Dashboard', published_at: daysAgo(5), html_url: '#', author: { login: 'release-bot' }, prerelease: false },
    { id: 2, tag_name: 'v0.9.0-rc.1', name: 'v0.9.0-rc.1', published_at: daysAgo(12), html_url: '#', author: { login: 'release-bot' }, prerelease: true },
  ]
  const contributors: GitHubContributor[] = [
    { login: 'lead-dev', avatar_url: 'https://github.com/ghost.png', contributions: 342, html_url: '#' },
    { login: 'contributor-1', avatar_url: 'https://github.com/ghost.png', contributions: 128, html_url: '#' },
    { login: 'demo-user', avatar_url: 'https://github.com/ghost.png', contributions: 85, html_url: '#' },
    { login: 'doc-writer', avatar_url: 'https://github.com/ghost.png', contributions: 47, html_url: '#' },
  ]
  const repoInfo: GitHubRepo = {
    name: repoName.split('/')[1] || 'console',
    full_name: repoName,
    stargazers_count: 1247,
    open_issues_count: 23,
    html_url: '#' }
  return { prs, issues, releases, contributors, repoInfo, openPRCount: 2, openIssueCount: 2 }
}

// Custom hook for GitHub data fetching via useCache (SWR, demo fallback, persistence)

export {
  isStale,
  getSavedRepos,
  saveRepos,
  getDemoGitHubData,
  DEFAULT_REPO,
  SAVED_REPOS_STORAGE_KEY,
  CURRENT_REPO_STORAGE_KEY,
  githubFetchError,
}
