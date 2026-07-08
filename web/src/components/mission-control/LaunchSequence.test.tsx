import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaunchSequence } from './LaunchSequence'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/useMissions', () => ({
  useMissions: () => ({
    missions: [],
    createMission: vi.fn(),
  }),
}))

vi.mock('../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn().mockResolvedValue('mock prompt'),
}))

const mockState: MissionControlState = {
  phase: 'launching',
  title: 'Test Mission',
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
  description: 'Test deployment',
}

describe('LaunchSequence', () => {
  it('renders mission description', () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText(/Test deployment/)).toBeInTheDocument()
  })

  it('displays phase information', () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText(/Deploy Core/)).toBeInTheDocument()
  })

  it('shows cancel button', () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText(/Cancel/)).toBeInTheDocument()
  })

  it('renders project list', () => {
    const onComplete = vi.fn()
    const onCancel = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    )

    expect(screen.getByText(/prometheus/)).toBeInTheDocument()
  })
})
