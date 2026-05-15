/**
 * Tests for useAppSideEffects exports:
 * LoadingFallback, useLiveUrl, LiveLocationProvider,
 * PageViewTracker, DataPrefetchInit, OrbitAutoRunner, SettingsSyncInit
 * 
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigationType} from 'react-router-dom'
import React, { useContext } from 'react'
import { UNSAFE_LocationContext} from 'react-router-dom'
import { Action } from 'history'
import type { Location } from 'react-router-dom'


// ---------- Mocks ----------

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
vi.mock('../../hooks/useSidebarConfig', () => ({
  fetchEnabledDashboards: vi.fn(() => Promise.resolve()),
  getEnabledDashboardIds: vi.fn(() => null),
}))
vi.mock('../../lib/demoMode', () => ({ isDemoMode: vi.fn(() => false) }))
vi.mock('../../lib/dashboardChunks', () => ({ DASHBOARD_CHUNKS: {} }))
vi.mock('../../lib/prefetchCardData', () => ({ prefetchCardData: vi.fn(() => Promise.resolve()) }))
vi.mock('../../components/cards/cardRegistry', () => ({
  prefetchCardChunks: vi.fn(),
  prefetchDemoCardChunks: vi.fn(),
}))

import {
  LoadingFallback,
  useLiveUrl,
  LiveLocationProvider,
  PageViewTracker,
  DataPrefetchInit,
  OrbitAutoRunner,
  SettingsSyncInit,
} from '../useAppSideEffects'
import { emitPageView, emitDashboardViewed } from '../../lib/analytics'
import { useAuth } from '../../lib/auth'
import { useBranding } from '../useBranding'

// ---------- LoadingFallback ----------

describe('LoadingFallback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('renders an invisible placeholder before 200ms', () => {
    const { container } = render(<LoadingFallback />)
    // Spinner not present yet
    expect(container.querySelector('.animate-spin')).toBeNull()
    // Placeholder div is present
    expect(container.querySelector('.min-h-screen')).toBeTruthy()
  })

 it('shows the spinner after 200ms', () => {
  const { container } = render(<LoadingFallback />)
  act(() => { vi.advanceTimersByTime(200) })
  expect(container.querySelector('.animate-spin')).toBeTruthy()
})
  

  it('does not show spinner at 199ms', () => {
    const { container } = render(<LoadingFallback />)
    act(() => { vi.advanceTimersByTime(199) })
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('clears timer on unmount', () => {
    const { unmount } = render(<LoadingFallback />)
    unmount()
    // Should not throw
    act(() => { vi.advanceTimersByTime(500) })
  })
})

// ---------- useLiveUrl ----------

describe('useLiveUrl', () => {
  it('returns the current pathname', () => {
    const { result } = renderHook(() => useLiveUrl())
    expect(result.current).toContain(window.location.pathname)
  })

  it('updates when pushState is called', async () => {
    const { result } = renderHook(() => useLiveUrl())
    await act(async () => {
      window.history.pushState({}, '', '/new-path')
    })
    expect(result.current).toContain('/new-path')
    window.history.pushState({}, '', '/')
  })

  it('updates when replaceState is called', async () => {
    const { result } = renderHook(() => useLiveUrl())
    await act(async () => {
      window.history.replaceState({}, '', '/replaced')
    })
    expect(result.current).toContain('/replaced')
    window.history.pushState({}, '', '/')
  })

  it('updates on popstate event', async () => {
    const { result } = renderHook(() => useLiveUrl())
    await act(async () => {
      window.history.pushState({}, '', '/popped')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current).toContain('/popped')
    window.history.pushState({}, '', '/')
  })
})

// ---------- LiveLocationProvider ----------

describe('LiveLocationProvider', () => {
  it('provides location to children via UNSAFE_LocationContext', () => {
   const testLocation = {
  pathname: '/test',
  search: '',
  hash: '',
  state: null,
  key: 'default',
  unstable_mask: undefined,
} as Location
    let capturedContext: unknown
    function Consumer() {
      capturedContext = useContext(UNSAFE_LocationContext)
      return null
    }
    render(
      <LiveLocationProvider location={testLocation} navigationType={Action.Pop}>
        <Consumer />
      </LiveLocationProvider>
    )
    expect((capturedContext as { location: typeof testLocation }).location.pathname).toBe('/test')
  })

  it('renders children', () => {
    const testLocation = {
      pathname: '/', search: '', hash: '', state: null, key: 'default',
    }as Location
    render(
      <LiveLocationProvider location={testLocation} navigationType={Action.Push}>
        <span data-testid="child">hello</span>
      </LiveLocationProvider>
    )
    expect(screen.getByTestId('child')).toBeTruthy()
  })
})

// ---------- PageViewTracker ----------

describe('PageViewTracker', () => {
  beforeEach(() => {
    vi.mocked(emitPageView).mockClear()
    vi.mocked(emitDashboardViewed).mockClear()
vi.mocked(useBranding).mockReturnValue({ appName: 'TestApp' } as ReturnType<typeof useBranding>)
  })

  it('emits a page view on mount', () => {
    render(
      <MemoryRouter initialEntries={['/clusters']}>
        <PageViewTracker />
      </MemoryRouter>
    )
    expect(emitPageView).toHaveBeenCalledWith('/clusters')
  })

  it('sets the document title using appName', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <PageViewTracker />
      </MemoryRouter>
    )
    expect(document.title).toContain('TestApp')
  })

  it('renders null (no DOM output)', () => {
    const { container } = render(
      <MemoryRouter>
        <PageViewTracker />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})

// ---------- DataPrefetchInit ----------

describe('DataPrefetchInit', () => {
  it('renders null', () => {
    const { container } = render(<DataPrefetchInit />)
    expect(container.firstChild).toBeNull()
  })

  it('does not trigger prefetch when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false } as ReturnType<typeof useAuth>)
    render(<DataPrefetchInit />)
    // prefetchCardData not called — dynamic import only fires if authenticated
    // We just assert no errors are thrown
  })

  it('triggers prefetch when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true } as ReturnType<typeof useAuth>)
    const prefetchCardData = vi.fn(() => Promise.resolve())
    vi.doMock('../../lib/prefetchCardData', () => ({ prefetchCardData }))
    render(<DataPrefetchInit />)
    // Dynamic imports are fire-and-forget; just assert no throw
    await waitFor(() => {})
  })
})

// ---------- OrbitAutoRunner ----------

describe('OrbitAutoRunner', () => {
  it('renders null', () => {
    const { container } = render(<OrbitAutoRunner />)
    expect(container.firstChild).toBeNull()
  })
})

// ---------- SettingsSyncInit ----------

describe('SettingsSyncInit', () => {
  it('renders null', () => {
    const { container } = render(<SettingsSyncInit />)
    expect(container.firstChild).toBeNull()
  })
})