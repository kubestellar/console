import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ClusterAssignmentPanel } from './ClusterAssignmentPanel'
import type { MissionControlState } from './types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}))

vi.mock('../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'cluster-1', context: 'cluster-1-ctx', healthy: true, nodeCount: 3, cpuCores: 12, memoryGB: 32, storageGB: 100 },
    ],
    isLoading: false,
  }),
}))

vi.mock('../../hooks/mcp/helm', () => ({
  useHelmReleases: () => ({ releases: [] }),
}))

vi.mock('./useMissionControl', () => ({
  getAssistantContentSinceLastUser: vi.fn(() => ''),
}))

vi.mock('../ui/LazyMarkdown', () => ({
  LazyMarkdown: ({ children }: { children: string }) => <span>{children}</span>,
}))

vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-sanitize', () => ({ default: () => {} }))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('./ClusterReadinessCard', () => ({
  ClusterReadinessCard: ({ cluster }: { cluster: { name: string } }) => <div data-testid="cluster-card">{cluster.name}</div>,
}))

vi.mock('./AssignmentMatrix', () => ({
  AssignmentMatrix: () => <div data-testid="assignment-matrix">matrix</div>,
}))

const mockState: MissionControlState = {
  phase: 'assignment',
  description: 'Test deployment',
  title: 'Test',
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
      clusterContext: 'cluster-1-ctx',
      provider: 'kind',
      projectNames: ['prometheus'],
      warnings: [],
      readiness: { cpuHeadroomPercent: 80, memHeadroomPercent: 70, storageHeadroomPercent: 90, overallScore: 80 },
    },
  ],
  phases: [],
}

describe('ClusterAssignmentPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('renders cluster readiness cards', () => {
    const { getAllByTestId } = render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    expect(getAllByTestId('cluster-card').length).toBeGreaterThan(0)
  })

  it('handles empty projects list', () => {
    const emptyState: MissionControlState = {
      ...mockState,
      projects: [],
      assignments: [],
    }

    const { container } = render(
      <ClusterAssignmentPanel
        state={emptyState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={false}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })

  it('passes aiStreaming prop without error', () => {
    const { container } = render(
      <ClusterAssignmentPanel
        state={mockState}
        onAskAI={vi.fn()}
        onAutoAssign={vi.fn()}
        onSetAssignment={vi.fn()}
        aiStreaming={true}
      />
    )

    expect(container.firstChild).toBeInTheDocument()
  })
})
