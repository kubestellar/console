/**
 * Tests for pure exported functions in useLastRoute.ts
 *
 * Covers: getLastRoute, clearLastRoute, getRememberPosition, setRememberPosition
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------- Storage keys (must match source) ----------

const LAST_ROUTE_KEY = 'kubestellar-last-route'
const SCROLL_POSITIONS_KEY = 'kubestellar-scroll-positions'
const REMEMBER_POSITION_KEY = 'kubestellar-remember-position'

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

vi.mock('../../lib/constants/network', () => ({
  FOCUS_DELAY_MS: 0,
}))

// ---------- Setup ----------

beforeEach(() => {
  localStorage.clear()
  mockPathname = '/'
  mockSearch = ''
  mockNavigate.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Fresh import to avoid module caching issues
async function importFresh() {
  // vitest caches modules, so we use the same import
  const mod = await import('../useLastRoute')
  return mod
}

// ── getLastRoute ──

describe('getLastRoute', () => {
  it('returns null when nothing is stored', async () => {
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBeNull()
  })

  it('returns stored route path', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/clusters')
  })

  it('returns route with query parameters', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/workloads?mission=test')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/workloads?mission=test')
  })

  it('returns root path when stored', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/')
  })

  it('returns null gracefully when localStorage throws', async () => {
    const { getLastRoute } = await importFresh()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(getLastRoute()).toBeNull()
  })

  it('returns empty string when stored as empty', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '')
    const { getLastRoute } = await importFresh()
    // Empty string is falsy but not null
    expect(getLastRoute()).toBe('')
  })

  it('handles complex paths with hash fragments', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/dashboard?tab=gpu#section-2')
    const { getLastRoute } = await importFresh()
    expect(getLastRoute()).toBe('/dashboard?tab=gpu#section-2')
  })
})

// ── clearLastRoute ──

describe('clearLastRoute', () => {
  it('removes last route from localStorage', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })

  it('removes scroll positions from localStorage', async () => {
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/clusters': 500 }))
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    expect(localStorage.getItem(SCROLL_POSITIONS_KEY)).toBeNull()
  })

  it('removes both route and scroll positions together', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/settings')
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify({ '/settings': 200 }))
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
    expect(localStorage.getItem(SCROLL_POSITIONS_KEY)).toBeNull()
  })

  it('does not throw when nothing is stored', async () => {
    const { clearLastRoute } = await importFresh()
    expect(() => clearLastRoute()).not.toThrow()
  })

  it('does not throw when localStorage throws', async () => {
    const { clearLastRoute } = await importFresh()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage error')
    })
    expect(() => clearLastRoute()).not.toThrow()
  })

  it('does not remove remember-position preferences', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/clusters': true }))
    localStorage.setItem(LAST_ROUTE_KEY, '/clusters')
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    // Remember position prefs should survive
    expect(localStorage.getItem(REMEMBER_POSITION_KEY)).not.toBeNull()
  })

  it('can be called multiple times safely', async () => {
    localStorage.setItem(LAST_ROUTE_KEY, '/test')
    const { clearLastRoute } = await importFresh()
    clearLastRoute()
    clearLastRoute()
    clearLastRoute()
    expect(localStorage.getItem(LAST_ROUTE_KEY)).toBeNull()
  })
})

// ── getRememberPosition ──

describe('getRememberPosition', () => {
  it('returns false by default when nothing is stored', async () => {
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/dashboard')).toBe(false)
  })

  it('returns true for a path stored as true', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/clusters': true }))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(true)
  })

  it('returns false for a path stored as false', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/clusters': false }))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('returns false for a path not in the stored prefs', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/clusters': true }))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/pods')).toBe(false)
  })

  it('returns false when stored JSON is invalid', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, 'not-json{{{')
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('returns false when localStorage throws', async () => {
    const { getRememberPosition } = await importFresh()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('handles multiple paths independently', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({
      '/clusters': true,
      '/pods': false,
      '/settings': true,
    }))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/clusters')).toBe(true)
    expect(getRememberPosition('/pods')).toBe(false)
    expect(getRememberPosition('/settings')).toBe(true)
    expect(getRememberPosition('/unknown')).toBe(false)
  })

  it('returns false for empty stored object', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({}))
    const { getRememberPosition } = await importFresh()
    expect(getRememberPosition('/anything')).toBe(false)
  })
})

// ── setRememberPosition ──

describe('setRememberPosition', () => {
  it('stores true for a path', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    expect(getRememberPosition('/clusters')).toBe(true)
  })

  it('stores false for a path', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    setRememberPosition('/clusters', false)
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('preserves other paths when updating one', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    setRememberPosition('/pods', true)
    setRememberPosition('/clusters', false)
    expect(getRememberPosition('/pods')).toBe(true)
    expect(getRememberPosition('/clusters')).toBe(false)
  })

  it('persists to localStorage', async () => {
    const { setRememberPosition } = await importFresh()
    setRememberPosition('/clusters', true)
    const stored = JSON.parse(localStorage.getItem(REMEMBER_POSITION_KEY) || '{}')
    expect(stored['/clusters']).toBe(true)
  })

  it('does not throw when localStorage throws on write', async () => {
    const { setRememberPosition } = await importFresh()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => setRememberPosition('/x', true)).not.toThrow()
  })

  it('does not throw when localStorage throws on read during set', async () => {
    const { setRememberPosition } = await importFresh()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('corrupt')
    })
    expect(() => setRememberPosition('/x', true)).not.toThrow()
  })

  it('handles many paths without data loss', async () => {
    const { setRememberPosition, getRememberPosition } = await importFresh()
    const paths = ['/a', '/b', '/c', '/d', '/e', '/f', '/g', '/h']
    for (const p of paths) {
      setRememberPosition(p, true)
    }
    for (const p of paths) {
      expect(getRememberPosition(p)).toBe(true)
    }
    // Toggle one off
    setRememberPosition('/d', false)
    expect(getRememberPosition('/d')).toBe(false)
    expect(getRememberPosition('/e')).toBe(true)
  })

  it('merges into existing stored prefs without corruption', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, JSON.stringify({ '/existing': true }))
    const { setRememberPosition, getRememberPosition } = await importFresh()
    setRememberPosition('/new', true)
    expect(getRememberPosition('/existing')).toBe(true)
    expect(getRememberPosition('/new')).toBe(true)
  })

  it('overwrites corrupted stored JSON gracefully', async () => {
    localStorage.setItem(REMEMBER_POSITION_KEY, 'broken-json{{{')
    const { setRememberPosition } = await importFresh()
    // This should not throw -- the catch block handles parse errors
    expect(() => setRememberPosition('/x', true)).not.toThrow()
  })
})
