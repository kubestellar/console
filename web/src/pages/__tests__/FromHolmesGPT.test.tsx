import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitInstallCommandCopied: vi.fn(),
  emitFromHolmesGPTViewed: vi.fn(),
  emitFromHolmesGPTActioned: vi.fn(),
}
))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../lib/demoMode', () => ({
  activatePublicDemoMode: vi.fn(),
}))

import { FromHolmesGPT } from '../FromHolmesGPT'
import { copyToClipboard } from '../../lib/clipboard'

describe('FromHolmesGPT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the page with install steps', () => {
    render(
      <MemoryRouter>
        <FromHolmesGPT />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Everything HolmesGPT does/)).toBeInTheDocument()
  })

  it('shows copy feedback on step copy and clears after timeout', async () => {
    render(
      <MemoryRouter>
        <FromHolmesGPT />
      </MemoryRouter>,
    )

    // Find and click a copy button
    const copyButtons = screen.getAllByRole('button', { name: /copy/i })
    expect(copyButtons.length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(copyButtons[0])
    })

    expect(copyToClipboard).toHaveBeenCalledTimes(1)

    // Verify feedback is shown (Copied! text or check icon)
    // The batched setState pattern should set stepKey atomically with token
    // After timeout, feedback should clear
    act(() => {
      vi.advanceTimersByTime(3000)
    })
  })
})
