/**
 * AuthCallback CONTRACT tests (#6590)
 *
 * These tests verify that AuthCallback correctly handles the /auth/refresh
 * response contract: the backend returns { refreshed: true, onboarded: boolean }
 * and delivers the JWT EXCLUSIVELY via the HttpOnly kc_auth cookie. The token
 * MUST NOT appear in the JSON body — see #6590, #8087, #8091, #8092.
 *
 * AuthCallback bootstraps the user via refreshUser() which calls /api/me with
 * cookie credentials. setToken is no longer called from this flow because no
 * JS-readable JWT exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()
const mockSetToken = vi.fn()
const mockRefreshUser = vi.fn().mockResolvedValue(undefined)
const mockShowToast = vi.fn()

vi.mock('../../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../lib/auth', () => ({
  useAuth: () => ({
    setToken: mockSetToken,
    refreshUser: mockRefreshUser,
  }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../hooks/useLastRoute', () => ({
  getLastRoute: () => null,
}))

vi.mock('../../../config/routes', () => ({
  ROUTES: { HOME: '/' },
  getLoginWithError: (err: string) => `/login?error=${err}`,
}))

vi.mock('../../../lib/analytics', () => ({
  emitGitHubConnected: vi.fn(),
}))

vi.mock('../../../lib/utils/localStorage', () => ({
  safeGetItem: () => null,
  safeSetItem: vi.fn(),
  safeRemoveItem: vi.fn(),
}))

// Must import AFTER mocks are set up
import { AuthCallback } from '../AuthCallback'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render AuthCallback inside a MemoryRouter with optional search params */
function renderAuthCallback(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the hasProcessed ref by clearing module state
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthCallback /auth/refresh contract (#6590)', () => {
  it('navigates to home when response has { refreshed: true, onboarded: true }', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ refreshed: true, onboarded: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    // #6590 — setToken is intentionally NOT called: there is no JS-readable
    // JWT in the response. The cookie-only session is bootstrapped by
    // refreshUser(), which calls /api/me with cookie credentials.
    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled()
    })
    expect(mockSetToken).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('navigates to login error when response is missing the refreshed flag', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login?error=token_exchange_failed')
    })
  })

  it('navigates to login error on 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login?error=token_exchange_failed')
    })
  })

  it('navigates to login error on 403 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login?error=token_exchange_failed')
    })
  })

  it('handles onboarded=false from the response without crashing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ refreshed: true, onboarded: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockRefreshUser).toHaveBeenCalled()
    })
    expect(mockSetToken).not.toHaveBeenCalled()
  })
})
