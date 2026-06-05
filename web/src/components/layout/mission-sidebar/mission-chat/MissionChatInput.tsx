import { Loader2, RotateCcw, Send, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Mission } from '../../../../hooks/useMissions'
import { cn } from '../../../../lib/cn'
import { FileAttachmentButton } from '../../../ui/FileAttachmentButton'
import { MicrophoneButton } from '../../../ui/MicrophoneButton'

interface MissionChatInputProps {
  compactActionButtonClass: string
  input: string
  inputError: string | null
  inputRef: React.RefObject<HTMLInputElement | null>
  mission: Mission
  statusLabel: string
  statusColor: string
  onDismissMission: () => void
  onInputChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onMicrophoneTranscript: (text: string) => void
  onRetryMission: () => void
  onRetryPreflight: () => void
  onSend: () => void
}

export function MissionChatInput({
  compactActionButtonClass,
  input,
  inputError,
  inputRef,
  mission,
  statusLabel,
  statusColor,
  onDismissMission,
  onInputChange,
  onKeyDown,
  onMicrophoneTranscript,
  onRetryMission,
  onRetryPreflight,
  onSend,
}: MissionChatInputProps) {
  const { t } = useTranslation('common')

  return (
    <div
      data-testid="mission-chat-composer"
      className="sticky bottom-0 border-t border-border shrink-0 bg-card min-w-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {mission.status === 'cancelling' ? (
        <div className="flex items-center justify-center gap-2 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
          <span className="text-sm text-orange-400">Cancelling mission...</span>
        </div>
      ) : mission.status === 'running' ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 min-w-0">
            <input
              type="text"
              disabled
              placeholder={t('missionChat.waitingForAgent', { defaultValue: 'Waiting for agent to finish...' })}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/30 border border-border rounded-lg text-muted-foreground placeholder:text-muted-foreground/60 cursor-not-allowed"
            />
            <button
              disabled
              className="shrink-0 px-3 py-3 min-h-[44px] bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('missionChat.sendWillQueue')}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : mission.status === 'completed' ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('missionChat.askFollowUp', { defaultValue: 'Ask a follow-up question...' })}
              className="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg border border-border bg-secondary/50 focus:bg-secondary focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <FileAttachmentButton compact />
            <MicrophoneButton onTranscript={onMicrophoneTranscript} compact />
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className={cn(
                compactActionButtonClass,
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-colors'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : mission.status === 'blocked' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-amber-400">{statusLabel}</span>
            <span className="text-muted-foreground">Fix the issue above, then retry</span>
          </div>
          <button
            onClick={onRetryPreflight}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-600/30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retry Preflight Check
          </button>
          <button
            onClick={onDismissMission}
            className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
            Dismiss Mission
          </button>
        </div>
      ) : mission.status === 'failed' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className={cn(statusColor)}>{statusLabel}</span>
            <span className="text-muted-foreground">{t('missionChat.switchAgentRetry')}</span>
          </div>
          {(mission.messages || []).some((message) => message.role === 'user') && (
            <button
              onClick={onRetryMission}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {t('missionChat.retryMission', { defaultValue: 'Retry Mission' })}
            </button>
          )}
          <div className="flex gap-2 min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('missionChat.retryWithMessage')}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <FileAttachmentButton compact />
            <MicrophoneButton onTranscript={onMicrophoneTranscript} compact />
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className={cn(
                compactActionButtonClass,
                'bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 min-w-0">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('missionChat.typeMessage')}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <FileAttachmentButton compact />
            <MicrophoneButton onTranscript={onMicrophoneTranscript} compact />
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className={cn(
                compactActionButtonClass,
                'bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {inputError && (
        <div className="mt-2 px-1 text-xs text-red-400 flex items-center gap-1.5">
          <span>{inputError}</span>
        </div>
      )}
    </div>
  )
}
