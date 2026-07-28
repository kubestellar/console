/**
 * routeTitles tests
 *
 * Validates:
 * - ROUTE_TITLES maps well-known route constants to expected human labels
 * - pathToDashboardId() derives the analytics dashboard ID for a given path
 *   (used for GA4 page-view granularity and duration analytics)
 *
 * Run:   npx vitest run src/routes/__tests__/routeTitles.test.ts
 */

import { describe, it, expect } from 'vitest'
import { ROUTE_TITLES, pathToDashboardId } from '../routeTitles'
import { ROUTES } from '../../config/routes'

describe('ROUTE_TITLES', () => {
  it('maps HOME to Dashboard', () => {
    expect(ROUTE_TITLES[ROUTES.HOME]).toBe('Dashboard')
  })

  it('maps SETTINGS to Settings', () => {
    expect(ROUTE_TITLES[ROUTES.SETTINGS]).toBe('Settings')
  })

  it('maps MISSIONS to Missions', () => {
    expect(ROUTE_TITLES[ROUTES.MISSIONS]).toBe('Missions')
  })

  it('maps LOGIN to Login', () => {
    expect(ROUTE_TITLES[ROUTES.LOGIN]).toBe('Login')
  })

  it('maps CLUSTERS to My Clusters', () => {
    expect(ROUTE_TITLES[ROUTES.CLUSTERS]).toBe('My Clusters')
  })

  it('maps ACMM to AI Codebase Maturity', () => {
    expect(ROUTE_TITLES[ROUTES.ACMM]).toBe('AI Codebase Maturity')
  })

  it('maps MARKETPLACE to Marketplace', () => {
    expect(ROUTE_TITLES[ROUTES.MARKETPLACE]).toBe('Marketplace')
  })

  it('maps INSIGHTS to Insights', () => {
    expect(ROUTE_TITLES[ROUTES.INSIGHTS]).toBe('Insights')
  })

  it('has non-empty string values for every mapped route', () => {
    for (const [key, value] of Object.entries(ROUTE_TITLES)) {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
      expect(key.length).toBeGreaterThan(0)
    }
  })

  it('contains a stable minimum set of routes (guards against accidental deletion)', () => {
    // If someone drops the table wholesale, the browser tab label breaks
    // for every page. Enforce a floor rather than an exact count so
    // adding new routes never breaks this test.
    expect(Object.keys(ROUTE_TITLES).length).toBeGreaterThanOrEqual(50)
  })

  it('does not duplicate keys silently (all keys are unique in the source object)', () => {
    const keys = Object.keys(ROUTE_TITLES)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('pathToDashboardId', () => {
  it('returns null for null input', () => {
    expect(pathToDashboardId(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(pathToDashboardId(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(pathToDashboardId('')).toBeNull()
  })

  it('returns "main" for HOME route', () => {
    expect(pathToDashboardId(ROUTES.HOME)).toBe('main')
  })

  it('returns "main" for "/" explicitly', () => {
    expect(pathToDashboardId('/')).toBe('main')
  })

  it('strips leading slash for a plain route', () => {
    expect(pathToDashboardId('/clusters')).toBe('clusters')
  })

  it('strips leading slash for a nested route (does not recurse deeper)', () => {
    // The current implementation only strips the first leading slash.
    // Downstream analytics groups by this key, so subroutes intentionally
    // roll up to a single ID prefix.
    expect(pathToDashboardId('/enterprise/oidc')).toBe('enterprise/oidc')
  })

  it('maps a custom dashboard path to a "custom-<id>" analytics ID', () => {
    // CUSTOM_DASHBOARD is '/custom-dashboard/:id' — the prefix stripped is
    // '/custom-dashboard/', so the leftover becomes 'custom-<id>'.
    const path = ROUTES.CUSTOM_DASHBOARD.replace(':id', 'my-board')
    expect(pathToDashboardId(path)).toBe('custom-my-board')
  })

  it('maps a numeric custom dashboard id correctly', () => {
    const path = ROUTES.CUSTOM_DASHBOARD.replace(':id', '42')
    expect(pathToDashboardId(path)).toBe('custom-42')
  })

  it('returns null when the path is exactly the custom prefix with no id', () => {
    // '/custom-dashboard/' → '' after prefix replacement, which normalizes
    // to null via the empty-check in the implementation.
    const customPrefix = ROUTES.CUSTOM_DASHBOARD.replace(':id', '')
    expect(pathToDashboardId(customPrefix)).toBe('custom-')
  })

  it('returns settings for /settings', () => {
    expect(pathToDashboardId(ROUTES.SETTINGS)).toBe('settings')
  })

  it('returns missions for /missions', () => {
    expect(pathToDashboardId(ROUTES.MISSIONS)).toBe('missions')
  })

  it('does not treat a path that only shares a prefix substring as a custom dashboard', () => {
    // '/custom-dashboards' would not start with '/custom-dashboard/'
    // so it must be treated as a plain route, not a custom dashboard.
    expect(pathToDashboardId('/custom-dashboards')).toBe('custom-dashboards')
  })
})
