import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { STORAGE_KEY_HAS_SESSION, STORAGE_KEY_TOKEN } from '../lib/constants'
import { InitialInfrastructureGate } from './InitialInfrastructureGate'

const mockGetState = vi.fn()
const mockFetchKagentStatus = vi.fn()
const mockIsDemoMode = vi.fn(() => false)
const mockTranslate = vi.fn((_key: string, fallback: string, options?: Record<string, unknown>) => {
  if (options?.timeoutSeconds && fallback.includes('{{timeoutSeconds}}')) {
    return fallback.replace('{{timeoutSeconds}}', String(options.timeoutSeconds))
  }
  return fallback
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockTranslate,
  }),
}))

vi.mock('../services/stellar', () => ({
  stellarApi: {
    getState: (...args: unknown[]) => mockGetState(...args),
  },
}))

vi.mock('../lib/kagentBackend', () => ({
  fetchKagentStatus: (...args: unknown[]) => mockFetchKagentStatus(...args),
}))

vi.mock('../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

describe('InitialInfrastructureGate', () => {
  let originalLocation: Location

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDemoMode.mockReturnValue(false)
    localStorage.clear()
    originalLocation = window.location
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('renders children after the initial handshake succeeds', async () => {
    mockGetState.mockResolvedValue({ generatedAt: 'now' })
    mockFetchKagentStatus.mockResolvedValue({ available: false, reason: 'not installed' })

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    expect(screen.getByText('Connecting to infrastructure')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument())
  })

  it('shows backend details when the handshake fails', async () => {
    mockGetState.mockRejectedValue(new Error('dial tcp 10.0.0.1:6443: i/o timeout'))
    mockFetchKagentStatus.mockRejectedValue(new Error('HTTP 503: backend startup blocked'))

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Infrastructure Connection Error')).toBeInTheDocument())
    expect(screen.getByText('/api/stellar/state')).toBeInTheDocument()
    expect(screen.getByText('/api/kagent/status')).toBeInTheDocument()
    expect(screen.getByText(/dial tcp 10.0.0.1:6443: i\/o timeout/)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 503: backend startup blocked/)).toBeInTheDocument()
  })

  it('shows auth-required screen when authentication fails', async () => {
    mockGetState.mockRejectedValue(new Error('No authentication token available'))
    mockFetchKagentStatus.mockResolvedValue({ available: true, url: 'http://kagent:8080' })

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Authentication Required')).toBeInTheDocument())
    expect(screen.getByText(/session has expired or authentication credentials are missing/)).toBeInTheDocument()
    expect(screen.getByText('Recovery Steps')).toBeInTheDocument()
    expect(screen.getByText(/Click "Reload page" to refresh your session/)).toBeInTheDocument()
    expect(screen.getByText(/click "Sign In" below to start a new session/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('clears stale auth state and redirects to login when Sign In is clicked', async () => {
    mockGetState.mockRejectedValue(new Error('Token is invalid or expired'))
    mockFetchKagentStatus.mockResolvedValue({ available: true, url: 'http://kagent:8080' })
    localStorage.setItem('kc_token', 'stale-legacy-token')
    localStorage.setItem(STORAGE_KEY_TOKEN, 'stale-token')
    localStorage.setItem(STORAGE_KEY_HAS_SESSION, 'true')

    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '/', reload: vi.fn() },
      writable: true,
    })

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(localStorage.getItem('kc_token')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_TOKEN)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY_HAS_SESSION)).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  it('renders children immediately in demo mode', async () => {
    mockIsDemoMode.mockReturnValue(true)

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument())
    expect(mockGetState).not.toHaveBeenCalled()
    expect(mockFetchKagentStatus).not.toHaveBeenCalled()
    expect(screen.queryByText('Recovery Steps')).not.toBeInTheDocument()
  })

  it('abstracts authentication errors in technical details for non-auth failures', async () => {
    mockGetState.mockRejectedValue(new Error('No authentication token available'))
    mockFetchKagentStatus.mockRejectedValue(new Error('Connection timeout'))

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Authentication Required')).toBeInTheDocument())
  })

  it('shows infrastructure error with abstracted auth details when mixed failures occur', async () => {
    mockGetState.mockRejectedValue(new Error('Token is invalid or expired'))
    mockFetchKagentStatus.mockRejectedValue(new Error('Connection refused'))

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Authentication Required')).toBeInTheDocument())
  })

  it('retries the handshake when Retry is clicked', async () => {
    mockGetState
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce({ generatedAt: 'later' })
    mockFetchKagentStatus
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValueOnce({ available: true, url: 'http://kagent:8080' })

    render(
      <InitialInfrastructureGate>
        <div>Ready</div>
      </InitialInfrastructureGate>
    )

    await waitFor(() => expect(screen.getByText('Infrastructure Connection Error')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('Ready')).toBeInTheDocument())
    expect(mockGetState).toHaveBeenCalledTimes(2)
    expect(mockFetchKagentStatus).toHaveBeenCalledTimes(2)
  })
})
