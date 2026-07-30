import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Mission } from '../../../../hooks/useMissions'
import { MissionSidebarRunningBanner } from '../MissionSidebarRunningBanner'

function makeMission(id: string, overrides: Partial<Mission> = {}): Mission {
  return {
    id,
    title: `Mission ${id}`,
    description: `Description ${id}`,
    type: 'custom',
    status: 'running',
    messages: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('MissionSidebarRunningBanner', () => {
  it('lists running mission previews and selects a mission when clicked', () => {
    const onSelectMission = vi.fn()
    const preview = [
      makeMission('1', { title: 'Reconcile workloads' }),
      makeMission('2', { title: 'Repair ingress' }),
    ]

    render(
      <MissionSidebarRunningBanner
        runningMissions={preview}
        runningMissionPreview={preview}
        onSelectMission={onSelectMission}
        onViewRunningMissions={vi.fn()}
        getRunningMissionStatusLabel={() => 'Running'}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Reconcile workloads/i }))

    expect(onSelectMission).toHaveBeenCalledWith('1')
  })

  it('shows the reconnect fallback text for preview missions', () => {
    const preview = [
      makeMission('1', {
        title: 'Reconcile workloads',
        currentStep: 'Reconnecting...',
        lastKnownStep: 'Applying manifests',
      }),
    ]

    render(
      <MissionSidebarRunningBanner
        runningMissions={preview}
        runningMissionPreview={preview}
        onSelectMission={vi.fn()}
        onViewRunningMissions={vi.fn()}
        getRunningMissionStatusLabel={() => 'Running'}
      />
    )

    expect(screen.getByText('Applying manifests (reconnecting...)')).toBeInTheDocument()
  })

  it('surfaces the history action and more-running summary for extra missions', () => {
    const onViewRunningMissions = vi.fn()
    const preview = [makeMission('1'), makeMission('2'), makeMission('3')]
    const runningMissions = [...preview, makeMission('4')]

    render(
      <MissionSidebarRunningBanner
        runningMissions={runningMissions}
        runningMissionPreview={preview}
        onSelectMission={vi.fn()}
        onViewRunningMissions={onViewRunningMissions}
        getRunningMissionStatusLabel={() => 'Running'}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'missionSidebar.viewRunningMissions' }))

    expect(onViewRunningMissions).toHaveBeenCalledTimes(1)
    expect(screen.getByText('missionSidebar.moreRunningMissions')).toBeInTheDocument()
  })
})
