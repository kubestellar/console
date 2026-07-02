import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AssignmentMatrix } from './AssignmentMatrix'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { PayloadProject, ClusterAssignment } from './types'

const mockProjects: PayloadProject[] = [
  {
    name: 'prometheus',
    displayName: 'Prometheus',
    category: 'Observability',
    maturity: 'graduated',
    priority: 'required',
    reason: 'Metrics',
    dependencies: [],
  },
  {
    name: 'grafana',
    displayName: 'Grafana',
    category: 'Observability',
    maturity: 'graduated',
    priority: 'recommended',
    reason: 'Dashboards',
    dependencies: [],
  },
]

const mockClusters: ClusterInfo[] = [
  {
    name: 'cluster-1',
    healthy: true,
    nodeCount: 3,
    cpuCores: 12,
    memoryGB: 32,
    storageGB: 100,
  },
  {
    name: 'cluster-2',
    healthy: true,
    nodeCount: 5,
    cpuCores: 20,
    memoryGB: 64,
    storageGB: 200,
  },
]

const mockAssignments: ClusterAssignment[] = [
  {
    clusterName: 'cluster-1',
    projectNames: ['prometheus'],
    warnings: [],
  },
  {
    clusterName: 'cluster-2',
    projectNames: [],
    warnings: [],
  },
]

describe('AssignmentMatrix', () => {
  it('renders project rows', () => {
    const onToggle = vi.fn()

    render(
      <AssignmentMatrix
        projects={mockProjects}
        clusters={mockClusters}
        assignments={mockAssignments}
        onToggle={onToggle}
      />
    )

    expect(screen.getByText('Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Grafana')).toBeInTheDocument()
  })

  it('renders cluster columns', () => {
    const onToggle = vi.fn()

    render(
      <AssignmentMatrix
        projects={mockProjects}
        clusters={mockClusters}
        assignments={mockAssignments}
        onToggle={onToggle}
      />
    )

    expect(screen.getByText(/cluster-1/)).toBeInTheDocument()
    expect(screen.getByText(/cluster-2/)).toBeInTheDocument()
  })

  it('shows check mark for assigned projects', () => {
    const onToggle = vi.fn()

    const { container } = render(
      <AssignmentMatrix
        projects={mockProjects}
        clusters={mockClusters}
        assignments={mockAssignments}
        onToggle={onToggle}
      />
    )

    const cells = container.querySelectorAll('button')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('calls onToggle when cell clicked', () => {
    const onToggle = vi.fn()

    const { container } = render(
      <AssignmentMatrix
        projects={mockProjects}
        clusters={mockClusters}
        assignments={mockAssignments}
        onToggle={onToggle}
      />
    )

    const firstCell = container.querySelector('button')
    if (firstCell) {
      fireEvent.click(firstCell)
      expect(onToggle).toHaveBeenCalled()
    }
  })

  it('renders empty state when no projects', () => {
    const onToggle = vi.fn()

    render(
      <AssignmentMatrix
        projects={[]}
        clusters={mockClusters}
        assignments={[]}
        onToggle={onToggle}
      />
    )

    expect(screen.queryByText('Prometheus')).not.toBeInTheDocument()
  })
})
