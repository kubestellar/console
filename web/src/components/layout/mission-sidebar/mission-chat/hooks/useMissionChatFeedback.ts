import { useCallback, useState } from 'react'
import type { Mission, MissionActionBundle } from '../../../../../hooks/useMissions.types'

interface UseMissionChatFeedbackParams {
  mission: Mission
  rateMission: MissionActionBundle['rateMission']
  recordUsage: (id: string, successful: boolean) => void
}

/**
 * Owns per-mission feedback state: which missions have had their feedback prompt
 * dismissed, and the positive/negative rating handlers. Also derives the two prompt
 * visibility flags that depend on the dismissed set.
 */
export function useMissionChatFeedback({ mission, rateMission, recordUsage }: UseMissionChatFeedbackParams) {
  const [feedbackDismissed, setFeedbackDismissed] = useState<Set<string>>(new Set())
  const [appliedResolutionId] = useState<string | null>(null)

  const dismissMissionFeedback = useCallback(() => {
    setFeedbackDismissed((previous) => new Set(previous).add(mission.id))
  }, [mission.id])

  const handlePositiveFeedback = useCallback(() => {
    rateMission(mission.id, 'positive')
    if (appliedResolutionId) {
      recordUsage(appliedResolutionId, true)
    }
  }, [appliedResolutionId, mission.id, rateMission, recordUsage])

  const handleNegativeFeedback = useCallback(() => {
    rateMission(mission.id, 'negative')
    if (appliedResolutionId) {
      recordUsage(appliedResolutionId, false)
    }
  }, [appliedResolutionId, mission.id, rateMission, recordUsage])

  const showCompletedFeedback = !mission.feedback && !feedbackDismissed.has(mission.id)
  const showSaveResolutionPrompt = mission.feedback === 'positive' && !feedbackDismissed.has(mission.id)

  return {
    dismissMissionFeedback,
    handlePositiveFeedback,
    handleNegativeFeedback,
    showCompletedFeedback,
    showSaveResolutionPrompt,
  }
}
