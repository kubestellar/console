import { useMemo } from 'react'
import type { Mission, MissionMessage } from '../../../../../hooks/useMissions.types'
import {
  detectIssueSignature,
  type IssueSignature,
  type SimilarResolution,
} from '../../../../../hooks/useResolutions'
import { getConversationSummary, getOriginalAsk } from '../missionChatUtils'

type FindSimilarResolutions = (
  signature: IssueSignature,
  options?: { minSimilarity?: number; limit?: number },
) => SimilarResolution[]

interface UseMissionChatDerivedParams {
  mission: Mission
  missionMessages: MissionMessage[]
  findSimilarResolutions: FindSimilarResolutions
}

/**
 * Owns the memoised, derived data for the chat: resolutions similar to the current
 * mission, the conversation summary, and the original ask.
 */
export function useMissionChatDerived({ mission, missionMessages, findSimilarResolutions }: UseMissionChatDerivedParams) {
  const relatedResolutions = useMemo(() => {
    const content = [
      mission.title,
      mission.description,
      ...missionMessages.slice(0, 3).map((message) => message.content),
    ].join('\n')

    const signature = detectIssueSignature(content)
    if (!signature.type || signature.type === 'Unknown') {
      return []
    }

    return findSimilarResolutions(signature as { type: string }, { minSimilarity: 0.4, limit: 5 })
  }, [findSimilarResolutions, mission.description, mission.title, missionMessages])

  const conversationSummary = useMemo(() => getConversationSummary(mission, missionMessages), [mission, missionMessages])
  const originalAsk = useMemo(() => getOriginalAsk(mission, missionMessages), [mission, missionMessages])

  return { relatedResolutions, conversationSummary, originalAsk }
}
