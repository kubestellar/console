import { useTranslation } from 'react-i18next'
import { useMissions, type Mission } from '../../../../hooks/useMissions'
import { useAuth } from '../../../../lib/auth'
import { useDemoMode } from '../../../../hooks/useDemoMode'
import { useResolutions } from '../../../../hooks/useResolutions'
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
} from './missionChatConstants'
import { useMissionChatScroll } from './hooks/useMissionChatScroll'
import { useMissionChatComposer } from './hooks/useMissionChatComposer'
import { useMissionChatTitle } from './hooks/useMissionChatTitle'
import { useMissionChatMissionEditor } from './hooks/useMissionChatMissionEditor'
import { useMissionChatFeedback } from './hooks/useMissionChatFeedback'
import { useMissionChatLifecycle } from './hooks/useMissionChatLifecycle'
import { useMissionChatDerived } from './hooks/useMissionChatDerived'
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

  const isSavedPreRun = mission.status === 'saved' && missionMessages.length === 0
  const config = STATUS_CONFIG[mission.status] || STATUS_CONFIG.pending
  const showHeaderStatus = mission.status !== 'blocked'
  const showOrbitSetupOffer = mission.importedFrom?.missionClass === 'install' || mission.type === 'deploy'
  const showOrbitMonitorOffer =
    mission.importedFrom?.missionClass !== 'install' &&
    mission.importedFrom?.missionClass !== 'orbit' &&
    mission.type !== 'deploy' &&
    Boolean(onOpenOrbitDialog)
  const progressValue = typeof mission.progress === 'number'
    ? Math.max(MISSION_PROGRESS_MIN, Math.min(MISSION_PROGRESS_MAX, Math.round(mission.progress)))
    : null

  const {
    messagesContainerRef,
    messagesContentRef,
    messagesEndRef,
    shouldAutoScroll,
    scrollToBottom,
    handleScroll,
  } = useMissionChatScroll({ mission, missionMessages, isFullScreen })

  const {
    input,
    inputError,
    inputRef,
    handleSend,
    handleKeyDown,
    handleInputChange,
    handleMicrophoneTranscript,
    handleEditMessage,
  } = useMissionChatComposer({ mission, sendMessage, editAndResend })

  const {
    isEditingTitle,
    editTitleValue,
    titleInputRef,
    setEditTitleValue,
    startEditingTitle,
    saveTitle,
    cancelEditTitle,
    handleTitleKeyDown,
  } = useMissionChatTitle({ mission, renameMission })

  const {
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
  } = useMissionChatMissionEditor({ mission, isDemoMode, updateSavedMission, runSavedMission })

  const {
    dismissMissionFeedback,
    handlePositiveFeedback,
    handleNegativeFeedback,
    showCompletedFeedback,
    showSaveResolutionPrompt,
  } = useMissionChatFeedback({ mission, rateMission, recordUsage })

  const {
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
  } = useMissionChatLifecycle({ mission, missionMessages, sendMessage, showToast })

  const { relatedResolutions, conversationSummary, originalAsk } = useMissionChatDerived({
    mission,
    missionMessages,
    findSimilarResolutions,
  })

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
              onDismissMission={async () => {
                setIsDismissing(true)
                try {
                  await dismissMission(mission.id)
                } finally {
                  setIsDismissing(false)
                }
              }}
              onInputChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onMicrophoneTranscript={handleMicrophoneTranscript}
              onRetryMission={handleRetryMission}
              onRetryPreflight={async () => {
                setIsRetrying(true)
                try {
                  await retryPreflight(mission.id)
                } finally {
                  setIsRetrying(false)
                }
              }}
              onSend={handleSend}
              isRetrying={isRetrying}
              isDismissing={isDismissing}
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
