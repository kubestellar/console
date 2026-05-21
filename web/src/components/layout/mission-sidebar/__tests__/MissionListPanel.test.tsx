/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Mission } from '../../../../hooks/useMissions'
import { MissionListPanel } from '../MissionListPanel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; workloads?: number; clusters?: number; progress?: number }) => {
      if (key === 'missionControl.summary.runFootprint' && options) {
        return `${options.workloads} workloads · ${options.clusters} clusters`
      }
      if (key === 'missionSidebar.progressValue' && options) {
        return `${options.progress}%`
      }
      return options?.defaultValue ?? key
    },
  }),
}))

vi.mock('../../../missions/OrbitReminderBanner', () => ({
  OrbitReminderBanner: () => <div data-testid="orbit-reminder-banner" />,
}))

vi.mock('../../../missions/MissionTypeExplainer', () => ({
  MissionTypeExplainer: () => <div data-testid="mission-type-explainer" />,
}))

vi.mock('../MissionListItem', () => ({
  MissionListItem: () => <div data-testid="mission-list-item" />,
}))

vi.mock('../../../ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const missionControlRun: Mission = {
  id: 'mc-1',
  title: 'Secure clusters',
  description: 'Deploy Falco and Kyverno',
  type: 'deploy',
  status: 'completed',
  progress: 100,
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Use the new tooling to verify policies and review runtime alerts.',
      timestamp: new Date('2026-01-01T00:00:00Z'),
    },
  ],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T01:00:00Z'),
  context: {
    source: 'mission-control',
    workloads: ['falco', 'kyverno'],
    targetClusters: ['cluster-a', 'cluster-b'],
  },
}

describe('MissionListPanel', () => {
  it('surfaces mission control history with progress and guidance', () => {
    render(
      <MissionListPanel
        missions={[missionControlRun]}
        savedMissions={[]}
        missionControlRuns={[missionControlRun]}
        activeMissions={[]}
        visibleActiveMissions={[]}
        hasMoreMissions={false}
        visibleMissionCount={20}
        onLoadMore={vi.fn()}
        missionSearchQuery=""
        onSearchChange={vi.fn()}
        collapsedMissions={new Set()}
        onToggleCollapse={vi.fn()}
        onSelectMission={vi.fn()}
        onDismissMission={vi.fn()}
        onCancelMission={vi.fn()}
        onExpandMission={vi.fn()}
        onRollback={vi.fn()}
        onOpenMissionControl={vi.fn()}
        onOpenOrbitDialog={vi.fn()}
        onRunSavedMission={vi.fn()}
        isFullScreen={false}
        savedMissionItems={null}
      />
    )

    expect(screen.getByText('Mission Control history')).toBeInTheDocument()
    expect(screen.getByText('2 workloads · 2 clusters')).toBeInTheDocument()
    expect(screen.getByText(/Progress: 100%/)).toBeInTheDocument()
    expect(screen.getByText(/Next directions/)).toBeInTheDocument()
  })
})
