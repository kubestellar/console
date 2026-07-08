import React from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
import type { MissionControlState } from './types'

type MotionDivProps = HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
type ChildrenOnlyProps = { children?: ReactNode }

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// The panel pulls live cluster/helm data from these hooks. In tests we
// substitute fixed fixtures so no network / websocket layer is required.
vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: vi.fn(() => ({
    deduplicatedClusters: [
      { name: 'cluster-1', context: 'cluster-1', healthy: true, reachable: true },
    ],
    isLoading: false,
  })),
}))

vi.mock('../../hooks/mcp/helm', () => ({
  useHelmReleases: vi.fn(() => ({
    releases: [],
    isLoading: false,
  })),
}))

// Framer-motion's animations don't play well in jsdom.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: MotionDivProps) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: ChildrenOnlyProps) => <>{children}</>,
}))

vi.mock('react-markdown', () => ({
  default: ({ children }: ChildrenOnlyProps) => <div>{children}</div>,
}))

const mockState: MissionControlState = {
  phase: 'assign',
  title: 'Test Mission',
  description: 'Test Description',
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
      clusterContext: 'cluster-1',
      provider: 'kind',
      projectNames: ['prometheus'],
      warnings: [],
      readiness: {
        cpuHeadroomPercent: 80,
        memHeadroomPercent: 80,
        storageHeadroomPercent: 80,
        overallScore: 80,
      },
    },
  ],
  phases: [],
  overlay: 'architecture',
  deployMode: 'phased',
  targetClusters: [],
  aiStreaming: false,
  launchProgress: [],
}

describe('ClusterAssignmentPanel', () => {
  it('renders cluster cards', async () => {
    render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('mission-control-cluster-cluster-1')).toBeInTheDocument()
    })
  })

  it('displays project name', async () => {
    render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Prometheus')).toBeInTheDocument()
    })
  })

  it('renders without crashing when state has no assignments yet', () => {
    const bareState: MissionControlState = {
      ...mockState,
      assignments: [],
    }

    const { container } = render(
      <ClusterAssignmentPanel
        state={bareState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })
})
