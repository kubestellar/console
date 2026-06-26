import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  formatTimeAgo,
  loadRepos,
  saveRepos,
  REPOS_STORAGE_KEY,
  DEFAULT_REPOS,
} from '../gitHubCIUtils'

describe('gitHubCIUtils', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  describe('loadRepos / saveRepos', () => {
    it('returns DEFAULT_REPOS when localStorage is empty', () => {
      expect(loadRepos()).toEqual(DEFAULT_REPOS)
    })

    it('persists and reloads a custom repo list', () => {
      const custom = ['acme/widgets', 'acme/gadgets']
      saveRepos(custom)
      expect(localStorage.getItem(REPOS_STORAGE_KEY)).toBe(JSON.stringify(custom))
      expect(loadRepos()).toEqual(custom)
    })

    it('falls back to DEFAULT_REPOS when stored JSON is invalid', () => {
      localStorage.setItem(REPOS_STORAGE_KEY, 'not-json')
      expect(loadRepos()).toEqual(DEFAULT_REPOS)
    })

    it('falls back to DEFAULT_REPOS when stored array is empty', () => {
      localStorage.setItem(REPOS_STORAGE_KEY, '[]')
      expect(loadRepos()).toEqual(DEFAULT_REPOS)
    })

    it('falls back to DEFAULT_REPOS when stored value is not an array', () => {
      localStorage.setItem(REPOS_STORAGE_KEY, '{"repo":"x"}')
      expect(loadRepos()).toEqual(DEFAULT_REPOS)
    })
  })

  describe('formatTimeAgo (re-export)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-22T12:00:00Z'))
    })

    it('formats recent timestamps for workflow run rows', () => {
      expect(formatTimeAgo('2026-05-22T11:55:00Z')).toBe('5m ago')
    })

    it('returns just now at the sub-minute boundary', () => {
      expect(formatTimeAgo('2026-05-22T11:59:45Z')).toBe('just now')
    })

    it('returns hours ago for older runs', () => {
      expect(formatTimeAgo('2026-05-22T09:00:00Z')).toBe('3h ago')
    })
  })
})
