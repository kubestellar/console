/**
 * Unit tests for sidebar-customizer knownRoutes and constants.
 *
 * Tests buildKnownRoutes mapping logic and validates constants
 * used throughout the sidebar customizer.
 */
import { describe, it, expect } from 'vitest'
import { buildKnownRoutes } from '../knownRoutes'
import {
  AUTO_DISMISS_MS,
  AUTO_DISMISS_APPLIED_MS,
  LOCAL_DASHBOARD_ID_PREFIX,
  DND_ACTIVATION_DISTANCE,
  MAX_PREVIEW_ROUTES,
} from '../constants'

// ---------------------------------------------------------------------------
// buildKnownRoutes
// ---------------------------------------------------------------------------

describe('buildKnownRoutes', () => {
  // Mock translation function that returns key-based strings
  const mockT = (key: string) => `translated:${key}`

  it('returns a non-empty array of routes', () => {
    const routes = buildKnownRoutes(mockT)
    expect(routes.length).toBeGreaterThan(0)
  })

  it('every route has required fields', () => {
    const routes = buildKnownRoutes(mockT)
    for (const route of routes) {
      expect(route.href).toBeTruthy()
      expect(route.name).toBeTruthy()
      expect(route.description).toBeTruthy()
      expect(route.icon).toBeTruthy()
      expect(route.category).toBeTruthy()
    }
  })

  it('every route href starts with /', () => {
    const routes = buildKnownRoutes(mockT)
    for (const route of routes) {
      expect(route.href).toMatch(/^\//)
    }
  })

  it('every route has a unique href', () => {
    const routes = buildKnownRoutes(mockT)
    const hrefs = routes.map(r => r.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('includes the root route /', () => {
    const routes = buildKnownRoutes(mockT)
    const root = routes.find(r => r.href === '/')
    expect(root).toBeDefined()
    expect(root?.icon).toBe('LayoutDashboard')
  })

  it('includes cluster-related routes', () => {
    const routes = buildKnownRoutes(mockT)
    const clusters = routes.find(r => r.href === '/clusters')
    expect(clusters).toBeDefined()
    expect(clusters?.icon).toBe('Server')
  })

  it('includes enterprise sub-routes', () => {
    const routes = buildKnownRoutes(mockT)
    const enterpriseRoutes = routes.filter(r => r.href.startsWith('/enterprise'))
    expect(enterpriseRoutes.length).toBeGreaterThan(5)
  })

  it('passes correct translation keys to t()', () => {
    const calledKeys: string[] = []
    const trackingT = (key: string) => { calledKeys.push(key); return key }
    buildKnownRoutes(trackingT)
    // Should call name, description, category for each route
    expect(calledKeys.some(k => k.includes('.name'))).toBe(true)
    expect(calledKeys.some(k => k.includes('.description'))).toBe(true)
    expect(calledKeys.some(k => k.includes('.category'))).toBe(true)
  })

  it('uses correct key format: sidebar.routes.<path>.name', () => {
    const calledKeys: string[] = []
    const trackingT = (key: string) => { calledKeys.push(key); return key }
    buildKnownRoutes(trackingT)
    const nameKeys = calledKeys.filter(k => k.endsWith('.name'))
    for (const key of nameKeys) {
      expect(key).toMatch(/^sidebar\.routes\.\/.+\.name$|^sidebar\.routes\.\/\.name$/)
    }
  })
})

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------

describe('sidebar-customizer constants', () => {
  it('AUTO_DISMISS_MS is a reasonable timeout (3-10 seconds)', () => {
    expect(AUTO_DISMISS_MS).toBeGreaterThanOrEqual(3000)
    expect(AUTO_DISMISS_MS).toBeLessThanOrEqual(10000)
  })

  it('AUTO_DISMISS_APPLIED_MS is shorter than AUTO_DISMISS_MS', () => {
    expect(AUTO_DISMISS_APPLIED_MS).toBeLessThan(AUTO_DISMISS_MS)
  })

  it('LOCAL_DASHBOARD_ID_PREFIX is a non-empty string', () => {
    expect(LOCAL_DASHBOARD_ID_PREFIX).toBeTruthy()
    expect(typeof LOCAL_DASHBOARD_ID_PREFIX).toBe('string')
  })

  it('DND_ACTIVATION_DISTANCE is a small positive number', () => {
    expect(DND_ACTIVATION_DISTANCE).toBeGreaterThan(0)
    expect(DND_ACTIVATION_DISTANCE).toBeLessThan(20)
  })

  it('MAX_PREVIEW_ROUTES is a reasonable limit', () => {
    expect(MAX_PREVIEW_ROUTES).toBeGreaterThan(0)
    expect(MAX_PREVIEW_ROUTES).toBeLessThanOrEqual(20)
  })
})
