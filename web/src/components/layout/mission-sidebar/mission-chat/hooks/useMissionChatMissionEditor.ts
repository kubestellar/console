import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mission, MissionActionBundle } from '../../../../../hooks/useMissions.types'
import { isNetlifyDeployment } from '../../../../../lib/demoMode'

interface UseMissionChatMissionEditorParams {
  mission: Mission
  isDemoMode: boolean
  updateSavedMission: MissionActionBundle['updateSavedMission']
  runSavedMission: MissionActionBundle['runSavedMission']
}

/**
 * Owns saved-mission editing (description + steps) and the run/save-and-run flows for
 * pre-run saved missions. Resets its draft state whenever the active mission changes.
 */
export function useMissionChatMissionEditor({
  mission,
  isDemoMode,
  updateSavedMission,
  runSavedMission,
}: UseMissionChatMissionEditorParams) {
  const [isEditingMission, setIsEditingMission] = useState(false)
  const [editDescription, setEditDescription] = useState(mission.description)
  const [editSteps, setEditSteps] = useState<Array<{ title: string; description: string }>>(
    () => (mission.importedFrom?.steps || []).map((step) => ({ title: step.title, description: step.description }))
  )

  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setEditDescription(mission.description)
    setEditSteps((mission.importedFrom?.steps || []).map((step) => ({ title: step.title, description: step.description })))
    setIsEditingMission(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id])

  const saveEdits = useCallback(() => {
    updateSavedMission(mission.id, {
      description: editDescription.trim(),
      steps: editSteps.map((step) => ({ title: step.title.trim(), description: step.description.trim() })),
    })
    setIsEditingMission(false)
  }, [editDescription, editSteps, mission.id, updateSavedMission])

  const cancelEdits = useCallback(() => {
    setEditDescription(mission.description)
    setEditSteps((mission.importedFrom?.steps || []).map((step) => ({ title: step.title, description: step.description })))
    setIsEditingMission(false)
  }, [mission.description, mission.importedFrom?.steps])

  const updateStep = useCallback((idx: number, field: 'title' | 'description', value: string) => {
    setEditSteps((previous) => previous.map((step, index) => index === idx ? { ...step, [field]: value } : step))
  }, [])

  const handleStartEditingMission = useCallback(() => {
    setIsEditingMission(true)
    requestAnimationFrame(() => descriptionRef.current?.focus())
  }, [])

  const triggerSavedMissionRun = useCallback(() => {
    if (isNetlifyDeployment) {
      window.dispatchEvent(new CustomEvent('open-install'))
    } else if (isDemoMode) {
      window.dispatchEvent(new CustomEvent('open-agent-setup'))
    } else {
      runSavedMission(mission.id)
    }
  }, [isDemoMode, mission.id, runSavedMission])

  const handleRunSavedMission = useCallback(() => {
    if (!isNetlifyDeployment && !isDemoMode && isEditingMission) {
      saveEdits()
    }
    triggerSavedMissionRun()
  }, [isDemoMode, isEditingMission, saveEdits, triggerSavedMissionRun])

  const handleSubmitSavedMissionEditsAndRun = useCallback(() => {
    saveEdits()
    runSavedMission(mission.id)
  }, [mission.id, runSavedMission, saveEdits])

  return {
    isEditingMission,
    editDescription,
    editSteps,
    descriptionRef,
    setEditDescription,
    saveEdits,
    cancelEdits,
    updateStep,
    handleStartEditingMission,
    triggerSavedMissionRun,
    handleRunSavedMission,
    handleSubmitSavedMissionEditsAndRun,
  }
}
