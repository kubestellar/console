import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, ChevronDown, ChevronUp, CheckCircle, AlertTriangle } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../cards/console-missions/shared'
import { useAIMode } from '../../hooks/useAIMode'
import { extractJsonFromMarkdown } from '../../lib/ai/extractJson'
import { cn } from '../../lib/cn'

interface InlineAIAssistProps<T> {
  systemPrompt: string
  placeholder: string
  onResult: (result: T) => void
  validateResult?: (data: unknown) => { valid: true; result: T } | { valid: false; error: string }
}

type Phase = 'collapsed' | 'idle' | 'generating' | 'success' | 'error'

export function InlineAIAssist<T>({
  systemPrompt,
  placeholder,
  onResult,
  validateResult,
}: InlineAIAssistProps<T>) {
  const { t } = useTranslation()
  const { mode, isFeatureEnabled } = useAIMode()
  const { startMission, missions, closeSidebar } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const [phase, setPhase] = useState<Phase>(() =>
    mode === 'high' ? 'idle' : 'collapsed'
  )
  const [input, setInput] = useState('')
  const [missionId, setMissionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enabled = isFeatureEnabled('naturalLanguage')
  const trackedMission = missionId ? missions.find(m => m.id === missionId) : null

  // Watch mission completion
  useEffect(() => {
    if (!trackedMission || phase !== 'generating') return

    const assistantMessages = trackedMission.messages.filter(m => m.role === 'assistant')
    const lastMsg = assistantMessages[assistantMessages.length - 1]

    if (
      (trackedMission.status === 'waiting_input' || trackedMission.status === 'completed') &&
      lastMsg
    ) {
      const { data, error: parseErr } = extractJsonFromMarkdown<unknown>(lastMsg.content)
      if (data) {
        if (validateResult) {
          const validation = validateResult(data)
          if (validation.valid) {
            onResult(validation.result)
            setPhase('success')
            setTimeout(() => {
              setPhase('collapsed')
              setInput('')
            }, 1500)
          } else {
            setError(validation.error)
            setPhase('error')
          }
        } else {
          onResult(data as T)
          setPhase('success')
          setTimeout(() => {
            setPhase('collapsed')
            setInput('')
          }, 1500)
        }
      } else {
        setError(parseErr || 'Failed to parse AI response')
        setPhase('error')
      }
    }

    if (trackedMission.status === 'failed') {
      setError('AI generation failed. Check your agent connection.')
      setPhase('error')
    }
  }, [trackedMission, phase, validateResult, onResult])

  const handleGenerate = useCallback(() => {
    if (!input.trim()) return

    checkKeyAndRun(() => {
      const fullPrompt = `${systemPrompt}\n\nUser request: ${input}`
      const id = startMission({
        title: 'Inline AI Assist',
        description: input.substring(0, 200),
        type: 'custom',
        initialPrompt: fullPrompt,
      })
      setMissionId(id)
      setPhase('generating')
      setError(null)
      setTimeout(() => closeSidebar(), 150)
    })
  }, [input, systemPrompt, startMission, closeSidebar, checkKeyAndRun])

  // Don't show at all in low mode
  if (!enabled) return null

  if (phase === 'collapsed') {
    return (
      <button
        onClick={() => setPhase('idle')}
        className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-secondary border border-purple-900 text-purple-400/70 hover:bg-purple-950 hover:text-purple-400 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        <span>{t('dashboard.aiAssist.describeWhatYouWant')}</span>
        <ChevronDown className="w-3 h-3 ml-auto" />
      </button>
    )
  }

  return (
    <div className="rounded-md border border-purple-900 bg-card p-2 space-y-2">
      <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] font-medium text-purple-400 uppercase tracking-wide">{t('dashboard.aiAssist.header')}</span>
        </div>
        <button
          onClick={() => { setPhase('collapsed'); setError(null) }}
          className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
      </div>

      {/* Input + button */}
      {(phase === 'idle' || phase === 'error') && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleGenerate()
            }}
            placeholder={placeholder}
            className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <button
            onClick={handleGenerate}
            disabled={!input.trim()}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0',
              input.trim()
                ? 'bg-purple-900 text-purple-400 hover:bg-purple-800'
                : 'bg-secondary text-muted-foreground cursor-not-allowed',
            )}
          >
            {t('dashboard.aiAssist.generate')}
          </button>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && error && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-400">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Generating */}
      {phase === 'generating' && (
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
          <span className="text-xs text-purple-400">{t('dashboard.aiAssist.generating')}</span>
        </div>
      )}

      {/* Success */}
      {phase === 'success' && (
        <div className="flex items-center gap-2 py-1">
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs text-green-400">{t('dashboard.aiAssist.applied')}</span>
        </div>
      )}
    </div>
  )
}
