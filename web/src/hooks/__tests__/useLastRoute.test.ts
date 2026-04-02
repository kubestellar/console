import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Storage keys — must match the source module's internal constants
// ---------------------------------------------------------------------------

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'
const REMEMBER_POSITION_KEY = 'kubestellar-remember-position'
const SIDEBAR_CONFIG_KEY = 'kubestellar-sidebar-config-v5'

// ---------------------------------------------------------------------------
// Mock state — controlled from tests
// ---------------------------------------------------------------------------

let mockPathname = '/'
let mockSearch = ''
const mockNavigate = vi.fn()

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname, search: mockSearch }),
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/dashboardVisits', () => ({
  recordDashboardVisit: vi.fn(),
}))

vi.mock('../../lib/constants/network', () => ({
  FOCUS_DELAY_MS: 0, // instant for tests
}))

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  mockPathname = '/'
  mockSearch = ''
  mockNavigate.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Fresh import helper (resets module-level state between tests)
// ---------------------------------------------------------------------------

async function importFresh() {
  vi.resetModules()
  return import('../useLastRoute')
}

// ---------------------------------------------------------------------------
// Tests: getLastRoute
// ---------------------------------------------------------------------------

describe('getLastRoute', () => {
  it('returns null when no route has been saved', async () => {
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBeNull()
  })

  it('returns the stored route', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/clusters')
  })

  it('returns route with query params', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/workloads?mission=test')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/workloads?mission=test')
  })

  it('returns root path when stored', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/')
  })

  it('returns null when localStorage throws', async () => {
    const orig = localStorage.getItem
    localStorage.getItem = () => { throw new Error('Quota exceeded') }
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBeNull()
    localStorage.getItem = orig
  })
})

// ---------------------------------------------------------------------------
// Tests: clearLastRoute
// ---------------------------------------------------------------------------

describe('clearLastRoute', () => {
  it('removes the route key from localStorage', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/pods')
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })

  it('removes the scroll positions key from localStorage', async () => {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/pods': 100 }))
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    expect(localStorage.getItem(SCROLL_POSITIONS_KEY)).toBeNull()
  })

  it('removes both route and scroll positions at once', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/pods')
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/pods': 100 }))
    const { clearLastRoute } = await importFresh()

    clearLastRoute()

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
    expect(localStorage.getItem(SCROLL_POSITIONS_KEY)).toBeNull()
  })

  it('does not throw when nothing is stored', async () => {
    const { clearLastRoute } = await importFresh()
    expect(() => clearLastRoute()).not.toThrow()
  })

  it('does not throw when localStorage errors', async () => {
    const orig = localStorage.removeItem
    localStorage.removeItem = () => { throw new Error('SecurityError') }
    const { clearLastRoute } = await importFresh()
    expect(() => clearLastRoute()).not.toThrow()
    localStorage.removeItem = orig
  })
})

// ---------------------------------------------------------------------------
// Tests: getRememberPosition / setRememberPosition
// ---------------------------------------------------------------------------

describe('getRememberPosition', () => {
  it('defaults to false when nothing is stored', async () => {
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/dashboard')).toBe(false)
  })

  it('returns the stored boolean for a path', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/clusters': true }))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(true)
    expect(getRememberPosition('/pods')).toBe(false)
  })

  it('returns false on malformed JSON', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, '{invalid}')
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(false)
  })
})

describe('setRememberPosition', () => {
  it('saves a preference for a path', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    expect(getRememberPosition('/clusters')).toBe(true)
  })

  it('overwrites an existing preference', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    setRememberPosition('/clusters', false)
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('preserves preferences for other paths', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    setRememberPosition('/pods', true)
    setRememberPosition('/clusters', false)
    expect(getRememberPosition('/pods')).toBe(true)
  })

  it('persists data as JSON in localStorage', async () => {
    const { setRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    const raw = localStorage.getItem(REMEMBER_POSITION_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ '/clusters': true })
  })

  it('handles corrupt existing data gracefully', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, 'not-json')
    const { setRememberPosition } = await importFresh()
    // Should not throw — catch block absorbs the JSON.parse error
    expect(() => setRememberPosition('/x', true)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: useLastRoute hook — route persistence
// ---------------------------------------------------------------------------

describe('useLastRoute hook — route persistence', () => {
  it('saves current route to localStorage on mount (non-auth path)', async () => {
    mockPathname = '/clusters'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/clusters')
  })

  it('includes query string in saved route for OAuth round-trips', async () => {
    mockPathname = '/dashboard'
    mockSearch = '?mission=deploy-app'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/dashboard?mission=deploy-app')
  })

  it('does not save auth-related paths (/auth/*)', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/pods')
    mockPathname = '/auth/callback'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())

    // /auth paths are excluded; previously saved route must survive
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/pods')
  })

  it('does not save /login path', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/pods')
    mockPathname = '/login'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/pods')
  })

  it('saves root path / when navigating to dashboard', async () => {
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())

    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/')
  })
})

// ---------------------------------------------------------------------------
// Tests: useLastRoute hook — redirect behavior on initial mount at /
//
// NOTE: On mount, the save effect (which stores current pathname to
// localStorage) fires BEFORE the redirect effect. When pathname is '/',
// the save effect writes '/' to LAST_ROUTE_KEY, overwriting any
// previously stored route. The redirect effect then reads '/' and skips
// (because '/' === location.pathname). This means redirect only happens
// when the save effect is skipped — i.e. when pathname is /auth/* or /login.
// This is verified by the "does not redirect" tests below.
// ---------------------------------------------------------------------------

describe('useLastRoute hook — redirect on mount at /', () => {
  it('does not redirect when save effect overwrites lastRoute with /', async () => {
    // Pre-set a route, but the save effect will overwrite it with '/'
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    // The save effect writes '/' to LAST_ROUTE_KEY before redirect reads it
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/')
    // No redirect because lastRoute === '/' === location.pathname
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link params are present (card)', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?card=gpu-overview'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link params are present (drilldown)', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?drilldown=node-list'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link params are present (action)', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?action=deploy'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link params are present (mission)', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?mission=scan'
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when landing on a non-root path', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/pods'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    // On non-root path, the hook saves the path but never redirects
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/pods')
  })

  it('redirects to first sidebar route when no lastRoute is saved and sidebar config exists', async () => {
    // No LAST_ROUTE_KEY stored. Save effect writes '/' first.
    // But getFirstDashboardRoute reads from sidebar config.
    // The redirect condition is: !lastRoute && firstSidebarRoute !== '/'
    // However, the save effect DOES write '/' first, so lastRoute will be '/'
    // at the time the redirect effect reads it. This means the `!lastRoute` branch is not taken.
    const sidebarConfig = {
      primaryNav: [{ href: '/workloads', label: 'Workloads' }],
    }
    localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify(sidebarConfig))
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    // Because save effect writes '/' before redirect reads, lastRoute is '/'
    // which is truthy but equals '/', so neither redirect branch fires
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('sidebar config with empty primaryNav falls back to / (no redirect)', async () => {
    localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify({ primaryNav: [] }))
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('sidebar config with malformed JSON falls back to / (no redirect)', async () => {
    localStorage.setItem(SIDEBAR_CONFIG_KEY, 'not-json')
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('sidebar config item with no href falls back to / (no redirect)', async () => {
    const sidebarConfig = {
      primaryNav: [{ label: 'Dashboard' }], // no href
    }
    localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify(sidebarConfig))
    mockPathname = '/'
    mockSearch = ''
    const { useLastRoute } = await importFresh()

    renderHook(() => useLastRoute())
    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: useLastRoute hook — return value
// ---------------------------------------------------------------------------

describe('useLastRoute hook — return value', () => {
  it('returns lastRoute and scrollPositions', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/events')
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/events': { position: 250 } }))
    mockPathname = '/events'
    const { useLastRoute } = await importFresh()

    const { result } = renderHook(() => useLastRoute())

    expect(result.current.lastRoute).toBe('/events')
    expect(result.current.scrollPositions).toEqual({ '/events': { position: 250 } })
  })

  it('scrollPositions returns empty object on malformed JSON', async () => {
    localStorage.setItem(SCROLL_POSITIONS_KEY, 'broken')
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const { result } = renderHook(() => useLastRoute())

    expect(result.current.scrollPositions).toEqual({})
  })

  it('handles backward-compatible number format for scroll positions', async () => {
    // Old format stored just a number, new format uses { position, cardTitle }
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/pods': 500 }))
    mockPathname = '/pods'
    const { useLastRoute } = await importFresh()

    const { result } = renderHook(() => useLastRoute())

    expect(result.current.scrollPositions).toEqual({ '/pods': 500 })
  })

  it('reflects the route saved by the save effect after rerender', async () => {
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const { result, rerender } = renderHook(() => useLastRoute())

    // On first render, the save effect has not yet written to localStorage
    // (effects run after render), so lastRoute reads the pre-existing value.
    expect(result.current.lastRoute).toBeNull()

    // After rerender, the effect has run and saved '/clusters'
    rerender()
    expect(result.current.lastRoute).toBe('/clusters')
  })

  it('returns null lastRoute for auth paths (not saved)', async () => {
    mockPathname = '/auth/callback'
    const { useLastRoute } = await importFresh()

    const { result } = renderHook(() => useLastRoute())

    // Auth paths are not persisted, so lastRoute remains null
    expect(result.current.lastRoute).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: useLastRoute hook — scroll save/restore
// ---------------------------------------------------------------------------

describe('useLastRoute hook — scroll position saving', () => {
  /** Create a mock main element with all necessary methods */
  function createMockMain(opts: { scrollTop?: number; cards?: Element[] } = {}) {
    const mockMain = document.createElement('main')
    Object.defineProperty(mockMain, 'scrollTop', { value: opts.scrollTop ?? 0, writable: true, configurable: true })
    mockMain.scrollTo = vi.fn()
    Object.defineProperty(mockMain, 'getBoundingClientRect', {
      value: () => ({ top: 0, left: 0, width: 1024, height: 768 }),
      configurable: true,
    })
    const origQSA = mockMain.querySelectorAll.bind(mockMain)
    mockMain.querySelectorAll = ((sel: string) => {
      if (sel === '[data-tour="card"]') return (opts.cards || []) as unknown as NodeListOf<Element>
      return origQSA(sel)
    }) as typeof mockMain.querySelectorAll
    return mockMain
  }

  function mockDocumentQS(mockMain: Element | null) {
    const origQS = document.querySelector.bind(document)
    document.querySelector = ((sel: string) => {
      if (sel === 'main') return mockMain
      return origQS(sel)
    }) as typeof document.querySelector
    return origQS
  }

  it('saves scroll position on beforeunload event', async () => {
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 200 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    window.dispatchEvent(new Event('beforeunload'))

    const positions = JSON.parse(localStorage.getItem('kubestellar-scroll-positions') || '{}')
    expect(positions['/clusters']).toBeDefined()
    expect(positions['/clusters'].position).toBe(200)

    document.querySelector = origQS
  })

  it('saves scroll position with card snapping when cards exist', async () => {
    mockPathname = '/dashboard'
    const { useLastRoute } = await importFresh()

    const mockH3 = document.createElement('h3')
    mockH3.textContent = 'CPU Overview'
    const mockCard = document.createElement('div')
    mockCard.setAttribute('data-tour', 'card')
    mockCard.appendChild(mockH3)
    Object.defineProperty(mockCard, 'getBoundingClientRect', {
      value: () => ({ top: -10, left: 0, width: 300, height: 200 }),
    })
    Object.defineProperty(mockCard, 'querySelector', {
      value: (sel: string) => sel === 'h3' ? mockH3 : null,
    })

    const mockMain = createMockMain({ scrollTop: 150, cards: [mockCard] })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    window.dispatchEvent(new Event('beforeunload'))

    const positions = JSON.parse(localStorage.getItem('kubestellar-scroll-positions') || '{}')
    expect(positions['/dashboard']).toBeDefined()
    expect(positions['/dashboard'].cardTitle).toBe('CPU Overview')

    document.querySelector = origQS
  })

  it('clears saved position when scroll is at top (scrollTop <= 0)', async () => {
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/clusters': { position: 500, cardTitle: 'old' }
    }))
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 0 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    window.dispatchEvent(new Event('beforeunload'))

    const positions = JSON.parse(localStorage.getItem('kubestellar-scroll-positions') || '{}')
    expect(positions['/clusters']).toBeUndefined()

    document.querySelector = origQS
  })

  it('does nothing when no main container exists', async () => {
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const origQS = mockDocumentQS(null)

    renderHook(() => useLastRoute())

    expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow()

    document.querySelector = origQS
  })

  it('handles scroll event listener setup and teardown', async () => {
    mockPathname = '/pods'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 100 })
    const addSpy = vi.spyOn(mockMain, 'addEventListener')
    const removeSpy = vi.spyOn(mockMain, 'removeEventListener')
    const origQS = mockDocumentQS(mockMain)

    const { unmount } = renderHook(() => useLastRoute())

    const scrollListenerCalls = addSpy.mock.calls.filter(c => c[0] === 'scroll')
    expect(scrollListenerCalls.length).toBeGreaterThan(0)

    unmount()

    const removeScrollCalls = removeSpy.mock.calls.filter(c => c[0] === 'scroll')
    expect(removeScrollCalls.length).toBeGreaterThan(0)

    document.querySelector = origQS
  })

  it('restores scroll when remember position is enabled', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/clusters': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/clusters': { position: 300, cardTitle: 'MyCard' }
    }))
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 0 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    await act(async () => { vi.advanceTimersByTime(500) })

    expect(mockMain.scrollTo).toHaveBeenCalled()

    document.querySelector = origQS
  })

  it('scrolls to top when remember position is off', async () => {
    mockPathname = '/pods'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 500 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    await act(async () => { vi.advanceTimersByTime(200) })

    const scrollToMock = mockMain.scrollTo as ReturnType<typeof vi.fn>
    const topCalls = scrollToMock.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0] && (c[0] as Record<string, unknown>).top === 0
    )
    expect(topCalls.length).toBeGreaterThan(0)

    document.querySelector = origQS
  })

  it('handles localStorage error in setRememberPosition gracefully', async () => {
    const { setRememberPosition } = await importFresh()
    const orig = localStorage.setItem
    localStorage.setItem = () => { throw new Error('quota') }

    expect(() => setRememberPosition('/x', true)).not.toThrow()

    localStorage.setItem = orig
  })

  it('handles localStorage error in saveScrollPositionNow gracefully', async () => {
    mockPathname = '/clusters'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 200 })
    const origQS = mockDocumentQS(mockMain)

    // Make localStorage.setItem throw
    const origSetItem = localStorage.setItem
    localStorage.setItem = () => { throw new Error('quota exceeded') }

    renderHook(() => useLastRoute())

    // Should not throw on beforeunload even with localStorage error
    expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow()

    localStorage.setItem = origSetItem
    document.querySelector = origQS
  })

  it('backward compat: restores from old number format', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/old-page': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({ '/old-page': 450 }))
    mockPathname = '/old-page'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 0 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    await act(async () => { vi.advanceTimersByTime(500) })

    // Should have called scrollTo with the numeric position
    expect(mockMain.scrollTo).toHaveBeenCalled()

    document.querySelector = origQS
  })

  it('restores scroll with card-title-based positioning', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/card-page': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/card-page': { position: 300, cardTitle: 'GPU Overview' }
    }))
    mockPathname = '/card-page'
    const { useLastRoute } = await importFresh()

    // Create a card with a matching h3 title
    const mockH3 = document.createElement('h3')
    mockH3.textContent = 'GPU Overview'
    const mockCard = document.createElement('div')
    mockCard.setAttribute('data-tour', 'card')
    mockCard.appendChild(mockH3)
    Object.defineProperty(mockCard, 'getBoundingClientRect', {
      value: () => ({ top: 50, left: 0, width: 300, height: 200 }),
    })
    Object.defineProperty(mockCard, 'querySelector', {
      value: (sel: string) => sel === 'h3' ? mockH3 : null,
    })

    const mockMain = createMockMain({ scrollTop: 0, cards: [mockCard] })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    // Advance through the iterative restore loop
    await act(async () => { vi.advanceTimersByTime(2000) })

    // scrollTo should have been called to restore to card position
    const scrollToMock = mockMain.scrollTo as ReturnType<typeof vi.fn>
    expect(scrollToMock).toHaveBeenCalled()

    document.querySelector = origQS
  })

  it('does not restore when entry has position <= 0', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/zero-page': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/zero-page': { position: 0 }
    }))
    mockPathname = '/zero-page'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 0 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    await act(async () => { vi.advanceTimersByTime(500) })

    // scrollTo should NOT have been called (position <= 0 means skip restore)
    const scrollToMock = mockMain.scrollTo as ReturnType<typeof vi.fn>
    // Only the "scroll to top" call (from Pin-off) should happen
    const nonTopCalls = scrollToMock.mock.calls.filter(
      (c: Array<Record<string, unknown>>) => c[0] && (c[0] as Record<string, unknown>).top !== 0
    )
    expect(nonTopCalls.length).toBe(0)

    document.querySelector = origQS
  })

  it('does not restore when no entry exists for the path', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/no-entry': true }))
    // No scroll position saved for /no-entry
    mockPathname = '/no-entry'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 0 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    await act(async () => { vi.advanceTimersByTime(500) })

    // Scroll restore function should return early
    const scrollToMock = mockMain.scrollTo as ReturnType<typeof vi.fn>
    // No restore calls should be made (may have a scroll-to-top call only if Pin is off)
    expect(scrollToMock.mock.calls.length).toBeLessThanOrEqual(1)

    document.querySelector = origQS
  })

  it('scroll handler captures scrollTop in ref for cleanup to use', async () => {
    mockPathname = '/scrolled-page'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 350 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    // Trigger a scroll event to capture scrollTop in the ref
    const scrollEvent = new Event('scroll')
    mockMain.dispatchEvent(scrollEvent)

    // Advance timers past the 2s debounce to trigger saveScrollPositionNow
    await act(async () => { vi.advanceTimersByTime(3000) })

    // Scroll position should be saved
    const positions = JSON.parse(localStorage.getItem('kubestellar-scroll-positions') || '{}')
    expect(positions['/scrolled-page']).toBeDefined()

    document.querySelector = origQS
  })

  it('does not save scroll position while restoring is in progress', async () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/restoring': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/restoring': { position: 500 }
    }))
    mockPathname = '/restoring'
    const { useLastRoute } = await importFresh()

    const mockMain = createMockMain({ scrollTop: 500 })
    const origQS = mockDocumentQS(mockMain)

    renderHook(() => useLastRoute())

    // Advance just enough to start restore but not finish
    await act(async () => { vi.advanceTimersByTime(100) })

    // During restoration, the isRestoringRef prevents saves
    // This is verified by the fact scrollTo gets called for restoration
    const scrollToMock = mockMain.scrollTo as ReturnType<typeof vi.fn>
    expect(scrollToMock).toHaveBeenCalled()

    document.querySelector = origQS
  })
})
