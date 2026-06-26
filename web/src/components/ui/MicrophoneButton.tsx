import { Mic, Square, AlertCircle, Loader2 } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '../../lib/cn'
import { useMicrophoneInput } from '../../hooks/useMicrophoneInput'
import { useTranslation } from 'react-i18next'

/** Duration (ms) to show error tooltips before auto-dismissing */
const ERROR_DISPLAY_MS = 5_000
const COMPACT_ACTION_BUTTON_CLASS = 'h-10 w-10 shrink-0 p-0 inline-flex items-center justify-center'
const DEFAULT_ACTION_BUTTON_CLASS = 'p-3'

interface MicrophoneButtonProps {
  /** Called with transcribed text when recording stops */
  onTranscript: (text: string) => void
  /** Disable the button (e.g. while agent is running) */
  disabled?: boolean
  /** Compact mode for inline placement next to chat inputs */
  compact?: boolean
}

export function MicrophoneButton({ onTranscript, disabled = false, compact = false }: MicrophoneButtonProps) {
  const { t } = useTranslation('common')
  const { isRecording, isTranscribing, transcript, error, isSupported, startRecording, stopRecording, clearError } =
    useMicrophoneInput()
  const [showError, setShowError] = useState(false)

  // Show error for a few seconds, then auto-dismiss
  useEffect(() => {
    if (error) {
      setShowError(true)
      const timer = setTimeout(() => {
        setShowError(false)
        clearError()
      }, ERROR_DISPLAY_MS)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  // Auto-apply transcript when recording stops (if not empty)
  useEffect(() => {
    if (!isRecording && !isTranscribing && transcript.trim()) {
      onTranscript(transcript.trim())
    }
  }, [isRecording, isTranscribing, transcript, onTranscript])

  if (!isSupported) {
    return null
  }

  const handleToggleRecording = async () => {
    if (isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  const buttonSize = compact ? COMPACT_ACTION_BUTTON_CLASS : DEFAULT_ACTION_BUTTON_CLASS
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className="relative flex items-center">
      {/* Error tooltip */}
      {showError && error && (
        <div className="absolute bottom-full mb-2 right-0 text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20 flex items-center gap-1 max-w-xs whitespace-nowrap z-50">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="line-clamp-1">{error}</span>
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute bottom-full mb-2 right-0 text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded border border-red-500/20 flex items-center gap-1 whitespace-nowrap z-50">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          {t('microphone.recording', { defaultValue: 'Recording...' })}
        </div>
      )}

      {/* Transcribing indicator */}
      {isTranscribing && !isRecording && (
        <div className="absolute bottom-full mb-2 right-0 text-xs bg-purple-500/10 text-purple-400 px-2 py-1 rounded border border-purple-500/20 flex items-center gap-1 whitespace-nowrap z-50">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t('microphone.processing', { defaultValue: 'Processing...' })}
        </div>
      )}

      {/* Microphone button */}
      <button
        onClick={handleToggleRecording}
        disabled={disabled || isTranscribing}
        className={cn(
          buttonSize,
          'rounded-lg transition-all duration-200 relative',
          isRecording
            ? 'bg-red-500 text-foreground hover:bg-red-600 ring-2 ring-red-500/50'
            : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
          (disabled || isTranscribing) && 'opacity-50 cursor-not-allowed'
        )}
        title={
          isRecording
            ? t('microphone.stopRecording', { defaultValue: 'Stop recording' })
            : t('microphone.startRecording', { defaultValue: 'Start recording' })
        }
        data-testid="microphone-button"
      >
        {isRecording ? (
          <Square className={iconSize} />
        ) : (
          <Mic className={iconSize} />
        )}

        {/* Pulsing ring when recording */}
        {isRecording && (
          <span className="absolute inset-0 rounded-lg animate-ping bg-red-500/30 pointer-events-none" />
        )}
      </button>
    </div>
  )
}
