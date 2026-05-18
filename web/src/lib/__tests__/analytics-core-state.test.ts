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
} from '../analytics-core-state'
// Import the mutable bindings for assertion
import * as state from '../analytics-core-state'

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
    expect(state.measurementId).toBe('G-TEST123')
  })

  it('resets to empty string via resetAnalyticsCoreState', () => {
    setMeasurementId('G-TEST123')
    resetAnalyticsCoreState()
    expect(state.measurementId).toBe('')
  })
})

describe('setPageId', () => {
  it('updates pageId', () => {
    setPageId('/dashboard')
    expect(state.pageId).toBe('/dashboard')
  })
})

describe('replaceUserProperties', () => {
  it('replaces userProperties entirely', () => {
    mergeUserProperties({ existing: 'value' })
    replaceUserProperties({ role: 'admin' })
    expect(state.userProperties).toEqual({ role: 'admin' })
    expect(state.userProperties).not.toHaveProperty('existing')
  })

  it('sets empty object', () => {
    replaceUserProperties({})
    expect(state.userProperties).toEqual({})
  })
})

describe('mergeUserProperties', () => {
  it('merges into current userProperties', () => {
    replaceUserProperties({ a: '1' })
    mergeUserProperties({ b: '2' })
    expect(state.userProperties).toEqual({ a: '1', b: '2' })
  })

  it('later keys overwrite earlier keys', () => {
    replaceUserProperties({ key: 'old' })
    mergeUserProperties({ key: 'new' })
    expect(state.userProperties.key).toBe('new')
  })
})

describe('setUserId', () => {
  it('updates userId', () => {
    setUserId('user-abc')
    expect(state.userId).toBe('user-abc')
  })
})

describe('setInitialized', () => {
  it('sets initialized to true', () => {
    expect(state.initialized).toBe(false)
    setInitialized(true)
    expect(state.initialized).toBe(true)
  })

  it('sets initialized to false', () => {
    setInitialized(true)
    setInitialized(false)
    expect(state.initialized).toBe(false)
  })
})

describe('setUserHasInteracted', () => {
  it('sets userHasInteracted to true', () => {
    expect(state.userHasInteracted).toBe(false)
    setUserHasInteracted(true)
    expect(state.userHasInteracted).toBe(true)
  })
})

describe('setAnalyticsScriptsLoaded', () => {
  it('sets analyticsScriptsLoaded to true', () => {
    expect(state.analyticsScriptsLoaded).toBe(false)
    setAnalyticsScriptsLoaded(true)
    expect(state.analyticsScriptsLoaded).toBe(true)
  })
})

describe('setPendingRecoveryEvent / consumePendingRecoveryEvent', () => {
  it('stores and returns the event on consume', () => {
    const event = { name: 'ksc_error', params: { error_type: 'chunk' } }
    setPendingRecoveryEvent(event)
    expect(state.pendingRecoveryEvent).toEqual(event)
    const consumed = consumePendingRecoveryEvent()
    expect(consumed).toEqual(event)
    expect(state.pendingRecoveryEvent).toBeNull()
  })

  it('returns null when no pending event', () => {
    expect(consumePendingRecoveryEvent()).toBeNull()
  })

  it('clears the pending event to null after consume', () => {
    setPendingRecoveryEvent({ name: 'ksc_error', params: {} })
    consumePendingRecoveryEvent()
    expect(state.pendingRecoveryEvent).toBeNull()
  })

  it('stores null directly via setPendingRecoveryEvent', () => {
    setPendingRecoveryEvent({ name: 'ksc_error', params: {} })
    setPendingRecoveryEvent(null)
    expect(state.pendingRecoveryEvent).toBeNull()
  })
})

describe('setSessionEngaged', () => {
  it('sets sessionEngaged to true', () => {
    expect(state.sessionEngaged).toBe(false)
    setSessionEngaged(true)
    expect(state.sessionEngaged).toBe(true)
  })
})

describe('setGtagMeasurementId', () => {
  it('updates gtagMeasurementId', () => {
    setGtagMeasurementId('G-CUSTOM')
    expect(state.gtagMeasurementId).toBe('G-CUSTOM')
  })
})

describe('setUmamiWebsiteId', () => {
  it('updates umamiWebsiteId', () => {
    setUmamiWebsiteId('custom-umami-id')
    expect(state.umamiWebsiteId).toBe('custom-umami-id')
  })
})

describe('setRealMeasurementId', () => {
  it('updates realMeasurementId', () => {
    setRealMeasurementId('G-REAL')
    expect(state.realMeasurementId).toBe('G-REAL')
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

    expect(state.measurementId).toBe('')
    expect(state.pageId).toBe('')
    expect(state.userProperties).toEqual({})
    expect(state.userId).toBe('')
    expect(state.initialized).toBe(false)
    expect(state.userHasInteracted).toBe(false)
    expect(state.analyticsScriptsLoaded).toBe(false)
    expect(state.pendingRecoveryEvent).toBeNull()
    expect(state.sessionEngaged).toBe(false)
    expect(state.gtagMeasurementId).toBe(DEFAULT_GTAG_MEASUREMENT_ID)
    expect(state.umamiWebsiteId).toBe(DEFAULT_UMAMI_WEBSITE_ID)
    expect(state.realMeasurementId).toBe('')
  })
})
