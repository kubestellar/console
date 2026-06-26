/**
 * Pure Vitest unit tests for GitHubActivity.utils.ts
 * Covers isStale boundaries, githubFetchError (#8307), localStorage repos, demo data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_PER_DAY } from '../../../lib/constants/time'
import {
  DEFAULT_REPO,
  CURRENT_REPO_STORAGE_KEY,
  SAVED_REPOS_STORAGE_KEY,
  getDemoGitHubData,
  getSavedRepos,
  githubFetchError,
  isStale,
  saveRepos,
} from '../GitHubActivity.utils'

function makeStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial }
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  } as Storage
}

// ─── isStale (14-day boundary) ───────────────────────────────────────────────

describe('isStale', () => {
  const FIXED_NOW = new Date('2026-05-21T12:00:00Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false when updated exactly 14 days ago (boundary, not stale)', () => {
    const exactly14DaysAgo = new Date(FIXED_NOW.getTime() - 14 * MS_PER_DAY).toISOString()
    expect(isStale(exactly14DaysAgo)).toBe(false)
  })

  it('returns false when updated 13 days ago (1 day under boundary)', () => {
    const thirteenDaysAgo = new Date(FIXED_NOW.getTime() - 13 * MS_PER_DAY).toISOString()
    expect(isStale(thirteenDaysAgo)).toBe(false)
  })

  it('returns true when updated 15 days ago (1 day over boundary)', () => {
    const fifteenDaysAgo = new Date(FIXED_NOW.getTime() - 15 * MS_PER_DAY).toISOString()
    expect(isStale(fifteenDaysAgo)).toBe(true)
  })

  it('returns true when updated more than 14 days ago', () => {
    const twentyDaysAgo = new Date(FIXED_NOW.getTime() - 20 * MS_PER_DAY).toISOString()
    expect(isStale(twentyDaysAgo)).toBe(true)
  })
})

// ─── githubFetchError (#8307 JSON .error vs statusText) ─────────────────────

describe('githubFetchError', () => {
  it('uses JSON body error field when present', async () => {
    const response = new Response(
      JSON.stringify({ error: 'Console proxy rate limit exceeded (not GitHub).' }),
      { status: 429, statusText: 'Too Many Requests' },
    )
    const err = await githubFetchError(response, 'Failed to fetch repo')
    expect(err.message).toBe(
      'Failed to fetch repo: Console proxy rate limit exceeded (not GitHub).',
    )
  })

  it('falls back to statusText when JSON has no error field', async () => {
    const response = new Response(JSON.stringify({ message: 'other' }), {
      status: 500,
      statusText: 'Internal Server Error',
    })
    const err = await githubFetchError(response, 'Failed to fetch open PRs')
    expect(err.message).toBe('Failed to fetch open PRs: Internal Server Error')
  })

  it('falls back to statusText when body is not JSON', async () => {
    const response = new Response('not json', { status: 502, statusText: 'Bad Gateway' })
    const err = await githubFetchError(response, 'Failed to fetch issues')
    expect(err.message).toBe('Failed to fetch issues: Bad Gateway')
  })

  it('falls back to status when statusText is empty', async () => {
    const response = new Response('', { status: 503, statusText: '' })
    const err = await githubFetchError(response, 'Failed to fetch releases')
    expect(err.message).toBe('Failed to fetch releases: 503')
  })

  it('falls back to statusText when JSON error field is empty string', async () => {
    const response = new Response(JSON.stringify({ error: '' }), {
      status: 403,
      statusText: 'Forbidden',
    })
    const err = await githubFetchError(response, 'Failed to fetch contributors')
    expect(err.message).toBe('Failed to fetch contributors: Forbidden')
  })
})

// ─── getSavedRepos / saveRepos (localStorage) ────────────────────────────────

describe('getSavedRepos / saveRepos', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns default repo when localStorage is empty', () => {
    expect(getSavedRepos()).toEqual([DEFAULT_REPO])
  })

  it('round-trips repos via saveRepos and getSavedRepos', () => {
    const repos = ['kubestellar/console', 'facebook/react']
    saveRepos(repos)
    expect(getSavedRepos()).toEqual(repos)
    expect(localStorage.getItem(SAVED_REPOS_STORAGE_KEY)).toBe(JSON.stringify(repos))
  })

  it('returns default repo when stored JSON is malformed', () => {
    localStorage.setItem(SAVED_REPOS_STORAGE_KEY, 'not-json{{{')
    expect(getSavedRepos()).toEqual([DEFAULT_REPO])
  })

  it('returns default repo when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined)
    expect(getSavedRepos()).toEqual([DEFAULT_REPO])
  })

  it('saveRepos silently ignores localStorage quota errors', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => { throw new Error('QuotaExceededError') },
      getItem: () => null,
    })
    expect(() => saveRepos(['org/repo'])).not.toThrow()
  })
})

describe('CURRENT_REPO_STORAGE_KEY', () => {
  it('exports the expected localStorage key for current repo selection', () => {
    expect(CURRENT_REPO_STORAGE_KEY).toBe('github_activity_repo')
  })
})

// ─── getDemoGitHubData ───────────────────────────────────────────────────────

describe('getDemoGitHubData', () => {
  it('returns expected demo shape for a given repo name', () => {
    const data = getDemoGitHubData('kubestellar/console')

    expect(data.prs.length).toBeGreaterThan(0)
    expect(data.issues.length).toBeGreaterThan(0)
    expect(data.releases.length).toBeGreaterThan(0)
    expect(data.contributors.length).toBeGreaterThan(0)
    expect(data.repoInfo.full_name).toBe('kubestellar/console')
    expect(data.repoInfo.name).toBe('console')
    expect(data.openPRCount).toBe(2)
    expect(data.openIssueCount).toBe(2)
    expect(data.repoInfo.stargazers_count).toBeGreaterThan(0)
  })

  it('uses repo segment as name when full_name has owner/repo', () => {
    const data = getDemoGitHubData('facebook/react')
    expect(data.repoInfo.full_name).toBe('facebook/react')
    expect(data.repoInfo.name).toBe('react')
  })
})
