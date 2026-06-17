/**
 * NotFound Component Tests
 *
 * Tests for the 404 page component — validates messaging, CTA links,
 * quick-link buttons, and navigation behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ─── Mocks must come before module imports ────────────────────────────────────

const mockNavigate = vi.fn()
const mockLocation = { pathname: '/some/unknown/path' }

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}))

vi.mock('../../lib/demoMode', () => ({
  activatePublicDemoMode: vi.fn(),
}))

vi.mock('../../config/routes', () => ({
  ROUTES: {
    HOME: '/',
    CLUSTERS: '/clusters',
    COMPLIANCE: '/compliance',
    DEPLOY: '/deploy',
    MARKETPLACE: '/marketplace',
    COST: '/cost',
  },
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

// ─── Imports after mocks ──────────────────────────────────────────────────────

import NotFound from '../NotFound'
import { activatePublicDemoMode } from '../../lib/demoMode'

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('NotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.pathname = '/some/unknown/path'
  })

  it('renders the "Page not found" heading', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })

  it('displays the current path in the message', () => {
    mockLocation.pathname = '/my/missing/route'
    render(<NotFound />)
    expect(screen.getByText('/my/missing/route')).toBeTruthy()
  })

  it('renders the feature request CTA link with the correct GitHub URL', () => {
    mockLocation.pathname = '/test-path'
    render(<NotFound />)
    const link = screen.getByRole('link', { name: /Request this feature/i })
    expect(link).toBeTruthy()
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('https://github.com/kubestellar/console/issues/new')
    expect(href).toContain('feature_request.yaml')
    expect(href).toContain(encodeURIComponent('Feature request: /test-path'))
  })

  it('renders the feature request link with target="_blank" and rel="noopener noreferrer"', () => {
    render(<NotFound />)
    const link = screen.getByRole('link', { name: /Request this feature/i })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('renders quick link buttons for popular pages', () => {
    render(<NotFound />)
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Clusters')).toBeTruthy()
    expect(screen.getByText('Compliance')).toBeTruthy()
    expect(screen.getByText('Deploy')).toBeTruthy()
    expect(screen.getByText('Marketplace')).toBeTruthy()
    expect(screen.getByText('Cost')).toBeTruthy()
  })

  it('renders the "Popular pages" section label', () => {
    render(<NotFound />)
    expect(screen.getByText('Popular pages')).toBeTruthy()
  })

  it('navigates to home and activates demo mode when Home button is clicked', () => {
    render(<NotFound />)
    fireEvent.click(screen.getByRole('button', { name: /Home/i }))
    expect(activatePublicDemoMode).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('navigates back when "Go back" button is clicked', () => {
    render(<NotFound />)
    fireEvent.click(screen.getByRole('button', { name: /Go back/i }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
    // activatePublicDemoMode should NOT be called for plain back navigation
    expect(activatePublicDemoMode).not.toHaveBeenCalled()
  })

  it('activates demo mode when a quick link is clicked', () => {
    render(<NotFound />)
    fireEvent.click(screen.getByRole('button', { name: /Clusters/i }))
    expect(activatePublicDemoMode).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/clusters')
  })

  it('renders the "Ship it in hours" CTA section', () => {
    render(<NotFound />)
    expect(screen.getByText(/Ship it in hours/i)).toBeTruthy()
  })
})
