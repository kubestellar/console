/**
 * AuthCallback CONTRACT tests
 *
 * These tests verify that AuthCallback correctly handles the /auth/refresh
 * response contract. The backend MUST return { token: string, onboarded: boolean }
 * for OAuth login to work.
 *
 * See: commit 25e464fa (broke the contract), commit be946db9 (restored it).
 * DO NOT remove these tests without also updating the backend RefreshToken handler.
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

describe('AuthCallback /auth/refresh contract', () => {
  it('navigates to home when response has { token, onboarded: true }', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-xxx', onboarded: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith('jwt-xxx', true)
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('navigates to login error when response has { refreshed: true } but no token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ refreshed: true }),
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

  it('passes onboarded=false correctly when user is not onboarded', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'jwt-new-user', onboarded: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    renderAuthCallback()

    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith('jwt-new-user', false)
    })
  })
})
