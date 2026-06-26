/**
 * CardRequestDialog unit tests
 *
 * Covers: null render when no projects, project list rendering,
 * request submission, submitting state, success state, error state,
 * retry flow, toast feedback, and close button.
 */

import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Hoisted mock refs ────────────────────────────────────────────────────

const { mockApiPost, mockShowToast, mockEmitCardRequest } = vi.hoisted(() => ({
  mockApiPost: vi.fn().mockResolvedValue({}),
  mockShowToast: vi.fn(),
  mockEmitCardRequest: vi.fn(),
}))

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('../../../lib/api', () => ({
  api: { post: mockApiPost },
}))

vi.mock('../../../lib/analytics', () => ({
  emitGroundControlCardRequestOpened: mockEmitCardRequest,
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'orbit.cardRequest') return `Request card for ${opts?.project}`
      if (key === 'orbit.cardRequestRequested') return 'Requested'
      if (key === 'orbit.cardRequestAction') return 'Request Card'
      if (key === 'orbit.cardRequestSending') return 'Sending...'
      if (key === 'orbit.cardRequestRetry') return 'Retry'
      return key
    },
  }),
}))

import { CardRequestDialog } from '../CardRequestDialog'

// ── Fixtures ─────────────────────────────────────────────────────────────

const PROJECTS = ['Prometheus', 'Grafana', 'Jaeger']

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CardRequestDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({})
  })

  // ── Null / empty state ───────────────────────────────────────────────

  it('renders nothing when missingProjects is empty', () => {
    const { container } = render(
      <CardRequestDialog missingProjects={[]} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when missingProjects is undefined', () => {
    const { container } = render(
      // @ts-expect-error testing undefined
      <CardRequestDialog missingProjects={undefined} onClose={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  // ── Rendering ────────────────────────────────────────────────────────

  it('renders the "Missing monitoring cards" header', () => {
    render(<CardRequestDialog missingProjects={PROJECTS} onClose={vi.fn()} />)
    expect(screen.getByText(/Missing monitoring cards/i)).toBeInTheDocument()
  })

  it('renders one row per project', () => {
    render(<CardRequestDialog missingProjects={PROJECTS} onClose={vi.fn()} />)
    for (const project of PROJECTS) {
      expect(screen.getByText(`Request card for ${project}`)).toBeInTheDocument()
    }
  })

  it('renders a Request Card button for each project', () => {
    render(<CardRequestDialog missingProjects={PROJECTS} onClose={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: /Request Card/i })
    expect(buttons.length).toBe(PROJECTS.length)
  })

  it('renders close button in header', () => {
    const onClose = vi.fn()
    render(<CardRequestDialog missingProjects={PROJECTS} onClose={onClose} />)
    // The header X button should exist
    const closeButtons = screen.getAllByRole('button')
    expect(closeButtons.length).toBeGreaterThanOrEqual(PROJECTS.length + 1)
  })

  // ── Submission flow ──────────────────────────────────────────────────

  it('calls api.post when Request Card button is clicked', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(mockApiPost).toHaveBeenCalledWith('/api/feedback/requests', expect.objectContaining({
      title: 'Card Request: Prometheus monitoring card',
      request_type: 'feature',
    }))
  })

  it('includes project description in the API request body', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(mockApiPost).toHaveBeenCalledWith('/api/feedback/requests', expect.objectContaining({
      description: expect.stringContaining('Prometheus'),
    }))
  })

  it('emits analytics event on successful submission', async () => {
    render(<CardRequestDialog missingProjects={['Grafana']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(mockEmitCardRequest).toHaveBeenCalledWith('Grafana')
  })

  it('shows success toast after successful submission', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Prometheus'),
      'success',
    )
  })

  it('shows "Requested" label after successful submission', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(screen.getByText('Requested')).toBeInTheDocument()
  })

  it('hides the Request Card button after successful submission', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(screen.queryByRole('button', { name: /Request Card/i })).not.toBeInTheDocument()
  })

  // ── Submitting state ─────────────────────────────────────────────────

  it('shows "Sending..." while the request is in-flight', async () => {
    let resolvePost: () => void
    mockApiPost.mockReturnValue(new Promise<void>((res) => { resolvePost = res }))

    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument()
    })

    await act(async () => { resolvePost!() })
  })

  it('disables the button while submitting', async () => {
    mockApiPost.mockReturnValue(new Promise(() => {})) // never resolves
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Request Card/i })
    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument()
    })
    expect(btn).toBeDisabled()
  })

  // ── Error / retry state ──────────────────────────────────────────────

  it('shows Retry button when submission fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Network error'))
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('shows warning toast when submission fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Network error'))
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Could not submit'),
      'warning',
    )
  })

  it('retries the submission when Retry button is clicked', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('First fail'))
    mockApiPost.mockResolvedValueOnce({})
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })

    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    })

    expect(mockApiPost).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Requested')).toBeInTheDocument()
  })

  it('clears error state when retrying', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('fail'))
    mockApiPost.mockResolvedValueOnce({})
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={vi.fn()} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request Card/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Retry/i }))
    })

    expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument()
  })

  // ── Independent project state ────────────────────────────────────────

  it('only marks the submitted project as requested, others stay unchanged', async () => {
    render(<CardRequestDialog missingProjects={['Prometheus', 'Grafana']} onClose={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: /Request Card/i })

    await act(async () => {
      fireEvent.click(buttons[0]) // submit only Prometheus
    })

    expect(screen.getByText('Requested')).toBeInTheDocument()
    // Grafana still has its Request Card button
    expect(screen.getByRole('button', { name: /Request Card/i })).toBeInTheDocument()
  })

  // ── Close button ─────────────────────────────────────────────────────

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn()
    render(<CardRequestDialog missingProjects={['Prometheus']} onClose={onClose} />)
    // The X button has no text - find it by its role among non-"Request Card" buttons
    const allButtons = screen.getAllByRole('button')
    const closeBtn = allButtons.find((b) => !b.textContent?.includes('Request Card'))
    expect(closeBtn).toBeDefined()
    fireEvent.click(closeBtn!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
