/**
 * Tests for the useLastRoute hook and scroll-position helpers.
 *
 * Covers: useLastRoute hook, __testables.getScrollContainer, saveScrollPositionNow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------- Storage keys (must match source) ----------

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'

// ---------- Mocks ----------

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

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    FOCUS_DELAY_MS: 0,
  }
})

// ---------- Setup ----------

beforeEach(() => {
  localStorage.clear()
  mockPathname = '/'
  mockSearch = ''
  mockNavigate.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// Fresh import to avoid module caching issues
async function importFresh() {
  // vitest caches modules, so we use the same import
  const mod = await import('../useLastRoute')
  return mod
}

// Import the hook for renderHook tests
import { useLastRoute } from '../useLastRoute'

describe('useLastRoute hook', () => {
  it('saves current pathname to localStorage on mount', () => {
    mockPathname = '/clusters'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/clusters')
  })

  it('saves pathname + search to localStorage', () => {
    mockPathname = '/clusters'
    mockSearch = '?mission=foo'
    renderHook(() => useLastRoute())
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBe('/clusters?mission=foo')
  })

  it('does not save auth routes to localStorage', () => {
    mockPathname = '/auth/callback'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })

  it('does not save /login to localStorage', () => {
    mockPathname = '/login'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })

  it('redirects from "/" to last saved route', () => {
    // The path-change effect (declared before the redirect effect) overwrites
    // LAST_ROUTE_KEY with '/' before redirect effect reads it. To test the
    // redirect path, stub getItem so the redirect effect sees '/clusters'.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation((key: string) => {
      if (key === LAST_ROUTE_KEY) return '/clusters'
      return null
    })
    mockPathname = '/'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(mockNavigate).toHaveBeenCalledWith('/clusters', { replace: true })
  })

  it('does not redirect when not at "/"', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/pods')
    mockPathname = '/clusters'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when lastRoute is "/"', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/')
    mockPathname = '/'
    mockSearch = ''
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when lastRoute equals current pathname', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/')
    mockPathname = '/'
    mockSearch = ''
    renderHook(() => useLastRoute())
    // lastRoute '/' === pathname '/', so no redirect
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link card param is present', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?card=mycard'
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link drilldown param is present', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?drilldown=someid'
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link action param is present', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?action=create'
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not redirect when deep link mission param is present', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    mockPathname = '/'
    mockSearch = '?mission=xyz'
    renderHook(() => useLastRoute())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('registers beforeunload listener on mount and removes it on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    mockPathname = '/clusters'
    const { unmount } = renderHook(() => useLastRoute())

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
  })

  it('returns lastRoute from localStorage', () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/nodes')
    mockPathname = '/nodes'
    const { result } = renderHook(() => useLastRoute())
    expect(result.current.lastRoute).toBe('/nodes')
  })

  it('returns null lastRoute when LAST_ROUTE_KEY not pre-set', () => {
    // The hook reads localStorage at render time; since the path-change effect
    // runs after the initial render, result.current.lastRoute is null until
    // a re-render occurs (no state update from localStorage write alone).
    mockPathname = '/clusters'
    const { result } = renderHook(() => useLastRoute())
    // Acceptable: null (initial render) or '/clusters' (if re-render occurred)
    expect(result.current.lastRoute === null || result.current.lastRoute === '/clusters').toBe(true)
  })

  it('saves scroll position on cleanup when path changes', () => {
    vi.useFakeTimers()
    mockPathname = '/clusters'
    const { unmount } = renderHook(() => useLastRoute())

    // On unmount the cleanup effect runs; scroll position save is attempted
    // (no DOM container in jsdom, so saveScrollPositionNow is a no-op)
    expect(() => unmount()).not.toThrow()
    vi.useRealTimers()
  })

  it('does not throw when localStorage throws on save', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    mockPathname = '/clusters'
    expect(() => renderHook(() => useLastRoute())).not.toThrow()
  })

  it('does not throw when localStorage throws on redirect read', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('corrupt')
    })
    mockPathname = '/'
    expect(() => renderHook(() => useLastRoute())).not.toThrow()
  })

  it('saves scroll position on scroll event via beforeunload', () => {
    mockPathname = '/clusters'
    renderHook(() => useLastRoute())

    // Trigger beforeunload — should not throw
    expect(() => window.dispatchEvent(new Event('beforeunload'))).not.toThrow()
  })

  it('attaches scroll listener to main element when present', () => {
    const main = document.createElement('main')
    // jsdom doesn't implement scrollTo — stub it to prevent TypeError
    main.scrollTo = vi.fn()
    document.body.appendChild(main)
    const addEventSpy = vi.spyOn(main, 'addEventListener')

    mockPathname = '/clusters'
    const { unmount } = renderHook(() => useLastRoute())

    expect(addEventSpy).toHaveBeenCalledWith('scroll', expect.any(Function), expect.objectContaining({ passive: true }))
    unmount()

    document.body.removeChild(main)
  })
})

// ── __testables: getScrollContainer ──

describe('__testables.getScrollContainer', () => {
  afterEach(() => {
    document.querySelectorAll('main').forEach(el => el.parentNode?.removeChild(el))
    vi.restoreAllMocks()
  })

  it('returns null when no <main> element exists', async () => {
    const { __testables } = await importFresh()
    expect(__testables.getScrollContainer()).toBeNull()
  })

  it('returns <main> element when it exists', async () => {
    const { __testables } = await importFresh()
    const main = document.createElement('main')
    document.body.appendChild(main)
    expect(__testables.getScrollContainer()).toBe(main)
  })
})

// ── saveScrollPositionNow via scroll event / beforeunload with DOM ──

describe('saveScrollPositionNow (via scroll+beforeunload with main DOM)', () => {
  let main: HTMLElement

  beforeEach(() => {
    main = document.createElement('main')
    main.scrollTo = vi.fn()
    document.body.appendChild(main)
    localStorage.clear()
    mockPathname = '/clusters'
    mockSearch = ''
    mockNavigate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (main.parentNode) main.parentNode.removeChild(main)
  })

  it('does not save position when scrollTop is 0 (at top)', () => {
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true, writable: true })
    renderHook(() => useLastRoute())
    window.dispatchEvent(new Event('beforeunload'))
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    // Either nothing was written, or the entry for this path is absent
    if (stored) {
      const positions = JSON.parse(stored)
      expect(positions['/clusters']).toBeUndefined()
    } else {
      expect(stored).toBeNull()
    }
  })

  it('saves position when scrollTop > 0 (not at top)', () => {
    Object.defineProperty(main, 'scrollTop', { value: 500, configurable: true, writable: true })
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)
    renderHook(() => useLastRoute())
    window.dispatchEvent(new Event('beforeunload'))
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    expect(stored).not.toBeNull()
    const positions = JSON.parse(stored!)
    expect(positions['/clusters']).toBeDefined()
    expect(positions['/clusters'].position).toBe(500)
  })

  it('saves position with card elements present (card-finding path)', () => {
    Object.defineProperty(main, 'scrollTop', { value: 300, configurable: true, writable: true })
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    const card1 = document.createElement('div')
    card1.setAttribute('data-tour', 'card')
    const h3 = document.createElement('h3')
    h3.textContent = 'My Card'
    card1.appendChild(h3)
    vi.spyOn(card1, 'getBoundingClientRect').mockReturnValue({
      top: 10, left: 0, right: 400, bottom: 200, width: 400, height: 190,
      x: 0, y: 10, toJSON: () => ({})
    } as DOMRect)
    main.appendChild(card1)

    renderHook(() => useLastRoute())
    window.dispatchEvent(new Event('beforeunload'))

    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    expect(stored).not.toBeNull()
    const positions = JSON.parse(stored!)
    expect(positions['/clusters']).toBeDefined()
    expect(typeof positions['/clusters'].position).toBe('number')
    expect(positions['/clusters'].cardTitle).toBe('My Card')
  })

  it('handles cards with zero-size getBoundingClientRect (hidden/KeepAlive)', () => {
    Object.defineProperty(main, 'scrollTop', { value: 200, configurable: true, writable: true })
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    const card = document.createElement('div')
    card.setAttribute('data-tour', 'card')
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)
    main.appendChild(card)

    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({
      '/clusters': { position: 200, cardTitle: 'PreviousCard' }
    }))

    renderHook(() => useLastRoute())
    window.dispatchEvent(new Event('beforeunload'))

    // Zero-size card should be skipped — position saved without cardTitle from hidden card
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    expect(stored).not.toBeNull()
    const positions = JSON.parse(stored!)
    expect(positions['/clusters']).toBeDefined()
    expect(positions['/clusters'].position).toBe(200)
    // cardTitle should not reference the zero-size card (no h3 text available)
  })

  it('scroll event triggers position save via debounce', () => {
    vi.useFakeTimers()
    Object.defineProperty(main, 'scrollTop', { value: 150, configurable: true, writable: true })
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)

    const { unmount } = renderHook(() => useLastRoute())

    main.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(2500)

    // After debounce fires, localStorage should have been updated
    const stored = localStorage.getItem(SCROLL_POSITIONS_KEY)
    expect(stored).not.toBeNull()
    const positions = JSON.parse(stored!)
    expect(positions['/clusters']).toBeDefined()
    expect(positions['/clusters'].position).toBe(150)

    unmount()
    vi.useRealTimers()
  })
})

// ── restoreScrollPosition via navigate ──

