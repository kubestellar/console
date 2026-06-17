import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import NotFound from './NotFound'
import { ROUTES } from '../config/routes'

const mockNavigate = vi.fn()
const mockLocation = vi.hoisted(() => ({
  pathname: '/nonexistent-page',
  hash: '',
  search: '',
  state: null,
  key: 'test-key',
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('../lib/demoMode', () => ({
  activatePublicDemoMode: vi.fn(),
}))

describe('NotFound Component', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    Object.assign(mockLocation, {
      pathname: '/nonexistent-page',
      hash: '',
      search: '',
      state: null,
      key: 'test-key',
    })
  })

  it('renders the 404 page', () => {
    render(<NotFound />)
    expect(screen.getByText('Page not found')).toBeTruthy()
  })

  it('displays the current pathname in the error message', () => {
    render(<NotFound />)
    expect(screen.getByText(/\/nonexistent-page/)).toBeTruthy()
  })

  it('renders the main heading', () => {
    render(<NotFound />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toContain('Page not found')
  })

  it('renders the feature request CTA section', () => {
    render(<NotFound />)
    expect(screen.getByText(/Ship it in hours, not months/)).toBeTruthy()
  })

  it('renders the feature request button with correct href', () => {
    render(<NotFound />)
    const button = screen.getByRole('link', { name: /Request this feature/ })
    expect(button).toBeTruthy()
    expect(button.getAttribute('href')).toContain('github.com/kubestellar/console/issues/new')
    expect(button.getAttribute('href')).toContain('nonexistent-page')
  })

  it('opens feature request link in a new tab', () => {
    render(<NotFound />)
    const button = screen.getByRole('link', { name: /Request this feature/ })
    expect(button.getAttribute('target')).toBe('_blank')
    expect(button.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('renders all quick link buttons', () => {
    render(<NotFound />)
    expect(screen.getByRole('button', { name: /Dashboard/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Clusters/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Compliance/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Deploy/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Marketplace/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cost/ })).toBeTruthy()
  })

  it('navigates to home when Home button is clicked', () => {
    render(<NotFound />)
    const homeButton = screen.getByRole('button', { name: /Home/ })
    fireEvent.click(homeButton)
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.HOME)
  })

  it('navigates back when Go back button is clicked', () => {
    render(<NotFound />)
    const backButton = screen.getByRole('button', { name: /Go back/ })
    fireEvent.click(backButton)
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('calls activatePublicDemoMode when quick link is clicked', () => {
    const { activatePublicDemoMode } = require('../lib/demoMode')
    render(<NotFound />)
    const dashboardButton = screen.getByRole('button', { name: /Dashboard/ })
    fireEvent.click(dashboardButton)
    expect(activatePublicDemoMode).toHaveBeenCalled()
  })

  it('renders the compass icon', () => {
    const { container } = render(<NotFound />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('displays helpful description text', () => {
    render(<NotFound />)
    const description = screen.getByText(/doesn't exist yet — but it could!/)
    expect(description).toBeTruthy()
  })

  it('displays the popular pages section', () => {
    render(<NotFound />)
    expect(screen.getByText(/Popular pages/)).toBeTruthy()
  })

  it('includes KubeStellar messaging about fast iteration', () => {
    render(<NotFound />)
    expect(screen.getByText(/KubeStellar Console uses AI-powered repo automation/)).toBeTruthy()
  })

  it('correctly encodes feature request URL with path', () => {
    Object.assign(mockLocation, {
      pathname: '/special/path?with=query',
    })
    render(<NotFound />)
    const button = screen.getByRole('link', { name: /Request this feature/ })
    const href = button.getAttribute('href')
    expect(href).toContain(encodeURIComponent('/special/path?with=query'))
  })
})
