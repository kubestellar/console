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
      projectNames: ['prometheus'],
      warnings: [],
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
  description: 'Test deployment plan',
}

describe('FlightPlanBlueprint', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FlightPlanBlueprint state={mockState} />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('displays SVG visualization', () => {
    const { container } = render(
      <FlightPlanBlueprint state={mockState} />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders project nodes', () => {
    render(
      <FlightPlanBlueprint state={mockState} />
    )

    expect(screen.getByText(/prometheus/i)).toBeInTheDocument()
  })

  it('handles empty state', () => {
    const emptyState: MissionControlState = {
      phase: 'define',
      title: '',
      overlay: 'architecture',
      deployMode: 'phased',
      targetClusters: [],
      aiStreaming: false,
      launchProgress: [],
      projects: [],
      assignments: [],
      phases: [],
      description: '',
    }

    const { container } = render(
      <FlightPlanBlueprint state={emptyState} />
    )

    expect(container.firstChild).toBeInTheDocument()
  })
})
