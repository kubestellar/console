import { MS_PER_HOUR } from '../../lib/constants/time'

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

const GITHUB_ACTIVITY_MAX_AGE_MS = 30 * MS_PER_DAY

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
