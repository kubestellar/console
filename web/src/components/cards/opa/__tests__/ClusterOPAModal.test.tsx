import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClusterOPAModal } from '../ClusterOPAModal'
import type { Policy, Violation, StartMissionFn } from '../types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// Note: paths are relative to this file's location (opa/__tests__/), so
// web/src/ is four levels up — hence '../../../../'.

vi.mock('../../../../lib/modals', () => {
  const BaseModal = ({ isOpen, children }: { isOpen: boolean; children?: React.ReactNode }) =>
    isOpen ? <div data-testid="base-modal">{children}</div> : null
  BaseModal.Header = ({
    title,
    description,
  }: { title: string; description?: string; [key: string]: unknown }) => (
    <div data-testid="modal-header">
      <span>{title}</span>
      {description && <span>{description}</span>}
    </div>
  )
  BaseModal.Content = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  )
  BaseModal.Footer = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="modal-footer">{children}</div>
  )
  return {
    BaseModal,
    useModalState: vi.fn(() => ({ isOpen: false, open: vi.fn(), close: vi.fn() })),
  }
})

vi.mock('../../../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: vi.fn().mockResolvedValue({ output: 'apiVersion: v1', error: null }),
  },
}))

vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('../../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../ui/Button', () => ({
  Button: ({
    children,
    onClick,
  }: { children?: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../../../../lib/constants/network', () => ({
  KUBECTL_MEDIUM_TIMEOUT_MS: 5000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 30000,
}))

vi.mock('../../../../types/alerts', () => ({
  ALERT_SEVERITY_ORDER: { critical: 1, warning: 2, info: 3 },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POLICIES: Policy[] = [
  { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 3, mode: 'warn' },
  { name: 'block-privileged', kind: 'K8sBlockPrivileged', violations: 0, mode: 'enforce' },
]

const VIOLATIONS: Violation[] = [
  {
    name: 'pod-missing-labels',
    namespace: 'default',
    kind: 'Pod',
    policy: 'require-labels',
    message: 'Missing required labels: team',
    severity: 'warning',
  },
  {
    name: 'critical-issue',
    namespace: 'kube-system',
    kind: 'Deployment',
    policy: 'another-policy',
    message: 'Critical security violation',
    severity: 'critical',
  },
]

const START_MISSION: StartMissionFn = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ClusterOPAModal>> = {},
) {
  return render(
    <ClusterOPAModal
      isOpen={true}
      onClose={vi.fn()}
      clusterName="test-cluster"
      policies={POLICIES}
      violations={VIOLATIONS}
      onRefresh={vi.fn()}
      startMission={START_MISSION}
      {...overrides}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClusterOPAModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing when isOpen=true', () => {
    renderModal()
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('renders nothing when isOpen=false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByTestId('base-modal')).not.toBeInTheDocument()
  })

  it('shows the Policies tab by default with correct count', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /Policies \(2\)/i })).toBeInTheDocument()
    expect(screen.getByText('require-labels')).toBeInTheDocument()
    expect(screen.getByText('block-privileged')).toBeInTheDocument()
  })

  it('shows violations tab with correct count badge', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /Violations \(2\)/i })).toBeInTheDocument()
  })

  it('switches to violations tab on click and shows violations', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /Violations/i }))
    expect(screen.getByText('pod-missing-labels')).toBeInTheDocument()
    expect(screen.getByText('critical-issue')).toBeInTheDocument()
  })

  it('shows severity summary counts in violations tab', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /Violations/i }))
    // 1 critical, 1 warning, 0 info — displayed as bold numbers
    const criticalCount = screen.getByText('1', { selector: '.text-red-400' })
    expect(criticalCount).toBeInTheDocument()
    const warningCount = screen.getByText('1', { selector: '.text-yellow-400' })
    expect(warningCount).toBeInTheDocument()
    const infoCount = screen.getByText('0', { selector: '.text-blue-400' })
    expect(infoCount).toBeInTheDocument()
  })

  it('shows empty state message when no policies', () => {
    renderModal({ policies: [] })
    expect(screen.getByText(/noPoliciesConfigured/)).toBeInTheDocument()
  })

  it('shows empty violations state when violations list is empty', async () => {
    const user = userEvent.setup()
    renderModal({ violations: [] })
    await user.click(screen.getByRole('button', { name: /Violations/i }))
    expect(screen.getByText('No violations')).toBeInTheDocument()
  })

  it('shows policy mode badges on each policy row', () => {
    renderModal()
    expect(screen.getByText('warn')).toBeInTheDocument()
    expect(screen.getByText('enforce')).toBeInTheDocument()
  })

  it('shows violation count for policies with violations', () => {
    renderModal()
    expect(screen.getByText('3 violations')).toBeInTheDocument()
    expect(screen.getByText('No violations')).toBeInTheDocument()
  })

  it('shows Create Policy button', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /Create Policy/i })).toBeInTheDocument()
  })

  it('opens create menu on Create Policy click', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /Create Policy/i }))
    expect(screen.getByText('Create with AI')).toBeInTheDocument()
    expect(screen.getByText('From Template')).toBeInTheDocument()
    expect(screen.getByText('Custom YAML')).toBeInTheDocument()
  })

  it('calls startMission when Create with AI is clicked', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: /Create Policy/i }))
    await user.click(screen.getByText('Create with AI'))
    expect(START_MISSION).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: 'test-cluster' }),
    )
  })

  it('calls onClose when Close button in footer is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderModal({ onClose })
    const closeButtons = screen.getAllByRole('button', { name: /^close$/i })
    await user.click(closeButtons[0])
    expect(onClose).toHaveBeenCalled()
  })
})
