import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LaunchSequence } from './LaunchSequence'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/useMissions', () => ({
  MissionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMissions: () => ({
    missions: [],
    createMission: vi.fn(),
    startMission: vi.fn(),
  }),
}))

vi.mock('../cards/multi-tenancy/missionLoader', () => ({
  loadMissionPrompt: vi.fn().mockResolvedValue('mock prompt'),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./useMissionControl', () => ({
  buildInstallPromptForProject: vi.fn(() => 'mock prompt'),
  isSafeProjectName: vi.fn(() => true),
}))

const mockState: MissionControlState = {
  phase: 'launching',
  description: 'Test deployment',
  title: 'Test Launch',
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
}

describe('LaunchSequence', () => {
  it('renders mission description', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText(/Test deployment/)).toBeInTheDocument()
  })

  it('displays phase information', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText(/Deploy Core/)).toBeInTheDocument()
  })

  it('shows cancel button', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()
    const onClose = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    expect(screen.getByText(/Cancel/)).toBeInTheDocument()
  })

  it('renders project list', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText(/prometheus/)).toBeInTheDocument()
  })
})
