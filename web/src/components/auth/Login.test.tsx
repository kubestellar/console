/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isAuthenticated: false,
    isLoading: false,
  }),
}))

vi.mock('../../lib/api', () => ({
  checkOAuthConfigured: () =>
    Promise.resolve({ backendUp: false, oauthConfigured: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Login } from './Login'

describe('Login Component', () => {
  const renderLogin = () =>
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

  it('renders without crashing', () => {
    expect(() => renderLogin()).not.toThrow()
  })

  it('renders the login page container', () => {
    renderLogin()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('renders the welcome heading', () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('renders the GitHub login button', () => {
    renderLogin()
    expect(
      screen.getByRole('button', { name: 'login.continueWithGitHub' }),
    ).toBeInTheDocument()
  })

  it('renders the KubeStellar branding', () => {
    renderLogin()
    expect(screen.getByText('KubeStellar')).toBeInTheDocument()
  })
})
