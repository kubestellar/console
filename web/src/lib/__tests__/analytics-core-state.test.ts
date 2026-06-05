/**
 * Tests for lib/analytics-core-state.ts
 *
 * Directly exercises every setter and the reset function.
 * These state mutations have 0% coverage because analytics.ts tests use
 * vi.resetModules() + dynamic import — they never call the setters from the
 * named import path that coverage tracks for this file.
 *
 * ESM live-binding guarantee: named imports reflect mutations made by setters
 * in the same module instance, so reading the import after calling a setter
 * observes the updated value.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_GTAG_MEASUREMENT_ID,
  DEFAULT_PROXY_MEASUREMENT_ID,
  DEFAULT_UMAMI_WEBSITE_ID,
  setMeasurementId,
  setPageId,
  replaceUserProperties,
  mergeUserProperties,
  setUserId,
  setInitialized,
  setUserHasInteracted,
  setAnalyticsScriptsLoaded,
  setPendingRecoveryEvent,
  consumePendingRecoveryEvent,
  setSessionEngaged,
  setGtagMeasurementId,
  setUmamiWebsiteId,
  setRealMeasurementId,
  resetAnalyticsCoreState,
  // Import mutable bindings for assertion
  measurementId,
  pageId,
  userProperties,
  userId,
  initialized,
  userHasInteracted,
  analyticsScriptsLoaded,
  pendingRecoveryEvent,
  sessionEngaged,
  gtagMeasurementId,
  umamiWebsiteId,
  realMeasurementId,
} from '../analytics-core-state'

beforeEach(() => {
  resetAnalyticsCoreState()
})

describe('module constants', () => {
  it('DEFAULT_PROXY_MEASUREMENT_ID is a placeholder GA4 ID', () => {
    expect(DEFAULT_PROXY_MEASUREMENT_ID).toBe('G-0000000000')
  })

  it('DEFAULT_GTAG_MEASUREMENT_ID is the KubeStellar GA4 ID', () => {
    expect(DEFAULT_GTAG_MEASUREMENT_ID).toBe('G-PXWNVQ8D1T')
  })

  it('DEFAULT_UMAMI_WEBSITE_ID is a UUID', () => {
    expect(DEFAULT_UMAMI_WEBSITE_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

describe('setMeasurementId', () => {
  it('updates measurementId', () => {
    setMeasurementId('G-TEST123')
    expect(measurementId).toBe('G-TEST123')
  })

  it('resets to empty string via resetAnalyticsCoreState', () => {
    setMeasurementId('G-TEST123')
    resetAnalyticsCoreState()
    expect(measurementId).toBe('')
  })
})

describe('setPageId', () => {
  it('updates pageId', () => {
    setPageId('/dashboard')
    expect(pageId).toBe('/dashboard')
  })
})

describe('replaceUserProperties', () => {
  it('replaces userProperties entirely', () => {
    mergeUserProperties({ existing: 'value' })
    replaceUserProperties({ role: 'admin' })
    expect(userProperties).toEqual({ role: 'admin' })
    expect(userProperties).not.toHaveProperty('existing')
  })

  it('sets empty object', () => {
    replaceUserProperties({})
    expect(userProperties).toEqual({})
  })
})

describe('mergeUserProperties', () => {
  it('merges into current userProperties', () => {
    replaceUserProperties({ a: '1' })
    mergeUserProperties({ b: '2' })
    expect(userProperties).toEqual({ a: '1', b: '2' })
  })

  it('later keys overwrite earlier keys', () => {
    replaceUserProperties({ key: 'old' })
    mergeUserProperties({ key: 'new' })
    expect(userProperties.key).toBe('new')
  })
})

describe('setUserId', () => {
  it('updates userId', () => {
    setUserId('user-abc')
    expect(userId).toBe('user-abc')
  })
})

describe('setInitialized', () => {
  it('sets initialized to true', () => {
    expect(initialized).toBe(false)
    setInitialized(true)
    expect(initialized).toBe(true)
  })

  it('sets initialized to false', () => {
    setInitialized(true)
    setInitialized(false)
    expect(initialized).toBe(false)
  })
})

describe('setUserHasInteracted', () => {
  it('sets userHasInteracted to true', () => {
    expect(userHasInteracted).toBe(false)
    setUserHasInteracted(true)
    expect(userHasInteracted).toBe(true)
  })
})

describe('setAnalyticsScriptsLoaded', () => {
  it('sets analyticsScriptsLoaded to true', () => {
    expect(analyticsScriptsLoaded).toBe(false)
    setAnalyticsScriptsLoaded(true)
    expect(analyticsScriptsLoaded).toBe(true)
  })
})

describe('setPendingRecoveryEvent / consumePendingRecoveryEvent', () => {
  it('stores and returns the event on consume', () => {
    const event = { name: 'ksc_error', params: { error_type: 'chunk' } }
    setPendingRecoveryEvent(event)
    expect(pendingRecoveryEvent).toEqual(event)
    const consumed = consumePendingRecoveryEvent()
    expect(consumed).toEqual(event)
    expect(pendingRecoveryEvent).toBeNull()
  })

  it('returns null when no pending event', () => {
    expect(consumePendingRecoveryEvent()).toBeNull()
  })

  it('clears the pending event to null after consume', () => {
    setPendingRecoveryEvent({ name: 'ksc_error', params: {} })
    consumePendingRecoveryEvent()
    expect(pendingRecoveryEvent).toBeNull()
  })

  it('stores null directly via setPendingRecoveryEvent', () => {
    setPendingRecoveryEvent({ name: 'ksc_error', params: {} })
    setPendingRecoveryEvent(null)
    expect(pendingRecoveryEvent).toBeNull()
  })
})

describe('setSessionEngaged', () => {
  it('sets sessionEngaged to true', () => {
    expect(sessionEngaged).toBe(false)
    setSessionEngaged(true)
    expect(sessionEngaged).toBe(true)
  })
})

describe('setGtagMeasurementId', () => {
  it('updates gtagMeasurementId', () => {
    setGtagMeasurementId('G-CUSTOM')
    expect(gtagMeasurementId).toBe('G-CUSTOM')
  })
})

describe('setUmamiWebsiteId', () => {
  it('updates umamiWebsiteId', () => {
    setUmamiWebsiteId('custom-umami-id')
    expect(umamiWebsiteId).toBe('custom-umami-id')
  })
})

describe('setRealMeasurementId', () => {
  it('updates realMeasurementId', () => {
    setRealMeasurementId('G-REAL')
    expect(realMeasurementId).toBe('G-REAL')
  })
})

describe('resetAnalyticsCoreState', () => {
  it('resets all mutable state to defaults', () => {
    setMeasurementId('G-TEMP')
    setPageId('/test')
    replaceUserProperties({ x: '1' })
    setUserId('uid')
    setInitialized(true)
    setUserHasInteracted(true)
    setAnalyticsScriptsLoaded(true)
    setPendingRecoveryEvent({ name: 'e', params: {} })
    setSessionEngaged(true)
    setGtagMeasurementId('G-GTAG')
    setUmamiWebsiteId('custom-umami')
    setRealMeasurementId('G-REAL')

    resetAnalyticsCoreState()

    expect(measurementId).toBe('')
    expect(pageId).toBe('')
    expect(userProperties).toEqual({})
    expect(userId).toBe('')
    expect(initialized).toBe(false)
    expect(userHasInteracted).toBe(false)
    expect(analyticsScriptsLoaded).toBe(false)
    expect(pendingRecoveryEvent).toBeNull()
    expect(sessionEngaged).toBe(false)
    expect(gtagMeasurementId).toBe(DEFAULT_GTAG_MEASUREMENT_ID)
    expect(umamiWebsiteId).toBe(DEFAULT_UMAMI_WEBSITE_ID)
    expect(realMeasurementId).toBe('')
  })
})
