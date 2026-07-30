import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MissionSidebarEmptyState } from '../MissionSidebarEmptyState'

describe('MissionSidebarEmptyState', () => {
  it('shows the custom mission action when the new mission composer is hidden', () => {
    render(
      <MissionSidebarEmptyState
        showNewMission={false}
        onOpenMissionBrowser={vi.fn()}
        onOpenMissionControl={vi.fn()}
        onStartNewMission={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'missionSidebar.startCustomMission' })).toBeInTheDocument()
  })

  it('hides the custom mission action while the composer is already open', () => {
    render(
      <MissionSidebarEmptyState
        showNewMission={true}
        onOpenMissionBrowser={vi.fn()}
        onOpenMissionControl={vi.fn()}
        onStartNewMission={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'missionSidebar.startCustomMission' })).not.toBeInTheDocument()
  })

  it('invokes the browse and mission control callbacks', () => {
    const onOpenMissionBrowser = vi.fn()
    const onOpenMissionControl = vi.fn()

    render(
      <MissionSidebarEmptyState
        showNewMission={false}
        onOpenMissionBrowser={onOpenMissionBrowser}
        onOpenMissionControl={onOpenMissionControl}
        onStartNewMission={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'layout.missionSidebar.browseCommunityMissions' }))
    fireEvent.click(screen.getByRole('button', { name: 'layout.missionSidebar.missionControl' }))

    expect(onOpenMissionBrowser).toHaveBeenCalledTimes(1)
    expect(onOpenMissionControl).toHaveBeenCalledTimes(1)
  })
})
