import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RequestApprovalModal } from './RequestApprovalModal'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const mockState: MissionControlState = {
  phase: 'blueprint',
  title: 'Test Plan',
  description: 'Test deployment',
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
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
      clusterContext: 'cluster-1-ctx',
      provider: 'kind',
      projectNames: ['prometheus'],
      warnings: [],
      readiness: { cpuHeadroomPercent: 80, memHeadroomPercent: 70, storageHeadroomPercent: 90, overallScore: 80 },
    },
  ],
  phases: [],
}

describe('RequestApprovalModal', () => {
  it('renders modal title', () => {
    const onClose = vi.fn()

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    expect(screen.getByText(/Request Approval/i)).toBeInTheDocument()
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

  it('shows preview of approval body', () => {
    const onClose = vi.fn()

    render(
      <RequestApprovalModal
        isOpen={true}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    expect(screen.getByText(/Test deployment/)).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    const onClose = vi.fn()

    const { container } = render(
      <RequestApprovalModal
        isOpen={false}
        onClose={onClose}
        state={mockState}
        installedProjects={new Set()}
      />
    )

    expect(container.firstChild).toBeNull()
  })
})
