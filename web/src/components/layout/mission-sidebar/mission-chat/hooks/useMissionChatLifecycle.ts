import { useCallback, useEffect, useRef, useState } from 'react'
import type { Mission, MissionMessage, MissionActionBundle } from '../../../../../hooks/useMissions.types'
import { downloadText } from '../../../../../lib/download'
import { buildMissionTranscript } from '../missionChatUtils'

type ShowToast = (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void

interface UseMissionChatLifecycleParams {
  mission: Mission
  missionMessages: MissionMessage[]
  sendMessage: MissionActionBundle['sendMessage']
  showToast: ShowToast
}

/**
 * Owns dialog visibility (save-resolution, setup-instructions, delete-confirm), the
 * in-flight retry/dismiss flags, the "local agent not connected" setup prompt effect,
 * the retry-mission flow, and transcript export.
 */
export function useMissionChatLifecycle({
  mission,
  missionMessages,
  sendMessage,
  showToast,
}: UseMissionChatLifecycleParams) {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  const initialMessageCountRef = useRef(missionMessages.length)

  useEffect(() => {
    if (missionMessages.length <= initialMessageCountRef.current) return

    const lastMessage = missionMessages[missionMessages.length - 1]
    if (lastMessage?.role === 'system' && lastMessage.content.includes('Local Agent Not Connected')) {
      setShowSetupDialog(true)
    }
  }, [missionMessages])

  const handleRetryMission = useCallback(async () => {
    const lastUserMessage = [...missionMessages].reverse().find((message) => message.role === 'user')
    const prompt = lastUserMessage?.content || ''
    if (!prompt.trim()) return
    setIsRetrying(true)
    try {
      await sendMessage(mission.id, prompt)
    } finally {
      setIsRetrying(false)
    }
  }, [mission.id, missionMessages, sendMessage])

  const saveTranscript = useCallback(() => {
    const filename = `mission-${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`
    const result = downloadText(filename, buildMissionTranscript(mission, missionMessages), 'text/markdown')
    if (!result.ok) {
      showToast(`Failed to export mission: ${result.error?.message || 'unknown error'}`, 'error')
    }
  }, [mission, missionMessages, showToast])

  return {
    showSaveDialog,
    setShowSaveDialog,
    showSetupDialog,
    setShowSetupDialog,
    showDeleteConfirm,
    setShowDeleteConfirm,
    isRetrying,
    setIsRetrying,
    isDismissing,
    setIsDismissing,
    handleRetryMission,
    saveTranscript,
  }
}
