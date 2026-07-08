import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlightPlanBlueprint } from './FlightPlanBlueprint'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockState: MissionControlState = {
  phase: 'blueprint',
  description: 'Test deployment plan',
  title: 'Test Plan',
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
      clusterContext: 'cluster-1-context',
      provider: 'kind',
      projectNames: ['prometheus'],
      warnings: [],
      readiness: { cpuHeadroomPercent: 80, memHeadroomPercent: 70, storageHeadroomPercent: 90, overallScore: 80 },
    },
  ],
  phases: [
    {
      phase: 1,
      name: 'Deploy Core',
      projectNames: ['prometheus'],
      estimatedSeconds: 300,
    },
  ],
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
}

describe('FlightPlanBlueprint', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FlightPlanBlueprint
        state={mockState}
        onOverlayChange={() => {}}
        onDeployModeChange={() => {}}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('displays SVG visualization', () => {
    const { container } = render(
      <FlightPlanBlueprint
        state={mockState}
        onOverlayChange={() => {}}
        onDeployModeChange={() => {}}
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders project nodes', () => {
    render(
      <FlightPlanBlueprint
        state={mockState}
        onOverlayChange={() => {}}
        onDeployModeChange={() => {}}
      />
    )

    expect(screen.getByText(/prometheus/i)).toBeInTheDocument()
  })

  it('handles empty state', () => {
    const emptyState: MissionControlState = {
      phase: 'blueprint',
      description: '',
      title: '',
      overlay: 'architecture',
      deployMode: 'phased',
      targetClusters: [],
      aiStreaming: false,
      launchProgress: [],
      projects: [],
      assignments: [],
      phases: [],
      overlay: 'architecture',
      deployMode: 'phased',
      targetClusters: [],
      aiStreaming: false,
      launchProgress: [],
    }

    const { container } = render(
      <FlightPlanBlueprint
        state={emptyState}
        onOverlayChange={() => {}}
        onDeployModeChange={() => {}}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('handles state with active launch progress', () => {
    const launchingState: MissionControlState = {
      ...mockState,
      phase: 'launching',
      launchProgress: [
        {
          phase: 1,
          status: 'running',
          projects: [
            { name: 'prometheus', missionId: 'mission-1', status: 'running' },
          ],
        },
      ],
    }

    const { container } = render(
      <FlightPlanBlueprint
        state={launchingState}
        onOverlayChange={() => {}}
        onDeployModeChange={() => {}}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })
})
