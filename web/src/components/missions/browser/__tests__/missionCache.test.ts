/**
 * browser/missionCache.ts unit tests
 *
 * Verifies that missionCache re-exports work correctly.
 */

import { describe, it, expect } from 'vitest'
import {
  missionCache,
  notifyCacheListeners,
  startMissionCacheFetch,
  resetMissionCache,
  fetchMissionContent,
  MISSION_FILE_FETCH_TIMEOUT_MS,
  getCachedRecommendations,
  setCachedRecommendations,
  resetRecommendationCache,
  computeClusterFingerprint,
} from '../missionCache'

describe('browser/missionCache', () => {
  it('exports missionCache object', () => {
    expect(missionCache).toBeDefined()
    expect(typeof missionCache).toBe('object')
  })

  it('exports notifyCacheListeners function', () => {
    expect(typeof notifyCacheListeners).toBe('function')
  })

  it('exports startMissionCacheFetch function', () => {
    expect(typeof startMissionCacheFetch).toBe('function')
  })

  it('exports resetMissionCache function', () => {
    expect(typeof resetMissionCache).toBe('function')
  })

  it('exports fetchMissionContent function', () => {
    expect(typeof fetchMissionContent).toBe('function')
  })

  it('exports MISSION_FILE_FETCH_TIMEOUT_MS constant', () => {
    expect(typeof MISSION_FILE_FETCH_TIMEOUT_MS).toBe('number')
    expect(MISSION_FILE_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('exports getCachedRecommendations function', () => {
    expect(typeof getCachedRecommendations).toBe('function')
  })

  it('exports setCachedRecommendations function', () => {
    expect(typeof setCachedRecommendations).toBe('function')
  })

  it('exports resetRecommendationCache function', () => {
    expect(typeof resetRecommendationCache).toBe('function')
  })

  it('exports computeClusterFingerprint function', () => {
    expect(typeof computeClusterFingerprint).toBe('function')
  })
})
