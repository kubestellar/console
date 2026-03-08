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
  checkOAuthConfigured: () => Promise.resolve({ backendUp: false, oauthConfigured: false }),
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
      </MemoryRouter>
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
    expect(screen.getByTestId('login-welcome-heading')).toBeInTheDocument()
  })

  it('renders the GitHub login button', () => {
    renderLogin()
    expect(screen.getByTestId('github-login-button')).toBeInTheDocument()
  })

  it('renders the KubeStellar branding', () => {
    renderLogin()
    expect(screen.getByText('KubeStellar')).toBeInTheDocument()
  })
})
