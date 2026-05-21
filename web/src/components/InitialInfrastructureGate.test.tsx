import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InitialInfrastructureGate } from './InitialInfrastructureGate'

const mockGetState = vi.fn()
const mockFetchKagentStatus = vi.fn()

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, options?: Record<string, unknown>) => {
      if (options?.timeoutSeconds && fallback.includes('{{timeoutSeconds}}')) {
        return fallback.replace('{{timeoutSeconds}}', String(options.timeoutSeconds))
      }
      return fallback
    },
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

describe('InitialInfrastructureGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
}
