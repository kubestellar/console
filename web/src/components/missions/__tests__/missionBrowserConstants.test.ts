import { describe, expect, it, beforeEach } from 'vitest'
import {
  WATCHED_REPOS_KEY,
  WATCHED_PATHS_KEY,
  loadWatchedRepos,
  loadWatchedPaths,
} from '../missionBrowserConstants'

beforeEach(() => {
  localStorage.clear()
})

describe('loadWatchedRepos', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadWatchedRepos()).toEqual([])
  })

  it('returns stored array of repo names', () => {
    localStorage.setItem(WATCHED_REPOS_KEY, JSON.stringify(['kubestellar/console', 'kubestellar/kubestellar']))
    expect(loadWatchedRepos()).toEqual(['kubestellar/console', 'kubestellar/kubestellar'])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem(WATCHED_REPOS_KEY, JSON.stringify({ corrupted: true }))
    expect(loadWatchedRepos()).toEqual([])
  })

  it('returns empty array on corrupted json', () => {
    localStorage.setItem(WATCHED_REPOS_KEY, '{not-json')
    expect(loadWatchedRepos()).toEqual([])
  })

  it('filters out non-string entries from a stored array', () => {
    localStorage.setItem(WATCHED_REPOS_KEY, JSON.stringify(['kubestellar/console', 123, {}, null, 'kubestellar/kubestellar']))
    expect(loadWatchedRepos()).toEqual(['kubestellar/console', 'kubestellar/kubestellar'])
  })
})

describe('loadWatchedPaths', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadWatchedPaths()).toEqual([])
  })

  it('returns stored array of paths', () => {
    localStorage.setItem(WATCHED_PATHS_KEY, JSON.stringify(['missions/install', 'missions/repair']))
    expect(loadWatchedPaths()).toEqual(['missions/install', 'missions/repair'])
  })

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem(WATCHED_PATHS_KEY, JSON.stringify('a-string'))
    expect(loadWatchedPaths()).toEqual([])
  })

  it('returns empty array on corrupted json', () => {
    localStorage.setItem(WATCHED_PATHS_KEY, '{not-json')
    expect(loadWatchedPaths()).toEqual([])
  })

  it('filters out non-string entries from a stored array', () => {
    localStorage.setItem(WATCHED_PATHS_KEY, JSON.stringify(['missions/install', 42, false, 'missions/repair']))
    expect(loadWatchedPaths()).toEqual(['missions/install', 'missions/repair'])
  })
})
