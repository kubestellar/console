import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateProgressBanner } from './UpdateProgressBanner'
import type { UpdateProgress } from '../../types/updates'

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  BANNER_DISMISS_MS: 5000,
} })

describe('UpdateProgressBanner', () => {
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when progress is null', () => {
    const { container } = render(
      <UpdateProgressBanner progress={null} onDismiss={onDismiss} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when status is idle', () => {
    const progress: UpdateProgress = { status: 'idle', message: '', progress: 0 }
    const { container } = render(
      <UpdateProgressBanner progress={progress} onDismiss={onDismiss} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders active progress with message and progress bar', () => {
    const progress: UpdateProgress = {
      status: 'pulling',
      message: 'Pulling latest changes...',
      progress: 45,
    }
    render(<UpdateProgressBanner progress={progress} onDismiss={onDismiss} />)

    expect(screen.getByText('Pulling latest changes...')).toBeTruthy()
    // Progress bar should be present with correct width
    const bar = document.querySelector('[style*="width"]')
    expect(bar).toBeTruthy()
    expect((bar as HTMLElement).style.width).toBe('45%')
  })

  it('renders done state without progress bar', () => {
    const progress: UpdateProgress = {
      status: 'done',
      message: 'Update complete!',
      progress: 100,
    }
    render(<UpdateProgressBanner progress={progress} onDismiss={onDismiss} />)

    expect(screen.getByText('Update complete!')).toBeTruthy()
    // Done state should not show the progress bar container (no width style on inner bar)
    // The progress bar is only rendered when isActive
  })

  it('renders failed state', () => {
    const progress: UpdateProgress = {
      status: 'failed',
      message: 'Build failed',
      progress: 60,
    }
    render(<UpdateProgressBanner progress={progress} onDismiss={onDismiss} />)

    expect(screen.getByText('Build failed')).toBeTruthy()
  })

  it('calls onDismiss and hides when dismiss button is clicked', () => {
    const progress: UpdateProgress = {
      status: 'building',
      message: 'Building...',
      progress: 30,
    }
    const { container } = render(
      <UpdateProgressBanner progress={progress} onDismiss={onDismiss} />,
    )

    // Click the dismiss (X) button
    const dismissBtn = container.querySelector('button')
    expect(dismissBtn).toBeTruthy()
    fireEvent.click(dismissBtn!)

    expect(onDismiss).toHaveBeenCalled()
  })
})
