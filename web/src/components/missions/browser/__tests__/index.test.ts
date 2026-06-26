/**
 * browser/index.ts unit tests
 *
 * Verifies that all exports are available and re-exported correctly.
 */

import { describe, it, expect } from 'vitest'
import * as browserExports from '../index'

describe('browser/index exports', () => {
  it('exports TreeNode type', () => {
    expect(browserExports).toHaveProperty('TreeNodeItem')
  })

  it('exports ViewMode type through BROWSER_TABS', () => {
    expect(browserExports.BROWSER_TABS).toBeDefined()
    expect(Array.isArray(browserExports.BROWSER_TABS)).toBe(true)
  })

  it('exports BROWSER_TABS constant', () => {
    expect(browserExports.BROWSER_TABS).toHaveLength(4)
    expect(browserExports.BROWSER_TABS[0]).toHaveProperty('id')
    expect(browserExports.BROWSER_TABS[0]).toHaveProperty('label')
    expect(browserExports.BROWSER_TABS[0]).toHaveProperty('icon')
  })

  it('exports TreeNodeItem component', () => {
    expect(typeof browserExports.TreeNodeItem).toBe('function')
  })

  it('exports DirectoryListing component', () => {
    expect(typeof browserExports.DirectoryListing).toBe('function')
  })

  it('exports RecommendationCard component', () => {
    expect(typeof browserExports.RecommendationCard).toBe('function')
  })

  it('exports EmptyState component', () => {
    expect(typeof browserExports.EmptyState).toBe('function')
  })

  it('exports MissionFetchErrorBanner component', () => {
    expect(typeof browserExports.MissionFetchErrorBanner).toBe('function')
  })

  it('exports helper functions', () => {
    expect(typeof browserExports.getMissionSlug).toBe('function')
    expect(typeof browserExports.getMissionShareUrl).toBe('function')
    expect(typeof browserExports.buildDirectoryEntryNode).toBe('function')
    expect(typeof browserExports.updateNodeInTree).toBe('function')
    expect(typeof browserExports.removeNodeFromTree).toBe('function')
    expect(typeof browserExports.normalizeMission).toBe('function')
  })

  it('exports mission cache functions', () => {
    expect(browserExports.missionCache).toBeDefined()
    expect(typeof browserExports.notifyCacheListeners).toBe('function')
    expect(typeof browserExports.startMissionCacheFetch).toBe('function')
    expect(typeof browserExports.resetMissionCache).toBe('function')
    expect(typeof browserExports.fetchMissionContent).toBe('function')
  })

  it('exports recommendation cache functions', () => {
    expect(typeof browserExports.getCachedRecommendations).toBe('function')
    expect(typeof browserExports.setCachedRecommendations).toBe('function')
    expect(typeof browserExports.resetRecommendationCache).toBe('function')
  })

  it('exports VirtualizedMissionGrid component', () => {
    expect(typeof browserExports.VirtualizedMissionGrid).toBe('function')
  })

  it('exports tree fetcher functions', () => {
    expect(typeof browserExports.fetchTreeChildren).toBe('function')
    expect(typeof browserExports.fetchDirectoryEntries).toBe('function')
    expect(typeof browserExports.fetchNodeFileContent).toBe('function')
    expect(typeof browserExports.getKubaraConfig).toBe('function')
  })

  it('exports MISSION_FILE_FETCH_TIMEOUT_MS constant', () => {
    expect(typeof browserExports.MISSION_FILE_FETCH_TIMEOUT_MS).toBe('number')
    expect(browserExports.MISSION_FILE_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })
})
