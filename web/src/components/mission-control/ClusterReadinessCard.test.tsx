import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterReadinessCard } from './ClusterReadinessCard'
import type { ClusterInfo } from '../../hooks/mcp/types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockCluster: ClusterInfo = {
  name: 'prod-cluster-1',
  healthy: true,
  nodeCount: 5,
  cpuCores: 20,
  memoryGB: 64,
  storageGB: 500,
  podCount: 150,
  distribution: 'eks',
}

describe('ClusterReadinessCard', () => {
  it('renders cluster name', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
      />
    )

    expect(screen.getByText(/prod-cluster-1/)).toBeInTheDocument()
  })

  it('shows health indicator when cluster is healthy', () => {
    const onToggleProject = vi.fn()

    const { container } = render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
      />
    )

    const healthDot = container.querySelector('[title="Healthy"]')
    expect(healthDot).toBeInTheDocument()
  })

  it('displays node count', () => {
    const onToggleProject = vi.fn()

    const { container } = render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
      />
    )

    const nodeCount = container.querySelector('[title="5 nodes"]')
    expect(nodeCount).toBeInTheDocument()
  })

  it('shows CPU capacity bar', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
      />
    )

    expect(screen.getByText(/CPU/)).toBeInTheDocument()
  })

  it('renders available projects as checkboxes', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={['prometheus', 'grafana']}
      />
    )

    expect(screen.getByText('prometheus')).toBeInTheDocument()
    expect(screen.getByText('grafana')).toBeInTheDocument()
  })

  it('displays distribution when present', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
      />
    )

    expect(screen.getByText('eks')).toBeInTheDocument()
  })

  it('shows recommended border when isRecommended is true', () => {
    const onToggleProject = vi.fn()

    const { container } = render(
      <ClusterReadinessCard
        cluster={mockCluster}
        onToggleProject={onToggleProject}
        availableProjects={[]}
        isRecommended={true}
      />
    )

    const card = container.firstChild
    expect(card).toHaveClass('border-purple-500/50')
  })
})
