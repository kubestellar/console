import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMissions, type Mission } from '../../../../hooks/useMissions'
import { useAuth } from '../../../../lib/auth'
import { MAX_MESSAGE_SIZE_CHARS } from '../../../../lib/constants'
import { useDemoMode } from '../../../../hooks/useDemoMode'
import { useResolutions, detectIssueSignature } from '../../../../hooks/useResolutions'
import { downloadText } from '../../../../lib/download'
import { isNetlifyDeployment } from '../../../../lib/demoMode'
import type { OrbitResourceFilter } from '../../../../lib/missions/types'
import { ConfirmDialog } from '../../../../lib/modals'
import { useToast } from '../../../ui/Toast'
import { SaveResolutionDialog } from '../../../missions/SaveResolutionDialog'
import { SetupInstructionsDialog } from '../../../setup/SetupInstructionsDialog'
import { MissionChatHeader } from './MissionChatHeader'
import { MissionChatInput } from './MissionChatInput'
import { MissionChatMessages } from './MissionChatMessages'
import { MissionChatSidebar } from './MissionChatSidebar'
import {
  COMPACT_ACTION_BUTTON_CLASS,
  MAX_TITLE_LENGTH,
  MISSION_PROGRESS_MAX,
  MISSION_PROGRESS_MIN,
  SCROLL_BOTTOM_THRESHOLD_PX,
} from './missionChatConstants'
import {
  buildMissionTranscript,
  getConversationSummary,
  getOriginalAsk,
} from './missionChatUtils'
import type { FontSize } from '../types'
import { STATUS_CONFIG } from '../types'
import { cn } from '../../../../lib/cn'

export interface MissionChatProps {
  mission: Mission
  isFullScreen?: boolean
  fontSize?: FontSize
  onToggleFullScreen?: () => void
  onOpenOrbitDialog?: (prefill: { clusters?: string[]; resourceFilters?: Record<string, OrbitResourceFilter[]> }) => void
}

export function MissionChat({
  mission,
  isFullScreen = false,
  fontSize = 'base',
  onToggleFullScreen,
  onOpenOrbitDialog,
}: MissionChatProps) {
  const { t } = useTranslation('common')
  const { showToast } = useToast()
  const {
    sendMessage,
    editAndResend,
    retryPreflight,
    cancelMission,
    rateMission,
    setActiveMission,
    dismissMission,
    renameMission,
    runSavedMission,
    updateSavedMission,
  } = useMissions()
  const { user } = useAuth()
  const { isDemoMode } = useDemoMode()
  const { findSimilarResolutions, recordUsage } = useResolutions()
  const missionMessages = mission.messages || []

  const [input, setInput] = useState('')
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [feedbackDismissed, setFeedbackDismissed] = useState<Set<string>>(new Set())
  const [appliedResolutionId] = useState<string | null>(null)
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitleValue, setEditTitleValue] = useState('')
  const [isEditingMission, setIsEditingMission] = useState(false)
  const [editDescription, setEditDescription] = useState(mission.description)
  const [editSteps, setEditSteps] = useState<Array<{ title: string; description: string }>>(
    () => (mission.importedFrom?.steps || []).map((step) => ({ title: step.title, description: step.description }))
  )

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesContentRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const savedInputRef = useRef('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const lastMessageCountRef = useRef(missionMessages.length)
  const initialMessageCountRef = useRef(missionMessages.length)

  const isSavedPreRun = mission.status === 'saved' && missionMessages.length === 0
  const config = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending
  const showHeaderStatus = mission.status !== 'blocked'
  const showCompletedFeedback = !mission.feedback && !feedbackDismissed.has(mission.id)
  const showSaveResolutionPrompt = mission.feedback === 'positive' && !feedbackDismissed.has(mission.id)
  const showOrbitSetupOffer = mission.importedFrom?.missionClass === 'install' || mission.type === 'deploy'
  const showOrbitMonitorOffer =
    mission.importedFrom?.missionClass !== 'install' &&
    mission.importedFrom?.missionClass !== 'orbit' &&
    mission.type !== 'deploy' &&
    Boolean(onOpenOrbitDialog)
  const progressValue = typeof mission.progress === 'number'
    ? Math.max(MISSION_PROGRESS_MIN, Math.min(MISSION_PROGRESS_MAX, Math.round(mission.progress)))
    : null

  useEffect(() => {
    setEditDescription(mission.description)
    setEditSteps((mission.importedFrom?.steps || []).map((step) => ({ title: step.title, description: step.description })))
    setIsEditingMission(false)
    setInputError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id])

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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current
    if (!container) return

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ block: 'end', behavior })
    } else {
      container.scrollTo({
        top: Math.max(container.scrollHeight - container.clientHeight, 0),
        behavior,
      })
    }
    setShouldAutoScroll(true)
  }, [])

  useEffect(() => {
    const messageCount = missionMessages.length
    const hasNewMessages = messageCount > lastMessageCountRef.current
    lastMessageCountRef.current = messageCount

    if (!shouldAutoScroll) return

    const frame = requestAnimationFrame(() => {
      scrollToBottom(hasNewMessages ? 'smooth' : 'auto')
    })

    return () => cancelAnimationFrame(frame)
  }, [mission.updatedAt, missionMessages.length, scrollToBottom, shouldAutoScroll])

  useEffect(() => {
    if (mission.status === 'waiting_input') {
      inputRef.current?.focus()
    }
  }, [mission.status])

  useEffect(() => {
    if (missionMessages.length <= initialMessageCountRef.current) return

    const lastMessage = missionMessages[missionMessages.length - 1]
    if (lastMessage?.role === 'system' && lastMessage.content.includes('Local Agent Not Connected')) {
      setShowSetupDialog(true)
    }
  }, [missionMessages])

  useEffect(() => {
    if (!shouldAutoScroll || typeof ResizeObserver === 'undefined') return

    const content = messagesContentRef.current
    if (!content) return

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => scrollToBottom('auto'))
    })

    observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom, shouldAutoScroll])

  useEffect(() => {
    if (!isFullScreen) return

    const id = setTimeout(() => {
      scrollToBottom('smooth')
    }, 100)

    return () => clearTimeout(id)
  }, [isFullScreen, scrollToBottom])

  const conversationSummary = useMemo(() => getConversationSummary(mission, missionMessages), [mission, missionMessages])
  const originalAsk = useMemo(() => getOriginalAsk(mission, missionMessages), [mission, missionMessages])

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

  const saveTranscript = useCallback(() => {
    const filename = `mission-${mission.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.md`
    const result = downloadText(filename, buildMissionTranscript(mission, missionMessages), 'text/markdown')
    if (!result.ok) {
      showToast(`Failed to export mission: ${result.error?.message || 'unknown error'}`, 'error')
    }
  }, [mission, missionMessages, showToast])

  const isAtBottom = useCallback(() => {
    const container = messagesContainerRef.current
    if (!container) return true
    return container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_BOTTOM_THRESHOLD_PX
  }, [])

  const handleScroll = useCallback(() => {
    setShouldAutoScroll(isAtBottom())
  }, [isAtBottom])

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

  const handleTitleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveTitle()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditTitle()
    }
  }, [cancelEditTitle, saveTitle])

  const handleSend = useCallback(() => {
    if (!input.trim()) return

    if (input.length > MAX_MESSAGE_SIZE_CHARS) {
      setInputError(
        t('missionChat.messageTooLong', {
          current: input.length.toLocaleString(),
          max: MAX_MESSAGE_SIZE_CHARS.toLocaleString(),
          defaultValue: 'Message is too long ({{current}} characters). Maximum is {{max}} characters.',
        })
      )
      return
    }

    setCommandHistory((previous) => [...previous, input.trim()])
    setHistoryIndex(-1)
    savedInputRef.current = ''
    sendMessage(mission.id, input.trim())
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [input, mission.id, sendMessage, t])

  const handleRetryMission = useCallback(() => {
    const lastUserMessage = [...missionMessages].reverse().find((message) => message.role === 'user')
    const prompt = lastUserMessage?.content || ''
    if (!prompt.trim()) return
    sendMessage(mission.id, prompt)
  }, [mission.id, missionMessages, sendMessage])

  const handleMicrophoneTranscript = useCallback((text: string) => {
    setInput((previous) => previous ? `${previous} ${text}` : text)
    inputRef.current?.focus()
  }, [])

  const handleEditMessage = useCallback((messageId: string) => {
    const content = editAndResend(mission.id, messageId)
    if (content) {
      setInput(content)
      setInputError(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editAndResend, mission.id])

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
      return
    }

    if (event.key === 'ArrowUp' && commandHistory.length > 0) {
      event.preventDefault()
      if (historyIndex === -1) {
        savedInputRef.current = input
        setHistoryIndex(commandHistory.length - 1)
        setInput(commandHistory[commandHistory.length - 1])
      } else if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1)
        setInput(commandHistory[historyIndex - 1])
      }
      return
    }

    if (event.key === 'ArrowDown' && historyIndex !== -1) {
      event.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        setHistoryIndex(historyIndex + 1)
        setInput(commandHistory[historyIndex + 1])
      } else {
        setHistoryIndex(-1)
        setInput(savedInputRef.current)
      }
    }
  }, [commandHistory, handleSend, historyIndex, input])

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

  const handleStartEditingMission = useCallback(() => {
    setIsEditingMission(true)
    requestAnimationFrame(() => descriptionRef.current?.focus())
  }, [])

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

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    setInputError(null)
  }, [])

  const savedPreRunProps = isSavedPreRun ? {
    descriptionRef,
    editDescription,
    editSteps,
    isEditingMission,
    mission,
    onBack: () => setActiveMission(null),
    onCancelEdits: cancelEdits,
    onRun: handleRunSavedMission,
    onRunFromKeyboard: triggerSavedMissionRun,
    onSaveEdits: saveEdits,
    onSubmitEditsAndRun: handleSubmitSavedMissionEditsAndRun,
    onSetEditDescription: setEditDescription,
    onStartEditingMission: handleStartEditingMission,
    onUpdateStep: updateStep,
  } : undefined

  return (
    <>
      <div className={cn('flex flex-1 min-h-0 min-w-0 overflow-hidden')}>
        <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
          <MissionChatHeader
            config={config}
            editTitleValue={editTitleValue}
            isEditingTitle={isEditingTitle}
            isFullScreen={isFullScreen}
            maxTitleLength={MAX_TITLE_LENGTH}
            mission={mission}
            relatedResolutionCount={relatedResolutions.length}
            showHeaderStatus={showHeaderStatus}
            titleInputRef={titleInputRef}
            onCancelEditTitle={cancelEditTitle}
            onCancelMission={() => cancelMission(mission.id)}
            onDeleteMission={() => setShowDeleteConfirm(true)}
            onEditTitleChange={setEditTitleValue}
            onSaveTitle={saveTitle}
            onSaveTranscript={saveTranscript}
            onStartEditingTitle={startEditingTitle}
            onTitleKeyDown={handleTitleKeyDown}
            onToggleFullScreen={onToggleFullScreen}
          />

          <MissionChatMessages
            fontSize={fontSize}
            isFullScreen={isFullScreen}
            isSavedPreRun={isSavedPreRun}
            messageAreaProps={savedPreRunProps}
            messagesContainerRef={messagesContainerRef}
            messagesContentRef={messagesContentRef}
            messagesEndRef={messagesEndRef}
            mission={mission}
            progressValue={progressValue}
            shouldAutoScroll={shouldAutoScroll}
            showCompletedFeedback={showCompletedFeedback}
            showOrbitMonitorOffer={showOrbitMonitorOffer}
            showOrbitSetupOffer={showOrbitSetupOffer}
            showSaveResolutionPrompt={showSaveResolutionPrompt}
            userAvatarUrl={user?.avatar_url}
            onDismissFeedback={dismissMissionFeedback}
            onEditMessage={handleEditMessage}
            onNegativeFeedback={handleNegativeFeedback}
            onOpenOrbitDialog={onOpenOrbitDialog}
            onPositiveFeedback={handlePositiveFeedback}
            onRetryPreflight={() => retryPreflight(mission.id)}
            onScroll={handleScroll}
            onScrollToBottom={scrollToBottom}
            onShowSaveDialog={() => setShowSaveDialog(true)}
          />

          {!isSavedPreRun && (
            <MissionChatInput
              compactActionButtonClass={COMPACT_ACTION_BUTTON_CLASS}
              input={input}
              inputError={inputError}
              inputRef={inputRef}
              mission={mission}
              statusColor={config.color}
              statusLabel={config.label}
              onDismissMission={() => dismissMission(mission.id)}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onMicrophoneTranscript={handleMicrophoneTranscript}
              onRetryMission={handleRetryMission}
              onRetryPreflight={() => retryPreflight(mission.id)}
              onSend={handleSend}
            />
          )}
        </div>

        {isFullScreen && (
          <MissionChatSidebar
            conversationSummary={conversationSummary}
            mission={mission}
            originalAsk={originalAsk}
          />
        )}
      </div>

      <SaveResolutionDialog
        mission={mission}
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSaved={() => {
          // Could show a toast notification here.
        }}
      />

      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false)
          dismissMission(mission.id)
          setActiveMission(null)
        }}
        title={t('layout.missionSidebar.deleteMission')}
        message={t('layout.missionSidebar.deleteMissionConfirm')}
        confirmLabel={t('common.delete')}
        variant="danger"
      />
    </>
  )
}
