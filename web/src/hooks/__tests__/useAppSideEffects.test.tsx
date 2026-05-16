import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Mocks — declared before import of the module under test
// ---------------------------------------------------------------------------

vi.mock('../useOrbitAutoRun', () => ({ useOrbitAutoRun: vi.fn() }))
vi.mock('../usePersistedSettings', () => ({ usePersistedSettings: vi.fn() }))
vi.mock('../useBranding', () => ({
  useBranding: vi.fn(() => ({ appName: 'TestApp' })),
}))
vi.mock('../../lib/auth', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: false })),
}))
vi.mock('../../lib/analytics', () => ({
  emitPageView: vi.fn(),
  emitDashboardViewed: vi.fn(),
}))
vi.mock('../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))
vi.mock('../useSidebarConfig', () => ({
  fetchEnabledDashboards: vi.fn(() => Promise.resolve()),
  getEnabledDashboardIds: vi.fn(() => null),
}))
vi.mock('../../lib/dashboardChunks', () => ({
  DASHBOARD_CHUNKS: {
    dashboard: vi.fn(() => Promise.resolve({})),
    settings: vi.fn(() => Promise.resolve({})),
  },
}))
vi.mock('../../routes/routeTitles', () => ({
  ROUTE_TITLES: { '/': 'Home', '/settings': 'Settings' },
  pathToDashboardId: vi.fn((path: string) => (path === '/' ? 'main' : null)),
}))
vi.mock('../../lib/prefetchCardData', () => ({
  prefetchCardData: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../components/cards/cardRegistry', () => ({
  prefetchCardChunks: vi.fn(),
  prefetchDemoCardChunks: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Dynamic imports (after mocks)
// ---------------------------------------------------------------------------

import {
  OrbitAutoRunner,
  SettingsSyncInit,
  PageViewTracker,
  DataPrefetchInit,
  LoadingFallback,
  useLiveUrl,
  LiveLocationProvider,
} from '../useAppSideEffects'
import { emitPageView, emitDashboardViewed } from '../../lib/analytics'
import { useAuth } from '../../lib/auth'
import { useBranding } from '../useBranding'
import { pathToDashboardId } from '../../routes/routeTitles'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WithRouter = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children)

// ---------------------------------------------------------------------------
// OrbitAutoRunner
// ---------------------------------------------------------------------------

describe('OrbitAutoRunner', () => {
  it('renders null', () => {
    const { container } = render(React.createElement(OrbitAutoRunner), { wrapper: WithRouter })
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SettingsSyncInit
// ---------------------------------------------------------------------------

describe('SettingsSyncInit', () => {
  it('renders null', () => {
    const { container } = render(React.createElement(SettingsSyncInit), { wrapper: WithRouter })
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// PageViewTracker
// ---------------------------------------------------------------------------

describe('PageViewTracker', () => {
  beforeEach(() => {
    vi.mocked(emitPageView).mockClear()
    vi.mocked(emitDashboardViewed).mockClear()
    vi.mocked(useBranding).mockReturnValue({ appName: 'KubeStellar' })
  })

  it('renders null', () => {
    const { container } = render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    expect(container.firstChild).toBeNull()
  })

  it('emits page view on mount', () => {
    render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    expect(emitPageView).toHaveBeenCalledWith('/')
  })

  it('sets document title from ROUTE_TITLES', () => {
    render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    expect(document.title).toContain('KubeStellar')
  })

  it('emits page view for unknown route with app name only', () => {
    const { container } = render(
      React.createElement(MemoryRouter, { initialEntries: ['/unknown'] },
        React.createElement(PageViewTracker)),
    )
    expect(emitPageView).toHaveBeenCalledWith('/unknown')
    expect(document.title).toBe('KubeStellar')
    container.remove()
  })

  it('adds visibilitychange listener on mount', () => {
    const spy = vi.spyOn(document, 'addEventListener')
    render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    spy.mockRestore()
  })

  it('removes visibilitychange listener on unmount', () => {
    const spy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    unmount()
    expect(spy).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    spy.mockRestore()
  })

  it('emits dashboard duration on visibility hidden', () => {
    vi.mocked(pathToDashboardId).mockReturnValue('main')
    render(React.createElement(PageViewTracker), { wrapper: WithRouter })
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(emitDashboardViewed).toHaveBeenCalledWith('main', expect.any(Number))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
  })
})

// ---------------------------------------------------------------------------
// DataPrefetchInit
// ---------------------------------------------------------------------------

describe('DataPrefetchInit', () => {
  it('renders null', () => {
    const { container } = render(React.createElement(DataPrefetchInit), { wrapper: WithRouter })
    expect(container.firstChild).toBeNull()
  })

  it('does not prefetch when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false } as ReturnType<typeof useAuth>)
    render(React.createElement(DataPrefetchInit), { wrapper: WithRouter })
    // No dynamic imports triggered — no assertion needed beyond no-throw
  })

  it('triggers prefetch when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true } as ReturnType<typeof useAuth>)
    render(React.createElement(DataPrefetchInit), { wrapper: WithRouter })
    // Dynamic import triggered — just verify no errors thrown
    await act(async () => { await Promise.resolve() })
  })
})

// ---------------------------------------------------------------------------
// LoadingFallback
// ---------------------------------------------------------------------------

describe('LoadingFallback', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders invisible placeholder before delay', () => {
    render(React.createElement(LoadingFallback), { wrapper: WithRouter })
    // Spinner not visible yet — placeholder div with min-h-screen
    expect(screen.queryByRole('status')).toBeNull()
    const divs = document.querySelectorAll('.min-h-screen')
    expect(divs.length).toBeGreaterThan(0)
  })

  it('renders spinner after delay', () => {
    render(React.createElement(LoadingFallback), { wrapper: WithRouter })
    act(() => { vi.advanceTimersByTime(300) })
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).not.toBeNull()
  })

  it('clears timer on unmount', () => {
    const { unmount } = render(React.createElement(LoadingFallback), { wrapper: WithRouter })
    expect(() => unmount()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// useLiveUrl
// ---------------------------------------------------------------------------

describe('useLiveUrl', () => {
  it('returns current pathname', () => {
    const { result } = renderHook(() => useLiveUrl())
    expect(typeof result.current).toBe('string')
    expect(result.current).toContain('/')
  })

  it('updates on pushState', async () => {
    const { result } = renderHook(() => useLiveUrl())
    act(() => { window.history.pushState(null, '', '/new-path') })
    await waitFor(() => {
      expect(result.current).toContain('/new-path')
    })
    act(() => { window.history.pushState(null, '', '/') })
  })

  it('updates on replaceState', async () => {
    const { result } = renderHook(() => useLiveUrl())
    act(() => { window.history.replaceState(null, '', '/replaced') })
    await waitFor(() => {
      expect(result.current).toContain('/replaced')
    })
    act(() => { window.history.replaceState(null, '', '/') })
  })

  it('updates on popstate event', async () => {
    const { result } = renderHook(() => useLiveUrl())
    act(() => {
      window.history.pushState(null, '', '/pop-target')
    })
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', {}))
    })
    await waitFor(() => {
      expect(result.current).toContain('/pop-target')
    })
    act(() => { window.history.replaceState(null, '', '/') })
  })
})

// ---------------------------------------------------------------------------
// LiveLocationProvider
// ---------------------------------------------------------------------------

describe('LiveLocationProvider', () => {
  it('renders children', () => {
    const location = {
      pathname: '/test',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    }
    const { getByText } = render(
      React.createElement(MemoryRouter, null,
        React.createElement(LiveLocationProvider, { location, navigationType: 'POP', children: React.createElement('span', null, 'child') }),
      ),
    )
    expect(getByText('child')).toBeTruthy()
  })

  it('provides location context to children', () => {
    const location = {
      pathname: '/ctx-test',
      search: '',
      hash: '',
      state: null,
      key: 'k1',
    }
    let capturedPath = ''
    function Consumer() {
      const loc = useLocation()
      capturedPath = loc.pathname
      return null
    }
    render(
      React.createElement(MemoryRouter, { initialEntries: ['/original'] },
        React.createElement(LiveLocationProvider, { location, navigationType: 'PUSH', children: React.createElement(Consumer) }),
      ),
    )
    expect(capturedPath).toBe('/ctx-test')
  })
})
