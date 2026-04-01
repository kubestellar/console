import { describe, it, expect } from 'vitest'
import * as storageConstants from '../storage'

describe('storage constants', () => {
  it('exports all expected auth keys', () => {
    expect(storageConstants.STORAGE_KEY_TOKEN).toBe('token')
    expect(storageConstants.DEMO_TOKEN_VALUE).toBe('demo-token')
    expect(storageConstants.STORAGE_KEY_FEEDBACK_GITHUB_TOKEN).toBeTruthy()
  })

  it('exports demo/onboarding keys', () => {
    expect(storageConstants.STORAGE_KEY_DEMO_MODE).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_ONBOARDED).toBeTruthy()
  })

  it('exports settings keys', () => {
    expect(storageConstants.STORAGE_KEY_AI_MODE).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_THEME).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_ACCESSIBILITY).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_TOUR_COMPLETED).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_ANALYTICS_OPT_OUT).toBeTruthy()
  })

  it('exports engagement keys', () => {
    expect(storageConstants.STORAGE_KEY_NUDGE_DISMISSED).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_SESSION_COUNT).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_VISIT_COUNT).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_VISIT_STREAK).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_SEEN_TIPS).toBeTruthy()
  })

  it('exports cache keys', () => {
    expect(storageConstants.STORAGE_KEY_OPA_CACHE).toBeTruthy()
    expect(storageConstants.STORAGE_KEY_KYVERNO_CACHE).toBeTruthy()
  })

  it('all values are strings', () => {
    for (const [, value] of Object.entries(storageConstants)) {
      expect(typeof value).toBe('string')
    }
  })

  it('no duplicate values', () => {
    const values = Object.values(storageConstants)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})
