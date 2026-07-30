import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProgressToast } from './ProgressToast'

describe('ProgressToast', () => {
  it('renders the completed update toast', () => {
    render(
      <ProgressToast
        backendDown={false}
        backendUnavailable={false}
        restartState="idle"
        restartError={null}
        showBackendBanner={false}
        showStartupSnackbar={false}
        showUpdateToast={true}
        updateProgress={{ status: 'done', message: 'Ready', progress: 100 }}
        versionChanged={false}
        watchdogStage={null}
        onDismissUpdateToast={vi.fn()}
        onRestartBackend={vi.fn()}
      />
    )

    expect(screen.getByText('layout.updateComplete')).toBeInTheDocument()
    expect(screen.getByText('layout.reload')).toBeInTheDocument()
  })
})
