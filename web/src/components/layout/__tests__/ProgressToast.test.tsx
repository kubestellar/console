import React from 'react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProgressToast, type RestartState } from '../ProgressToast'
import type { UpdateProgress } from '../../../types/updates'

const baseUpdate: UpdateProgress = {
  status: 'building',
  message: 'Building the console',
  progress: 42,
}

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

describe('ProgressToast', () => {
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

  it('offers a restart action when the backend banner reports a disconnect', () => {
    const onRestartBackend = vi.fn()

    renderProgressToast({
      backendDown: true,
      showBackendBanner: true,
      onRestartBackend,
    })

    fireEvent.click(screen.getByRole('button', { name: 'layout.restart' }))

    expect(onRestartBackend).toHaveBeenCalledTimes(1)
  })

  it('shows watchdog stage progress while the backend is restarting', () => {
    renderProgressToast({
      backendDown: true,
      showBackendBanner: true,
      watchdogStage: 'backend_starting',
    })

    expect(screen.getByText('layout.watchdogStageBackendStarting')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'layout.restart' })).not.toBeInTheDocument()
  })

  it('reloads the page when an update completes', () => {
    renderProgressToast({
      showUpdateToast: true,
      updateProgress: { ...baseUpdate, status: 'done' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'layout.reload' }))

    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('shows the stale version toast when a newer version is available', () => {
    renderProgressToast({ versionChanged: true })

    expect(screen.getByText('layout.newVersionAvailable')).toBeInTheDocument()
  })
})
