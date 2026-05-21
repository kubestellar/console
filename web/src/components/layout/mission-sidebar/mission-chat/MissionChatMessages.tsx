import { ArrowDown, CheckCircle, Save, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../../hooks/useMissions'
import type { OrbitResourceFilter } from '../../../../lib/missions/types'
import { cn } from '../../../../lib/cn'
import { AgentIcon } from '../../../agent/AgentIcon'
import { OrbitMonitorOffer } from '../../../missions/OrbitMonitorOffer'
import { OrbitSetupOffer } from '../../../missions/OrbitSetupOffer'
import { PreflightFailure } from '../../../missions/PreflightFailure'
import { MemoizedMessage } from '../MemoizedMessage'
import { TypingIndicator } from '../TypingIndicator'
import type { FontSize } from '../types'
import { MissionChatSavedPreRun } from './MissionChatSavedPreRun'
import { SCROLL_BTN_FADE_MS } from './missionChatConstants'
import { getMissionAgentProvider } from './missionChatUtils'

interface MissionChatMessagesProps {
  fontSize: FontSize
  isFullScreen: boolean
  isSavedPreRun: boolean
  messageAreaProps?: Parameters<typeof MissionChatSavedPreRun>[0]
  messagesContainerRef: React.RefObject<HTMLDivElement | null>
  messagesContentRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  mission: Mission
  progressValue: number | null
  shouldAutoScroll: boolean
  showCompletedFeedback: boolean
  showOrbitMonitorOffer: boolean
  showOrbitSetupOffer: boolean
  showSaveResolutionPrompt: boolean
  userAvatarUrl?: string
  onDismissFeedback: () => void
  onEditMessage: (messageId: string) => void
  onNegativeFeedback: () => void
  onOpenOrbitDialog?: (prefill: { clusters?: string[]; resourceFilters?: Record<string, OrbitResourceFilter[]> }) => void
  onPositiveFeedback: () => void
  onRetryPreflight: () => void
  onScroll: () => void
  onScrollToBottom: (behavior?: ScrollBehavior) => void
  onShowSaveDialog: () => void
}

export function MissionChatMessages({
  fontSize,
  isFullScreen,
  isSavedPreRun,
  messageAreaProps,
  messagesContainerRef,
  messagesContentRef,
  messagesEndRef,
  mission,
  progressValue,
  shouldAutoScroll,
  showCompletedFeedback,
  showOrbitMonitorOffer,
  showOrbitSetupOffer,
  showSaveResolutionPrompt,
  userAvatarUrl,
  onDismissFeedback,
  onEditMessage,
  onNegativeFeedback,
  onOpenOrbitDialog,
  onPositiveFeedback,
  onRetryPreflight,
  onScroll,
  onScrollToBottom,
  onShowSaveDialog,
}: MissionChatMessagesProps) {
  const { t } = useTranslation('common')
  const missionMessages = mission.messages || []
  const missionAgentProvider = getMissionAgentProvider(mission.agent) || 'anthropic'

  return (
    <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
      <div
        ref={messagesContainerRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        aria-label="Mission chat messages"
        data-testid="mission-chat-scroll-region"
        className="h-full overflow-y-auto scroll-enhanced p-4"
      >
        <div ref={messagesContentRef} className="flex min-h-full flex-col gap-4 pb-6">
          {isSavedPreRun && messageAreaProps && <MissionChatSavedPreRun {...messageAreaProps} />}

          {missionMessages.map((message, index) => {
            const isLastAssistantMessage = message.role === 'assistant' &&
              !missionMessages.slice(index + 1).some((candidate) => candidate.role === 'assistant')

            return (
              <MemoizedMessage
                key={message.id}
                msg={message}
                missionAgent={mission.agent}
                isFullScreen={isFullScreen}
                fontSize={fontSize}
                isLastAssistantMessage={isLastAssistantMessage}
                missionStatus={mission.status}
                userAvatarUrl={userAvatarUrl}
                onEdit={onEditMessage}
              />
            )
          })}

          {mission.status === 'blocked' && mission.preflightError && (
            <div className="px-1">
              <PreflightFailure
                error={mission.preflightError}
                context={mission.cluster}
                onRetry={onRetryPreflight}
              />
            </div>
          )}

          {mission.status === 'running' && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-500/20">
                <AgentIcon provider={missionAgentProvider} className="w-4 h-4" />
              </div>
              <div className="rounded-lg bg-secondary/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <TypingIndicator showMessage={!mission.currentStep} />
                  {mission.currentStep && (
                    <span className="text-xs text-muted-foreground">
                      {mission.currentStep === 'Reconnecting...' && mission.lastKnownStep
                        ? `${mission.lastKnownStep} (reconnecting...)`
                        : mission.currentStep}
                    </span>
                  )}
                  {mission.tokenUsage && mission.tokenUsage.total > 0 && (
                    <span className="text-2xs text-muted-foreground/70 font-mono">
                      {mission.tokenUsage.total.toLocaleString()} tokens
                    </span>
                  )}
                </div>
                {progressValue !== null && (
                  <div className="mt-2 min-w-[180px]">
                    <div className="flex items-center justify-between gap-2 text-2xs">
                      <span className="text-muted-foreground">{t('missionChat.progressLabel', { defaultValue: 'Progress' })}</span>
                      <span className="text-foreground">{t('missionChat.progressValue', { progress: progressValue, defaultValue: '{{progress}}%' })}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-background/60">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${progressValue}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {mission.status === 'completed' && (
            <div className="space-y-3">
              {showCompletedFeedback && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/30 border border-border rounded-md text-xs">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                  <span className="text-muted-foreground">{t('missionChat.wasHelpful', { defaultValue: 'Helpful?' })}</span>
                  <button
                    onClick={onPositiveFeedback}
                    className="flex items-center gap-1 px-2 py-0.5 text-green-400 hover:bg-green-500/15 rounded transition-colors"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    {t('missionChat.yes', { defaultValue: 'Yes' })}
                  </button>
                  <button
                    onClick={onNegativeFeedback}
                    className="flex items-center gap-1 px-2 py-0.5 text-muted-foreground hover:bg-secondary/80 rounded transition-colors"
                  >
                    <ThumbsDown className="w-3 h-3" />
                    {t('missionChat.no', { defaultValue: 'No' })}
                  </button>
                  <button
                    onClick={onDismissFeedback}
                    className="ml-auto p-0.5 text-muted-foreground/50 hover:text-muted-foreground rounded transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {showSaveResolutionPrompt && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/30 border border-border rounded-md text-xs">
                  <span className="text-muted-foreground">{t('missionChat.saveResolutionShort', { defaultValue: 'Save this resolution for next time?' })}</span>
                  <button
                    onClick={onShowSaveDialog}
                    className="flex items-center gap-1 px-2 py-0.5 text-primary hover:bg-primary/15 rounded transition-colors"
                  >
                    <Save className="w-3 h-3" />
                    {t('missionChat.save', { defaultValue: 'Save' })}
                  </button>
                  <button
                    onClick={onDismissFeedback}
                    className="ml-auto p-0.5 text-muted-foreground/50 hover:text-muted-foreground rounded transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {showOrbitSetupOffer && (
                <OrbitSetupOffer
                  projects={mission.importedFrom?.cncfProject
                    ? [{ name: mission.importedFrom.cncfProject, cncfProject: mission.importedFrom.cncfProject, category: mission.context?.category as string }]
                    : [{ name: mission.title, category: mission.context?.category as string }]}
                  clusters={mission.cluster ? [mission.cluster] : []}
                  onCreateOrbit={() => {/* handled internally by OrbitSetupOffer */}}
                  onDashboardCreated={() => {/* navigation handled internally */}}
                  onSkip={() => {/* dismiss is internal */}}
                />
              )}

              {showOrbitMonitorOffer && onOpenOrbitDialog && (
                <OrbitMonitorOffer mission={mission} onOpenOrbitDialog={onOpenOrbitDialog} />
              )}
            </div>
          )}

          <div ref={messagesEndRef} aria-hidden="true" className="h-px shrink-0" />
        </div>
      </div>

      <button
        onClick={() => onScrollToBottom('smooth')}
        className={cn(
          'absolute bottom-4 right-4 z-10 p-2 rounded-full',
          'bg-primary/90 text-primary-foreground shadow-lg',
          'hover:bg-primary transition-all',
          'focus:outline-hidden focus:ring-2 focus:ring-primary/50',
          shouldAutoScroll
            ? 'opacity-0 pointer-events-none scale-90'
            : 'opacity-100 scale-100',
        )}
        style={{ transitionDuration: `${SCROLL_BTN_FADE_MS}ms` }}
        aria-label={t('missionChat.scrollToBottom', { defaultValue: 'Scroll to latest message' })}
        data-testid="scroll-to-bottom-btn"
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  )
}
