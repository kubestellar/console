/**
 * Routes Configuration Tests
 */
import { describe, it, expect } from 'vitest'
import {
  ROUTES,
  getCustomDashboardRoute,
  getLoginWithError,
  getSettingsWithHash,
  getMissionRoute,
  getHomeBrowseMissionsRoute,
} from '../routes'

/** Minimum number of route entries expected */
const MIN_ROUTE_COUNT = 30

describe('ROUTES constant', () => {
  it('has a substantial number of routes defined', () => {
    const routeCount = Object.keys(ROUTES).length
    expect(routeCount).toBeGreaterThanOrEqual(MIN_ROUTE_COUNT)
  })

  it('all routes start with /', () => {
    Object.values(ROUTES).forEach(route => {
      expect(route.startsWith('/')).toBe(true)
    })
  })

  it('all route values are strings', () => {
    Object.values(ROUTES).forEach(route => {
      expect(typeof route).toBe('string')
    })
  })

  it('has expected core routes', () => {
    expect(ROUTES.HOME).toBe('/')
    expect(ROUTES.LOGIN).toBe('/login')
    expect(ROUTES.SETTINGS).toBe('/settings')
    expect(ROUTES.CLUSTERS).toBe('/clusters')
  })

  it('has no duplicate route values', () => {
    const values = Object.values(ROUTES)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

describe('Route helper functions', () => {
  it('getCustomDashboardRoute replaces :id param', () => {
    const route = getCustomDashboardRoute('my-dash')
    expect(route).toBe('/custom-dashboard/my-dash')
    expect(route).not.toContain(':id')
  })

  // #6695 / #6698 — dashboard ids with URL-reserved characters must be
  // encoded so they can't break out of the path or inject a query/fragment.
  it('getCustomDashboardRoute encodes path separators, query, fragment, percent', () => {
    const route = getCustomDashboardRoute('a/b?c#d%e')
    expect(route).not.toContain(':id')
    // Each reserved char should be percent-encoded in the output.
    expect(route).toContain('a%2Fb%3Fc%23d%25e')
    // And the raw characters should not leak through.
    expect(route).not.toContain('a/b')
    expect(route).not.toContain('?c')
    expect(route).not.toContain('#d')
  })

  it('getLoginWithError includes encoded error param', () => {
    const route = getLoginWithError('token expired')
    expect(route).toContain('/login?error=')
    expect(route).toContain('token%20expired')
  })

  it('getSettingsWithHash adds hash fragment', () => {
    const route = getSettingsWithHash('theme')
    expect(route).toBe('/settings#theme')
  })

  it('getMissionRoute replaces :missionId', () => {
    const route = getMissionRoute('abc-123')
    expect(route).toContain('/missions/')
    expect(route).toContain('abc-123')
    expect(route).not.toContain(':missionId')
  })

  it('getMissionRoute encodes special characters', () => {
    const route = getMissionRoute('hello world')
    expect(route).toContain('hello%20world')
  })

  it('getHomeBrowseMissionsRoute returns home with query param', () => {
    const route = getHomeBrowseMissionsRoute()
    expect(route).toBe('/?browse=missions')
  })
})
