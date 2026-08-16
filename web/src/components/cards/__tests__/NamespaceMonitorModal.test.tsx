import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NamespaceMonitorModal } from '../NamespaceMonitorModal'

vi.mock('../NamespaceMonitor.utils', () => ({
  ResourceIcons: {
    pods: () => <span data-testid="pod-icon" />,
    deployments: () => <span data-testid="deploy-icon" />,
    services: () => <span data-testid="service-icon" />,
    configmaps: () => <span data-testid="cm-icon" />,
    secrets: () => <span data-testid="secret-icon" />,
    pvcs: () => <span data-testid="pvc-icon" />,
    jobs: () => <span data-testid="job-icon" />,
  },
}))

vi.mock('../../lib/modals/BaseModal', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div data-testid="base-modal">{children}</div> : null,
    {
      Header: ({ title }: { title: string }) => <div data-testid="modal-header">{title}</div>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

const mockResource = {
  type: 'pods' as const,
  name: 'my-deployment',
  namespace: 'default',
  cluster: 'prod',
  age: '5m',
}

describe('NamespaceMonitorModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when modalResource is null', () => {
    render(<NamespaceMonitorModal modalResource={null} onClose={vi.fn()} onViewDetails={vi.fn()} />)
    expect(document.querySelector('[data-testid="base-modal"]')).toBeNull()
  })

  it('renders modal when resource is provided', () => {
    render(
      <NamespaceMonitorModal
        modalResource={mockResource}
        onClose={vi.fn()}
        onViewDetails={vi.fn()}
      />
    )
    expect(screen.getByTestId('base-modal')).toBeInTheDocument()
  })

  it('shows resource name', () => {
    render(
      <NamespaceMonitorModal
        modalResource={mockResource}
        onClose={vi.fn()}
        onViewDetails={vi.fn()}
      />
    )
    expect(screen.getByText('my-deployment')).toBeInTheDocument()
  })
})
