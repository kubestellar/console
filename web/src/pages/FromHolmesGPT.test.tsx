import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const {
  COPY_FEEDBACK_TIMEOUT_MS,
  renderCounts,
  mockCopyToClipboard,
  mockEmitInstallCommandCopied,
} = vi.hoisted(() => ({
  COPY_FEEDBACK_TIMEOUT_MS: 2000,
  renderCounts: new Map<string, number>(),
  mockCopyToClipboard: vi.fn<(_: string) => Promise<boolean>>(),
  mockEmitInstallCommandCopied: vi.fn(),
}))

vi.mock('@/lib/clipboard', () => ({
  copyToClipboard: mockCopyToClipboard,
}))

vi.mock('@/lib/analytics', () => ({
  emitInstallCommandCopied: mockEmitInstallCommandCopied,
}))

vi.mock('@/lib/constants', () => ({
  COPY_FEEDBACK_TIMEOUT_MS,
}))

vi.mock('@/lib/demoMode', () => ({
  activatePublicDemoMode: vi.fn(),
}))

vi.mock('@/components/landing/ComparisonTable', () => ({
  ComparisonTable: () => <div data-testid="comparison-table" />,
}))

vi.mock('@/components/landing/HighlightGrid', () => ({
  HighlightGrid: () => <div data-testid="highlight-grid" />,
}))

vi.mock('@/components/landing/InstallStepCard', async () => {
  const React = await import('react')

  const MockInstallStepCard = React.memo(function MockInstallStepCard({
    step,
    copyKey,
    isCopied,
    onCopy,
  }: {
    step: { step: number; commands?: string[] }
    copyKey: string
    isCopied: boolean
    onCopy: (commands: string[], step: number) => void
  }) {
    renderCounts.set(copyKey, (renderCounts.get(copyKey) ?? 0) + 1)

    return (
      <button
        type="button"
        data-testid={copyKey}
        data-copied={String(isCopied)}
        onClick={() => onCopy(step.commands ?? [], step.step)}
      >
        {copyKey}
      </button>
    )
  })

  return {
    InstallStepCard: MockInstallStepCard,
    default: MockInstallStepCard,
  }
})

import { FromHolmesGPT } from './FromHolmesGPT'

function renderPage() {
  return render(
    <MemoryRouter>
      <FromHolmesGPT />
    </MemoryRouter>,
  )
}

describe('FromHolmesGPT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderCounts.clear()
    mockCopyToClipboard.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('rerenders only the copied install step while feedback is active', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    expect(renderCounts.get('step-1')).toBe(1)
    expect(renderCounts.get('step-2')).toBe(1)
    expect(renderCounts.get('step-3')).toBe(1)

    await user.click(screen.getByTestId('step-1'))

    await waitFor(() => {
      expect(screen.getByTestId('step-1')).toHaveAttribute('data-copied', 'true')
    })

    expect(renderCounts.get('step-1')).toBe(2)
    expect(renderCounts.get('step-2')).toBe(1)
    expect(renderCounts.get('step-3')).toBe(1)

    vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS)

    await waitFor(() => {
      expect(screen.getByTestId('step-1')).toHaveAttribute('data-copied', 'false')
    })

    expect(renderCounts.get('step-1')).toBe(3)
    expect(renderCounts.get('step-2')).toBe(1)
    expect(renderCounts.get('step-3')).toBe(1)
  })

  it('keeps the latest copied step highlighted until its own timeout expires', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderPage()

    await user.click(screen.getByTestId('step-1'))
    await waitFor(() => {
      expect(screen.getByTestId('step-1')).toHaveAttribute('data-copied', 'true')
    })

    vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 1)

    await user.click(screen.getByTestId('step-2'))
    await waitFor(() => {
      expect(screen.getByTestId('step-2')).toHaveAttribute('data-copied', 'true')
    })

    vi.advanceTimersByTime(COPY_FEEDBACK_TIMEOUT_MS - 1)

    expect(screen.getByTestId('step-2')).toHaveAttribute('data-copied', 'true')

    vi.advanceTimersByTime(1)

    await waitFor(() => {
      expect(screen.getByTestId('step-2')).toHaveAttribute('data-copied', 'false')
    })
  })

  it('does not show copied feedback when the clipboard write fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockCopyToClipboard.mockResolvedValueOnce(false)
    renderPage()

    await user.click(screen.getByTestId('step-1'))

    await waitFor(() => {
      expect(mockCopyToClipboard).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('step-1')).toHaveAttribute('data-copied', 'false')
    expect(renderCounts.get('step-1')).toBe(1)
    expect(mockEmitInstallCommandCopied).not.toHaveBeenCalled()
  })
})
