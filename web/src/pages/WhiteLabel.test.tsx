import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { COPY_FEEDBACK_TIMEOUT_MS, mockCopyToClipboard } = vi.hoisted(() => ({
  COPY_FEEDBACK_TIMEOUT_MS: 2000,
  mockCopyToClipboard: vi.fn<(_: string) => Promise<boolean>>(),
}))

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: mockCopyToClipboard,
}))

vi.mock('@/lib/constants', () => ({
  COPY_FEEDBACK_TIMEOUT_MS,
}))

vi.mock('@/lib/analytics', () => ({
  emitWhiteLabelViewed: vi.fn(),
  emitWhiteLabelActioned: vi.fn(),
  emitWhiteLabelTabSwitch: vi.fn(),
  emitWhiteLabelCommandCopy: vi.fn(),
  emitInstallCommandCopied: vi.fn(),
}))

import { WhiteLabel } from './WhiteLabel'

function renderPage() {
  return render(
    <MemoryRouter>
      <WhiteLabel />
    </MemoryRouter>,
  )
}

function getCopyButtonForStep(stepTitle: string) {
  const heading = screen.getByText(stepTitle)
  const card = heading.closest('div.rounded-xl')

  if (!card) {
    throw new Error(`Missing card for step: ${stepTitle}`)
  }

  return within(card as HTMLElement).getByRole('button', { name: 'Copy commands' })
}

describe('WhiteLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockCopyToClipboard.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('preserves the latest copy feedback until the newest timeout finishes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    const stepOneButton = getCopyButtonForStep('Add the Helm repo')
    const stepTwoButton = getCopyButtonForStep('Install with your branding')
    const stepOneDefaultMarkup = stepOneButton.innerHTML
    const stepTwoDefaultMarkup = stepTwoButton.innerHTML

    await user.click(stepOneButton)

    await waitFor(() => {
      expect(stepOneButton.innerHTML).not.toBe(stepOneDefaultMarkup)
    })

    vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 1)

    await user.click(stepTwoButton)

    await waitFor(() => {
      expect(stepTwoButton.innerHTML).not.toBe(stepTwoDefaultMarkup)
    })

    expect(stepOneButton.innerHTML).toBe(stepOneDefaultMarkup)

    vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 1)

    expect(stepTwoButton.innerHTML).not.toBe(stepTwoDefaultMarkup)

    vi.advanceTimersByTime(1)

    await waitFor(() => {
      expect(stepTwoButton.innerHTML).toBe(stepTwoDefaultMarkup)
    })
  })

  it('keeps the active tab stable when re-clicking the selected deployment mode', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    expect(screen.getByText('Add the Helm repo')).toBeInTheDocument()

    const helmTab = screen.getByRole('tab', { name: /Helm/i })

    await user.click(helmTab)

    expect(helmTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Add the Helm repo')).toBeInTheDocument()
    expect(screen.queryByText('Run with Docker')).not.toBeInTheDocument()
  })
})
