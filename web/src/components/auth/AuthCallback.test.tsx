/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

vi.mock('../../hooks/mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    setToken: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../../hooks/useLastRoute', () => ({
  getLastRoute: () => null,
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: vi.fn(() => null),
  safeRemoveItem: vi.fn(),
}))

// Mock fetch to prevent real /auth/refresh request from hanging in jsdom.
// Return a pending promise so the effect stays in the loading state
// (i.e., status stays 'authCallback.fetchingUserInfo' and doesn't advance
// to the .catch handler's 'authCallback.completingSignIn').
vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

import { AuthCallback } from './AuthCallback'

describe('AuthCallback Component', () => {
  it('renders without crashing', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <AuthCallback />
        </MemoryRouter>,
      ),
    ).not.toThrow()
  })

  it('renders the signing-in status text', () => {
    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    )
    // The useEffect runs immediately and updates status from signingIn
    // to fetchingUserInfo (no error in searchParams), so the displayed
    // text is the fetchingUserInfo key after the effect completes
    expect(screen.getByText('authCallback.fetchingUserInfo')).toBeInTheDocument()
  })

  it('renders a loading spinner', () => {
    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
