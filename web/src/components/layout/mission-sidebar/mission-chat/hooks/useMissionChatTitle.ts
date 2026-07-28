import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Mission, MissionActionBundle } from '../../../../../hooks/useMissions.types'
import { MAX_TITLE_LENGTH } from '../missionChatConstants'

interface UseMissionChatTitleParams {
  mission: Mission
  renameMission: MissionActionBundle['renameMission']
}

/**
 * Owns inline title editing: the editing flag, the draft value, the title input ref,
 * and the start/save/cancel/keyboard handlers.
 */
export function useMissionChatTitle({ mission, renameMission }: UseMissionChatTitleParams) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const startEditingTitle = useCallback(() => {
    setEditTitleValue(mission.title)
    setIsEditingTitle(true)
    requestAnimationFrame(() => titleInputRef.current?.select())
  }, [mission.title])

  const saveTitle = useCallback(() => {
    const trimmed = editTitleValue.trim()
    if (trimmed.length > 0 && trimmed.length <= MAX_TITLE_LENGTH && trimmed !== mission.title) {
      renameMission(mission.id, trimmed)
    }
    setIsEditingTitle(false)
  }, [editTitleValue, mission.id, mission.title, renameMission])

  const cancelEditTitle = useCallback(() => {
    setIsEditingTitle(false)
    setEditTitleValue('')
  }, [])

  const handleTitleKeyDown = useCallback((event: ReactKeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTitle()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditTitle()
    }
  }, [cancelEditTitle, saveTitle])

  return {
    isEditingTitle,
    editTitleValue,
    titleInputRef,
    setEditTitleValue,
    startEditingTitle,
    saveTitle,
    cancelEditTitle,
    handleTitleKeyDown,
  }
}
