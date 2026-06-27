import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import NotFound from './NotFound'
import { ROUTES } from '../config/routes'
import * as demoMode from '../lib/demoMode'

// Mock react-i18next
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'notFound.title': 'Page not found',
        'notFound.description': "doesn't exist yet — but it could!",
        'notFound.ctaTitle': 'Ship it in hours, not months',
        'notFound.ctaDescription': 'KubeStellar Console uses AI-powered repo automation to go from feature request to production in hours. Open an issue and watch the magic happen.',
        'notFound.ctaButton': 'Request this feature',
        'notFound.popularPages': 'Popular pages',
        'notFound.goBack': 'Go back',
        'notFound.home': 'Home',
        'quickLinks.dashboard': 'Dashboard',
        'quickLinks.clusters': 'Clusters',
        'quickLinks.compliance': 'Compliance',
        'quickLinks.deploy': 'Deploy',
        'quickLinks.marketplace': 'Marketplace',
        'quickLinks.cost': 'Cost',
      }
      return map[key] || key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/non-existent-page' }),
  }
})

// Mock demo mode
vi.mock('../lib/demoMode', () => ({
  activatePublicDemoMode: vi.fn(),
}))

describe('NotFound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 404 page with appropriate messaging', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    expect(screen.getByText('Page not found')).toBeInTheDocument()
    expect(screen.getByText(/doesn't exist yet — but it could!/)).toBeInTheDocument()
  })

  it('displays the current pathname in code block', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const codeElement = screen.getByText('/non-existent-page')
    expect(codeElement).toBeInTheDocument()
    expect(codeElement.tagName).toBe('CODE')
  })

  it('renders feature request button with correct URL', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const featureRequestLink = screen.getByRole('link', { name: /Request this feature/i })
    expect(featureRequestLink).toBeInTheDocument()
    expect(featureRequestLink).toHaveAttribute('href')
    expect(featureRequestLink.getAttribute('href')).toContain('github.com/kubestellar/console/issues/new')
    expect(featureRequestLink.getAttribute('href')).toContain('template=feature_request.yaml')
  })

  it('renders all quick link buttons', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    expect(screen.getByRole('button', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clusters/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Compliance/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deploy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marketplace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cost/i })).toBeInTheDocument()
  })

  it('activates demo mode and navigates when quick link is clicked', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const dashboardButton = screen.getByRole('button', { name: /Dashboard/i })
    fireEvent.click(dashboardButton)

    expect(demoMode.activatePublicDemoMode).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.HOME)
  })

  it('activates demo mode and navigates to home when Home button is clicked', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const homeButton = screen.getByRole('button', { name: /Home/i })
    fireEvent.click(homeButton)

    expect(demoMode.activatePublicDemoMode).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.HOME)
  })

  it('navigates back when Go back button is clicked', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    const goBackButton = screen.getByRole('button', { name: /Go back/i })
    fireEvent.click(goBackButton)

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('calls activatePublicDemoMode when quick link is clicked', () => {
    // activatePublicDemoMode imported at top level (mocked via vi.mock)
    render(<BrowserRouter><NotFound /></BrowserRouter>)
    const dashboardButton = screen.getByRole('button', { name: /Dashboard/ })
    fireEvent.click(dashboardButton)
    expect(demoMode.activatePublicDemoMode).toHaveBeenCalled()
  })

  it('displays KubeStellar pitch messaging', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    )

    expect(screen.getByText(/Ship it in hours, not months/i)).toBeInTheDocument()
    expect(screen.getByText(/AI-powered repo automation/i)).toBeInTheDocument()
  })
})
