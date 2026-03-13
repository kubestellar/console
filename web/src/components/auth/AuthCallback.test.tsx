/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

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
    expect(screen.getByText('authCallback.signingIn')).toBeInTheDocument()
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
