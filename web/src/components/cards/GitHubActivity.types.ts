export interface GitHubPR {
  number: number
  title: string
  state: 'open' | 'closed'
  merged_at: string | null
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

export interface GitHubIssue {
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

export interface GitHubRelease {
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

export interface GitHubContributor {
  login: string
  avatar_url: string
  contributions: number
  html_url: string
}

export interface GitHubRepo {
  name: string
  full_name: string
  stargazers_count: number
  open_issues_count: number
  html_url: string
}

export interface GitHubActivityConfig {
  repos?: string[]
  org?: string
  mode?: 'repo' | 'org' | 'multi-repo'
  token?: string
  timeRange?: '7d' | '30d' | '90d' | '1y'
}

export type ViewMode = 'prs' | 'issues' | 'stars' | 'contributors' | 'releases'
export type SortByOption = 'date' | 'activity' | 'status'

export type GitHubItem = GitHubPR | GitHubIssue | GitHubRelease | GitHubContributor
export type GitHubItemUnknown = Record<string, unknown>
