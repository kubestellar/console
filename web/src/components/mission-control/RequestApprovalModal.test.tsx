import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RequestApprovalModal } from './RequestApprovalModal'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ token: 'mock-token' }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// Prevent real network calls during token-status probe / issue submit.
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ hasToken: false }),
  } as Response)
) as unknown as typeof fetch

const mockState: MissionControlState = {
  phase: 'blueprint',
  title: 'Test Mission',
  description: 'Test deployment',
  projects: [
    {
      name: 'prometheus',
      displayName: 'Prometheus',
      category: 'Observability',
      maturity: 'graduated',
      priority: 'required',
      reason: 'Metrics',
      dependencies: [],
    },
  ],
  assignments: [
    {
      clusterName: 'cluster-1',
      clusterContext: 'cluster-1',
      provider: 'kind',
      projectNames: ['prometheus'],
      warnings: [],
      readiness: {
        cpuHeadroomPercent: 80,
        memHeadroomPercent: 80,
        storageHeadroomPercent: 80,
        overallScore: 80,
      },
    },
  ],
  phases: [],
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
}

describe('RequestApprovalModal', () => {
  it('renders modal content when open', () => {
    const onClose = vi.fn()

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    // BaseModal renders the modal into a portal; verify at least one
    // approval-related element is present in the DOM.
    expect(document.body.textContent).toMatch(/approval/i)
  })

  it('calls onClose when cancel clicked', () => {
    const onClose = vi.fn()

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    const cancelBtn = screen.getByText(/Cancel/i)
    fireEvent.click(cancelBtn)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render modal content when isOpen is false', () => {
    const onClose = vi.fn()

    render(
      <RequestApprovalModal
        isOpen={false}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    // Closed modal: no cancel button should be reachable.
    expect(screen.queryByText(/Cancel/i)).toBeNull()
  })
})
