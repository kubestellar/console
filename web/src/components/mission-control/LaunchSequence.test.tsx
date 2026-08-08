import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LaunchSequence } from './LaunchSequence'
import type { MissionControlState, PhaseProgress } from './types'
import { loadMissionPrompt } from '../cards/multi-tenancy/missionLoader'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
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

const mockLoadMissionPrompt = vi.fn().mockResolvedValue('mock prompt')
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
  launchProgress: [
    {
      phase: 1,
      status: 'pending',
      projects: [{ name: 'prometheus', status: 'pending' }],
    },
  ],
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
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadMissionPrompt).mockResolvedValue('mock prompt')
  })

  it('renders launch progress summary', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText('missionControl.launchSequence.deployingProjects_one')).toBeInTheDocument()
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

  it('shows close button when there is nothing to deploy', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()
    const onClose = vi.fn()

    render(
      <LaunchSequence
        state={{ ...mockState, projects: [], assignments: [], phases: [] }}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    expect(screen.getByRole('button', { name: 'actions.close' })).toBeInTheDocument()
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

    expect(screen.getByText('Prometheus')).toBeInTheDocument()
  })

  it('calls loadMissionPrompt for each project workload on mount', async () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    render(
      <LaunchSequence
        state={mockState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    await waitFor(() => {
      expect(loadMissionPrompt).toHaveBeenCalledWith(
        'prometheus',
        expect.any(String),
        undefined,
        undefined,
      )
    })
  })

  it('calls onUpdateProgress with initial progress array on mount', async () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    const stateWithProgress: MissionControlState = {
      ...mockState,
      launchProgress: [],
    }

    render(
      <LaunchSequence
        state={stateWithProgress}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    await waitFor(() => {
      expect(onUpdateProgress).toHaveBeenCalled()
    })

    const firstCall = onUpdateProgress.mock.calls[0][0] as PhaseProgress[]
    expect(Array.isArray(firstCall)).toBe(true)
  })

  it('shows no-projects error when both phases and assignments are empty', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()
    const onClose = vi.fn()

    render(
      <LaunchSequence
        state={{ ...mockState, projects: [], assignments: [], phases: [] }}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
        onClose={onClose}
      />
    )

    expect(screen.getByText('missionControl.launchSequence.noProjectsTitle')).toBeInTheDocument()
    expect(screen.getByText('missionControl.launchSequence.noProjectsDescription')).toBeInTheDocument()
  })

  it('shows failed project status in the phase list', () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    const stateWithFailedProject: MissionControlState = {
      ...mockState,
      launchProgress: [
        {
          phase: 1,
          status: 'failed',
          projects: [{ name: 'prometheus', status: 'failed', error: 'Deployment timed out' }],
        },
      ],
    }

    render(
      <LaunchSequence
        state={stateWithFailedProject}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    expect(screen.getByText('Prometheus')).toBeInTheDocument()
  })

  it('merged deploy plan contains workload names for all assigned projects', async () => {
    const onUpdateProgress = vi.fn()
    const onComplete = vi.fn()

    const multiProjectState: MissionControlState = {
      ...mockState,
      projects: [
        ...mockState.projects,
        {
          name: 'grafana',
          displayName: 'Grafana',
          category: 'Observability',
          maturity: 'graduated',
          priority: 'required',
          reason: 'Dashboards',
          dependencies: [],
        },
      ],
      phases: [
        {
          phase: 1,
          name: 'Deploy Core',
          projectNames: ['prometheus', 'grafana'],
          estimatedSeconds: 300,
        },
      ],
      assignments: [
        {
          ...mockState.assignments[0],
          projectNames: ['prometheus', 'grafana'],
        },
      ],
    }

    render(
      <LaunchSequence
        state={multiProjectState}
        onUpdateProgress={onUpdateProgress}
        onComplete={onComplete}
      />
    )

    await waitFor(() => {
      expect(loadMissionPrompt).toHaveBeenCalledTimes(2)
    })

    const calledNames = vi.mocked(loadMissionPrompt).mock.calls.map((call) => call[0])
    expect(calledNames).toContain('prometheus')
    expect(calledNames).toContain('grafana')
  })
})
