/**
 * Tests for useLastRoute hook and its exported utility functions.
 *
 * Covers the localStorage-backed persistence helpers (getLastRoute,
 * clearLastRoute, getRememberPosition, setRememberPosition,
 * __testables.getFirstDashboardRoute) and the hook's route-save /
 * redirect-on-mount behavior with react-router-dom mocked.
 *
 * The scroll-snapping/card-title restore logic (saveScrollPositionNow /
 * restoreScrollPosition internals) is DOM-measurement heavy and is left
 * out of scope for this pass — see console#(filed) for the remaining gap.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useLastRoute,
  getLastRoute,
  clearLastRoute,
  getRememberPosition,
  setRememberPosition,
  __testables,
} from '../useLastRoute'

const mockNavigate = vi.fn()
let mockLocation = { pathname: '/', search: '' }

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}))

const mockRecordDashboardVisit = vi.fn()
vi.mock('../../lib/dashboardVisits', () => ({
  recordDashboardVisit: (...args: unknown[]) => mockRecordDashboardVisit(...args),
}))

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'
const REMEMBER_POSITION_KEY = 'kubestellar-remember-position'
const SIDEBAR_CONFIG_KEY = 'kubestellar-sidebar-config-v5'

beforeEach(() => {
  localStorage.clear()
  mockNavigate.mockClear()
  mockRecordDashboardVisit.mockClear()
  mockLocation = { pathname: '/', search: '' }
})

describe('getLastRoute / clearLastRoute', () => {
  it('returns null when nothing is stored', () => {
    expect(getLastRoute()).toBeNull()
  })

  it('returns the stored last route', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/security')
    expect(getLastRoute()).toBe('/security')
  })

  it('clears both the last route and scroll positions', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/security')
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/security': 100 }))

    clearLastRoute()

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
    expect(localStorage.getItem(SCROLL_POSITIONS_KEY)).toBeNull()
  })
})

describe('getRememberPosition / setRememberPosition', () => {
  it('defaults to false when no preference is stored', () => {
    expect(getRememberPosition('/security')).toBe(false)
  })

  it('returns true after being set for a path', () => {
    setRememberPosition('/security', true)
    expect(getRememberPosition('/security')).toBe(true)
  })

  it('tracks preferences per-path independently', () => {
    setRememberPosition('/security', true)
    setRememberPosition('/alerts', false)

    expect(getRememberPosition('/security')).toBe(true)
    expect(getRememberPosition('/alerts')).toBe(false)
    expect(getRememberPosition('/unrelated')).toBe(false)
  })

  it('preserves existing preferences when adding a new one', () => {
    setRememberPosition('/security', true)
    setRememberPosition('/alerts', true)

    expect(getRememberPosition('/security')).toBe(true)
    expect(getRememberPosition('/alerts')).toBe(true)
  })

  it('falls back to false when stored JSON is corrupt', () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, '{not-json')
    expect(getRememberPosition('/security')).toBe(false)
  })
})

describe('__testables.getFirstDashboardRoute', () => {
  it('returns "/" when no sidebar config is stored', () => {
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })

  it('returns the first primaryNav href from sidebar config', () => {
    localStorage.setItem(
      SIDEBAR_CONFIG_KEY,
      JSON.stringify({ primaryNav: [{ href: '/workloads' }, { href: '/security' }] })
    )
    expect(__testables.getFirstDashboardRoute()).toBe('/workloads')
  })

  it('returns "/" when primaryNav is empty', () => {
    localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify({ primaryNav: [] }))
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })

  it('returns "/" when the first entry has no href', () => {
    localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify({ primaryNav: [{}] }))
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })

  it('returns "/" when stored sidebar config is corrupt JSON', () => {
    localStorage.setItem(SIDEBAR_CONFIG_KEY, '{not-json')
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })
})

describe('useLastRoute hook', () => {
  it('saves the current path (with query string) on path change', () => {
    mockLocation = { pathname: '/security', search: '?tab=issues' }
    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/security?tab=issues')
    expect(mockRecordDashboardVisit).toHaveBeenCalledWith('/security')
  })

  it('does not record the last route for auth pages', () => {
    mockLocation = { pathname: '/auth/callback', search: '' }
    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
    expect(mockRecordDashboardVisit).not.toHaveBeenCalled()
  })

  it('does not record the last route for the login page', () => {
    mockLocation = { pathname: '/login', search: '' }
    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })

  // NOTE: the "save last route" effect and the "restore on mount" effect both
  // fire on the same initial commit, in declaration order. The save effect
  // runs FIRST and unconditionally overwrites LAST_ROUTE_KEY with the current
  // pathname ('/'), so by the time the restore effect reads LAST_ROUTE_KEY it
  // always sees '/' — the pre-mount saved value is clobbered before it can be
  // used, and navigate() is never called from a cold mount at '/'. This test
  // pins that existing (surprising) behavior; see the filed coverage-gap
  // finding for the regression-risk this raises.
  it('does not redirect on a cold mount at "/" — the save effect clobbers the saved route before the restore effect reads it', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/workloads')
    mockLocation = { pathname: '/', search: '' }

    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when there is no saved last route', () => {
    mockLocation = { pathname: '/', search: '' }
    renderHook(() => useLastRoute())

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when the saved route is "/"', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/')
    mockLocation = { pathname: '/', search: '' }

    renderHook(() => useLastRoute())

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when mounted on a path other than "/"', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/workloads')
    mockLocation = { pathname: '/security', search: '' }

    renderHook(() => useLastRoute())

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep-link query params are present', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/workloads')
    mockLocation = { pathname: '/', search: '?mission=abc' }

    renderHook(() => useLastRoute())

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not use the first sidebar dashboard route as a fallback either, for the same clobbering reason', () => {
    localStorage.setItem(
      SIDEBAR_CONFIG_KEY,
      JSON.stringify({ primaryNav: [{ href: '/workloads' }] })
    )
    mockLocation = { pathname: '/', search: '' }

    renderHook(() => useLastRoute())

    // The `else if (!lastRoute && firstSidebarRoute ...)` branch also never
    // runs from a cold mount: by the time it is evaluated, the save effect
    // has already written '/' into LAST_ROUTE_KEY, so `lastRoute` is truthy
    // (it's '/') and the `!lastRoute` fallback branch is skipped too.
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('returns the last route and scroll positions from state', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/security')
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/security': 42 }))
    mockLocation = { pathname: '/security', search: '' }

    const { result } = renderHook(() => useLastRoute())

    expect(result.current.lastRoute).toBe('/security')
    expect(result.current.scrollPositions).toEqual({ '/security': 42 })
  })
})
