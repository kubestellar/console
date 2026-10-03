/**
 * Tests for scroll-position restoration and misc helper constants/edge cases
 * in useLastRoute.ts.
 *
 * Covers: restoreScrollPosition, __testables key constants, getFirstDashboardRoute edge cases
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------- Storage keys (must match source) ----------


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

describe('restoreScrollPosition (via hook navigation path)', () => {
  let main: HTMLElement

  beforeEach(() => {
    main = document.createElement('main')
    main.scrollTo = vi.fn()
    document.body.appendChild(main)
    localStorage.clear()
    mockNavigate.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (main.parentNode) main.parentNode.removeChild(main)
  })

  it('scrolls to top when remember-position is false for the path', () => {
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/clusters': false }))
    mockPathname = '/clusters'
    renderHook(() => useLastRoute())
    expect(main.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
  })

  it('restores scroll when remember-position is true for the path', () => {
    vi.useFakeTimers()
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/clusters': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/clusters': { position: 400, cardTitle: undefined }
    }))
    mockPathname = '/clusters'
    renderHook(() => useLastRoute())
    // restoreScrollPosition is called inside a setTimeout(…, 50) in the navigation effect
    vi.advanceTimersByTime(100)
    // scrollTo should be called with the saved position
    expect(main.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 400 }))
    vi.useRealTimers()
  })

  it('restores by cardTitle when card with matching h3 exists', () => {
    vi.useFakeTimers()
    localStorage.setItem('kubestellar-remember-position', JSON.stringify({ '/dashboard': true }))
    localStorage.setItem('kubestellar-scroll-positions', JSON.stringify({
      '/dashboard': { position: 500, cardTitle: 'GPU Status' }
    }))

    const card = document.createElement('div')
    card.setAttribute('data-tour', 'card')
    const h3 = document.createElement('h3')
    h3.textContent = 'GPU Status'
    card.appendChild(h3)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
      top: 520, left: 0, right: 400, bottom: 700, width: 400, height: 180,
      x: 0, y: 520, toJSON: () => ({})
    } as DOMRect)
    vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
      top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800,
      x: 0, y: 0, toJSON: () => ({})
    } as DOMRect)
    Object.defineProperty(main, 'scrollTop', { value: 0, configurable: true, writable: true })
    main.appendChild(card)

    mockPathname = '/dashboard'
    mockSearch = ''
    renderHook(() => useLastRoute())

    vi.advanceTimersByTime(200)
    // Should attempt to scroll to the card's position relative to the container
    expect(main.scrollTo).toHaveBeenCalled()
    const scrollCall = (main.scrollTo as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0]?.top !== undefined && call[0].top > 0
    )
    expect(scrollCall).toBeDefined()
    vi.useRealTimers()
  })
})

// ── __testables key constants ──

describe('__testables key constants', () => {
  it('exports correct storage key constants', async () => {
    const { __testables } = await importFresh()
    expect(__testables.LAST_ROUTE_KEY).toBe('kubestellar-last-route')
    expect(__testables.SCROLL_POSITIONS_KEY).toBe('kubestellar-scroll-positions')
    expect(__testables.REMEMBER_POSITION_KEY).toBe('kubestellar-remember-position')
    expect(__testables.SIDEBAR_CONFIG_KEY).toBe('kubestellar-sidebar-config-v5')
  })
})

// ── getFirstDashboardRoute edge cases ──

describe('getFirstDashboardRoute: edge cases', () => {
  it('returns "/" when first primaryNav item has empty string href', async () => {
    localStorage.setItem('kubestellar-sidebar-config-v5', JSON.stringify({
      primaryNav: [{ href: '', label: 'Empty Href' }],
    }))
    const { __testables } = await importFresh()
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })

  it('returns "/" when no sidebar config is stored', async () => {
    const { __testables } = await importFresh()
    expect(__testables.getFirstDashboardRoute()).toBe('/')
  })
})
