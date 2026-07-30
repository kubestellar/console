/**
 * Unit tests for the pure mergeRepos function from PipelineFilterContext.
 *
 * mergeRepos is the core logic that determines which repos appear in the
 * pipeline filter bar: server defaults + user-added - user-hidden.
 */
import { describe, it, expect } from 'vitest'
import { mergeRepos } from '../pulse-utils'
import type { StoredRepoConfig } from '../PipelineFilterContext'

// ---------------------------------------------------------------------------
// mergeRepos
// ---------------------------------------------------------------------------

describe('mergeRepos', () => {
  const EMPTY: StoredRepoConfig = { added: [], hidden: [] }

  describe('with empty config', () => {
    it('returns all server repos when config is empty', () => {
      const result = mergeRepos(['org/repo-a', 'org/repo-b'], EMPTY)
      expect(result).toEqual(['org/repo-a', 'org/repo-b'])
    })

    it('returns empty array when server repos are empty', () => {
      expect(mergeRepos([], EMPTY)).toEqual([])
    })
  })

  describe('hidden repos', () => {
    it('excludes hidden repos from the result', () => {
      const config: StoredRepoConfig = { added: [], hidden: ['org/repo-b'] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b', 'org/repo-c'], config)
      expect(result).toEqual(['org/repo-a', 'org/repo-c'])
    })

    it('hides multiple repos', () => {
      const config: StoredRepoConfig = { added: [], hidden: ['org/repo-a', 'org/repo-c'] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b', 'org/repo-c'], config)
      expect(result).toEqual(['org/repo-b'])
    })

    it('ignores hidden repos that are not in server list', () => {
      const config: StoredRepoConfig = { added: [], hidden: ['org/nonexistent'] }
      const result = mergeRepos(['org/repo-a'], config)
      expect(result).toEqual(['org/repo-a'])
    })

    it('returns empty when all server repos are hidden', () => {
      const config: StoredRepoConfig = { added: [], hidden: ['org/repo-a', 'org/repo-b'] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b'], config)
      expect(result).toEqual([])
    })
  })

  describe('added repos', () => {
    it('appends user-added repos after server repos', () => {
      const config: StoredRepoConfig = { added: ['user/custom-repo'], hidden: [] }
      const result = mergeRepos(['org/repo-a'], config)
      expect(result).toEqual(['org/repo-a', 'user/custom-repo'])
    })

    it('does not duplicate repos already in server list', () => {
      const config: StoredRepoConfig = { added: ['org/repo-a'], hidden: [] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b'], config)
      expect(result).toEqual(['org/repo-a', 'org/repo-b'])
    })

    it('appends multiple user-added repos in order', () => {
      const config: StoredRepoConfig = { added: ['user/repo-x', 'user/repo-y'], hidden: [] }
      const result = mergeRepos(['org/repo-a'], config)
      expect(result).toEqual(['org/repo-a', 'user/repo-x', 'user/repo-y'])
    })
  })

  describe('combined add + hide', () => {
    it('hides server repo and appends user-added repo', () => {
      const config: StoredRepoConfig = { added: ['user/custom'], hidden: ['org/repo-b'] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b'], config)
      expect(result).toEqual(['org/repo-a', 'user/custom'])
    })

    it('does not show user-added repo if it is also hidden', () => {
      const config: StoredRepoConfig = { added: ['user/custom'], hidden: ['user/custom'] }
      const result = mergeRepos(['org/repo-a'], config)
      expect(result).toEqual(['org/repo-a'])
    })

    it('server repo hidden + re-added does not duplicate (re-add is in hidden)', () => {
      // If a server repo is hidden and then in 'added', the hidden takes precedence
      const config: StoredRepoConfig = { added: ['org/repo-a'], hidden: ['org/repo-a'] }
      const result = mergeRepos(['org/repo-a', 'org/repo-b'], config)
      // org/repo-a is hidden (removed from server list), then added checks:
      // serverSet has 'org/repo-a', so the added entry is skipped (already in server set)
      expect(result).toEqual(['org/repo-b'])
    })
  })

  describe('order preservation', () => {
    it('preserves server repo order', () => {
      const servers = ['z/repo', 'a/repo', 'm/repo']
      const result = mergeRepos(servers, EMPTY)
      expect(result).toEqual(['z/repo', 'a/repo', 'm/repo'])
    })

    it('preserves user-added order after server repos', () => {
      const config: StoredRepoConfig = { added: ['z/added', 'a/added'], hidden: [] }
      const result = mergeRepos(['m/server'], config)
      expect(result).toEqual(['m/server', 'z/added', 'a/added'])
    })
  })
})
