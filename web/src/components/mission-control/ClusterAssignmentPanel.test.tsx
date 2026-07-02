import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
import type { ClusterInfo } from '../../hooks/mcp/types'
import type { PayloadProject, ClusterAssignment } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockClusters: ClusterInfo[] = [
  {
    name: 'cluster-1',
    healthy: true,
    nodeCount: 3,
    cpuCores: 12,
    memoryGB: 32,
    storageGB: 100,
  },
]

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
]

const mockAssignments: ClusterAssignment[] = [
  {
    clusterName: 'cluster-1',
    projectNames: ['prometheus'],
    warnings: [],
  },
]

describe('ClusterAssignmentPanel', () => {
  it('renders cluster cards', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterAssignmentPanel
        clusters={mockClusters}
        projects={mockProjects}
        assignments={mockAssignments}
        onToggleProject={onToggleProject}
      />
    )

    expect(screen.getByText(/cluster-1/)).toBeInTheDocument()
  })

  it('displays available projects', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterAssignmentPanel
        clusters={mockClusters}
        projects={mockProjects}
        assignments={mockAssignments}
        onToggleProject={onToggleProject}
      />
    )

    expect(screen.getByText('prometheus')).toBeInTheDocument()
  })

  it('handles empty clusters list', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterAssignmentPanel
        clusters={[]}
        projects={mockProjects}
        assignments={[]}
        onToggleProject={onToggleProject}
      />
    )

    expect(screen.getByText(/No clusters/i)).toBeInTheDocument()
  })

  it('renders cluster readiness information', () => {
    const onToggleProject = vi.fn()

    render(
      <ClusterAssignmentPanel
        clusters={mockClusters}
        projects={mockProjects}
        assignments={mockAssignments}
        onToggleProject={onToggleProject}
      />
    )

    expect(screen.getByText(/CPU/)).toBeInTheDocument()
  })
})
