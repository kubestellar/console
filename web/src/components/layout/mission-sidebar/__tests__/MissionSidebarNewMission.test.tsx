import React from 'react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MissionSidebarNewMission } from '../MissionSidebarNewMission'

describe('MissionSidebarNewMission', () => {
  it('notifies callers when the prompt changes', () => {
    const onPromptChange = vi.fn()

    render(
      <MissionSidebarNewMission
        isMobile={false}
        newMissionPrompt=""
        newMissionInputRef={createRef<HTMLTextAreaElement>()}
        onPromptChange={onPromptChange}
        onStartMission={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('missionSidebar.newMissionPlaceholder'), {
      target: { value: 'Investigate policy drift' },
    })

    expect(onPromptChange).toHaveBeenCalledWith('Investigate policy drift')
  })

  it('disables the start action until the prompt has content', () => {
    render(
      <MissionSidebarNewMission
        isMobile={false}
        newMissionPrompt="   "
        newMissionInputRef={createRef<HTMLTextAreaElement>()}
        onPromptChange={vi.fn()}
        onStartMission={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'missionSidebar.start' })).toBeDisabled()
  })

  it('starts a mission when Cmd+Enter is pressed with a non-empty prompt', () => {
    const onStartMission = vi.fn()

    render(
      <MissionSidebarNewMission
        isMobile={false}
        newMissionPrompt="Investigate policy drift"
        newMissionInputRef={createRef<HTMLTextAreaElement>()}
        onPromptChange={vi.fn()}
        onStartMission={onStartMission}
        onCancel={vi.fn()}
      />
    )

    fireEvent.keyDown(screen.getByPlaceholderText('missionSidebar.newMissionPlaceholder'), {
      key: 'Enter',
      metaKey: true,
    })

    expect(onStartMission).toHaveBeenCalledTimes(1)
  })
})
