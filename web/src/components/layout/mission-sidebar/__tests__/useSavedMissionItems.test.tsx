import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { Mission } from '../../../../hooks/useMissions'
import { useSavedMissionItems } from '../useSavedMissionItems'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'mission-1',
    title: 'Investigate drift',
    description: 'Trace control-plane lag',
    type: 'custom',
    status: 'saved',
    messages: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('useSavedMissionItems', () => {
  it('opens mission details when the saved mission row is clicked', () => {
    const mission = makeMission()
    const onViewMission = vi.fn()
    const { result } = renderHook(() => useSavedMissionItems([mission], onViewMission, vi.fn(), vi.fn()))

    render(<>{result.current}</>)

    fireEvent.click(screen.getByText('Investigate drift'))

    expect(onViewMission).toHaveBeenCalledWith(mission)
  })

  it('runs a mission without triggering the row click handler', () => {
    const mission = makeMission()
    const onViewMission = vi.fn()
    const onRunMission = vi.fn()
    const { result } = renderHook(() => useSavedMissionItems([mission], onViewMission, onRunMission, vi.fn()))

    render(<>{result.current}</>)

    fireEvent.click(screen.getByRole('button', { name: 'layout.missionSidebar.run' }))

    expect(onRunMission).toHaveBeenCalledWith('mission-1')
    expect(onViewMission).not.toHaveBeenCalled()
  })

  it('renders up to four imported tags and removes missions from the library', () => {
    const mission = makeMission({
      importedFrom: {
        title: 'Investigate drift',
        description: 'Trace control-plane lag',
        tags: ['ops', 'scale', 'security', 'slo', 'extra'],
      },
    })
    const onRemoveMission = vi.fn()
    const { result } = renderHook(() => useSavedMissionItems([mission], vi.fn(), vi.fn(), onRemoveMission))

    render(<>{result.current}</>)

    expect(screen.getByText('ops')).toBeInTheDocument()
    expect(screen.getByText('slo')).toBeInTheDocument()
    expect(screen.queryByText('extra')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'layout.missionSidebar.removeFromLibrary' }))

    expect(onRemoveMission).toHaveBeenCalledWith('mission-1')
  })
})
