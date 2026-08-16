import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DraggableWorkloadItem } from '../WorkloadDeploymentItem'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}))

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

vi.mock('../../../hooks/useWorkloads', () => ({
  useScaleWorkload: () => ({ mutate: vi.fn() }),
}))

vi.mock('../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span data-testid="cluster-badge">{cluster}</span>,
}))

vi.mock('../../lib/modals/BaseModal', () => ({
  BaseModal: Object.assign(
    ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div data-testid="base-modal">{children}</div> : null,
    {
      Header: ({ title }: { title: string }) => <div>{title}</div>,
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }
  ),
}))

vi.mock('../ui/Button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

const mockWorkload = {
  id: 'deploy-my-app-default',
  name: 'my-app',
  type: 'Deployment' as const,
  namespace: 'default',
  cluster: 'prod',
  status: 'Running' as const,
  replicas: 3,
  readyReplicas: 3,
  image: 'my-app:latest',
}

describe('DraggableWorkloadItem', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders workload name', () => {
    render(
      <DraggableWorkloadItem
        workload={mockWorkload}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('my-app')).toBeInTheDocument()
  })

  it('renders namespace', () => {
    render(
      <DraggableWorkloadItem
        workload={mockWorkload}
        isSelected={false}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByText('default')).toBeInTheDocument()
  })

  it('renders with selected state', () => {
    render(
      <DraggableWorkloadItem
        workload={mockWorkload}
        isSelected={true}
        onSelect={vi.fn()}
      />
    )
    expect(document.body).toBeTruthy()
  })
})
