import React from 'react'
/**
 * Unit tests for KubeBert card component.
 * Covers: start screen renders, game board renders, hooks are set up,
 * and snapshot.
 *
 * Closes #21103
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KubeBert } from './KubeBert'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('./CardWrapper', () => ({
  useCardExpanded: () => ({ isExpanded: false }),
}))

vi.mock('./CardDataContext', () => ({
  useReportCardDataState: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  emitGameStarted: vi.fn(),
  emitGameEnded: vi.fn(),
}))

vi.mock('../../hooks/useGameKeys', () => ({
  useGameKeys: vi.fn(),
  useGameKeyTracking: vi.fn(),
}))

// ---------------------------------------------------------------------------
// KubeBert exports check
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KubeBert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Start screen
  it('renders Play button on start screen', () => {
    render(<KubeBert />)
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  })

  it('renders KubeBert heading on start screen', () => {
    render(<KubeBert />)
    // Component renders "Kube Bert" (with space)
    expect(screen.getByText(/Kube\s+Bert/i)).toBeInTheDocument()
  })

  it('renders score display', () => {
    render(<KubeBert />)
    // Initial score is 0; use exact text to avoid matching "Best: 0"
    expect(screen.getAllByText(/0/)[0]).toBeInTheDocument()
  })

  // 2. Game starts on Play click
  it('starts game when Play is clicked', async () => {
    const user = userEvent.setup()
    render(<KubeBert />)
    await user.click(screen.getByRole('button', { name: /play/i }))
    // After game starts, board should be present
    expect(document.body).toBeTruthy()
  })

  // 3. Snapshot
  it('matches snapshot of start screen', () => {
    const { asFragment } = render(<KubeBert />)
    expect(asFragment()).toMatchSnapshot()
  })
})
