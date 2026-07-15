/**
 * Unit tests for GitHubActivity.utils pure functions.
 * Covers: isStale, getSavedRepos, saveRepos, getDemoGitHubData,
 * DEFAULT_REPO, githubFetchError.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isStale,
  getSavedRepos,
  saveRepos,
  getDemoGitHubData,
  DEFAULT_REPO,
  SAVED_REPOS_STORAGE_KEY,
  githubFetchError,
} from './GitHubActivity.utils'

// ---------------------------------------------------------------------------
// isStale
// ---------------------------------------------------------------------------

describe('isStale', () => {
  it('returns true for a date 15 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    expect(isStale(fifteenDaysAgo)).toBe(true)
  })

  it('returns false for a date 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    expect(isStale(oneDayAgo)).toBe(false)
  })

  it('returns false for just now', () => {
    expect(isStale(new Date().toISOString())).toBe(false)
  })

  it('returns true for a very old date', () => {
    expect(isStale('2020-01-01T00:00:00Z')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_REPO
// ---------------------------------------------------------------------------

describe('DEFAULT_REPO', () => {
  it('is kubestellar/console', () => {
    expect(DEFAULT_REPO).toBe('kubestellar/console')
  })
})

// ---------------------------------------------------------------------------
// getSavedRepos / saveRepos
// ---------------------------------------------------------------------------

describe('getSavedRepos / saveRepos', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('returns default repo when localStorage is empty', () => {
    const repos = getSavedRepos()
    expect(repos).toContain(DEFAULT_REPO)
  })

  it('saveRepos persists repos and getSavedRepos retrieves them', () => {
    saveRepos(['org/repo-a', 'org/repo-b'])
    const repos = getSavedRepos()
    expect(repos).toContain('org/repo-a')
    expect(repos).toContain('org/repo-b')
  })

  it('returns default when localStorage has corrupted JSON', () => {
    localStorage.setItem(SAVED_REPOS_STORAGE_KEY, 'not-valid-json{')
    const repos = getSavedRepos()
    expect(repos).toContain(DEFAULT_REPO)
  })
})

// ---------------------------------------------------------------------------
// getDemoGitHubData
// ---------------------------------------------------------------------------

describe('getDemoGitHubData', () => {
  it('returns prs array', () => {
    const data = getDemoGitHubData('kubestellar/console')
    expect(Array.isArray(data.prs)).toBe(true)
    expect(data.prs.length).toBeGreaterThan(0)
  })

  it('returns issues array', () => {
    const data = getDemoGitHubData('kubestellar/console')
    expect(Array.isArray(data.issues)).toBe(true)
    expect(data.issues.length).toBeGreaterThan(0)
  })

  it('returns releases array', () => {
    const data = getDemoGitHubData('kubestellar/console')
    expect(Array.isArray(data.releases)).toBe(true)
    expect(data.releases.length).toBeGreaterThan(0)
  })

  it('returns contributors array', () => {
    const data = getDemoGitHubData('kubestellar/console')
    expect(Array.isArray(data.contributors)).toBe(true)
    expect(data.contributors.length).toBeGreaterThan(0)
  })

  it('sets full_name to the provided repo name', () => {
    const data = getDemoGitHubData('my-org/my-repo')
    expect(data.repoInfo?.full_name).toBe('my-org/my-repo')
  })

  it('returns openPRCount and openIssueCount as numbers', () => {
    const data = getDemoGitHubData('kubestellar/console')
    expect(typeof data.openPRCount).toBe('number')
    expect(typeof data.openIssueCount).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// githubFetchError
// ---------------------------------------------------------------------------

describe('githubFetchError', () => {
  it('uses JSON body error field when available', async () => {
    const response = {
      clone: () => ({
        json: async () => ({ error: 'Rate limit exceeded.' }),
      }),
      status: 429,
      statusText: 'Too Many Requests',
    } as unknown as Response

    const err = await githubFetchError(response, 'fetchPRs')
    expect(err.message).toContain('Rate limit exceeded.')
    expect(err.message).toContain('fetchPRs')
  })

  it('falls back to statusText when body has no error field', async () => {
    const response = {
      clone: () => ({
        json: async () => ({ other: 'data' }),
      }),
      status: 500,
      statusText: 'Internal Server Error',
    } as unknown as Response

    const err = await githubFetchError(response, 'fetchIssues')
    expect(err.message).toContain('Internal Server Error')
  })

  it('falls back gracefully when JSON parse fails', async () => {
    const response = {
      clone: () => ({
        json: async () => { throw new Error('bad json') },
      }),
      status: 503,
      statusText: 'Service Unavailable',
    } as unknown as Response

    const err = await githubFetchError(response, 'fetchContributors')
    expect(err.message).toContain('Service Unavailable')
  })
})
