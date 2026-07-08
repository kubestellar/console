import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ProgressToast, type RestartState } from '../ProgressToast'

function renderProgressToast(overrides: Partial<ComponentProps<typeof ProgressToast>> = {}) {
  const defaultProps: ComponentProps<typeof ProgressToast> = {
    backendDown: false,
    backendUnavailable: false,
    restartState: 'idle' satisfies RestartState,
    restartError: null,
    showBackendBanner: false,
    showStartupSnackbar: false,
    showUpdateToast: false,
    updateProgress: null,
    versionChanged: false,
    watchdogStage: null,
    onDismissUpdateToast: vi.fn(),
    onRestartBackend: vi.fn(),
  }

  return render(<ProgressToast {...defaultProps} {...overrides} />)
}

describe('ProgressToast — touch target accessibility (WCAG 2.5.5)', () => {
  let originalLocation: Location

  beforeEach(() => {
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('restarting button meets 44x44px touch target with min-h-11 min-w-11', () => {
    renderProgressToast({
      backendDown: true,
      showBackendBanner: true,
      restartState: 'restarting',
    })

    const restartingBtn = screen.getByRole('button', { name: /layout.restarting/i })
    expect(restartingBtn.className).toContain('min-h-11')
    expect(restartingBtn.className).toContain('min-w-11')
  })

  it('restarting button is disabled while restart is in progress', () => {
    renderProgressToast({
      backendDown: true,
      showBackendBanner: true,
      restartState: 'restarting',
    })

    const restartingBtn = screen.getByRole('button', { name: /layout.restarting/i })
    expect(restartingBtn).toBeDisabled()
  })

  it('restart action button meets minimum touch target height', () => {
    renderProgressToast({
      backendDown: true,
      showBackendBanner: true,
      restartState: 'idle',
    })

    const restartBtn = screen.getByRole('button', { name: 'layout.restart' })
    // The restart button uses TOUCH_TARGET_SIZE_CLASS via the component
    expect(restartBtn.className).toContain('min-h-11')
    expect(restartBtn.className).toContain('min-w-11')
  })
})
