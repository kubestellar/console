import { useState, useEffect, useCallback, startTransition, type ReactNode } from 'react'
import { Sparkles, Loader2, CheckCircle, AlertTriangle, RotateCw, Save } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from '../cards/console-missions/shared'
import { extractJsonFromMarkdown } from '../../lib/ai/extractJson'
import { cn } from '../../lib/cn'

type Phase = 'idle' | 'generating' | 'parsed' | 'error'

interface AiGenerationPanelProps<T> {
  systemPrompt: string
  placeholder: string
  missionTitle: string
  validateResult: (data: unknown) => { valid: true; result: T } | { valid: false; error: string }
  renderPreview: (result: T) => ReactNode
  onSave: (result: T) => void
  saveLabel?: string
}

export function AiGenerationPanel<T>({
  systemPrompt,
  placeholder,
  missionTitle,
  validateResult,
  renderPreview,
  onSave,
  saveLabel = 'Save',
}: AiGenerationPanelProps<T>) {
  const [userPrompt, setUserPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [missionId, setMissionId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [parsedResult, setParsedResult] = useState<T | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const { startMission, missions, closeSidebar } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  // Track the active mission
  const trackedMission = missionId ? missions.find(m => m.id === missionId) : null

  // Update streaming text from mission messages
  useEffect(() => {
    if (!trackedMission || phase !== 'generating') return

    const assistantMessages = trackedMission.messages.filter(m => m.role === 'assistant')
    const lastMsg = assistantMessages[assistantMessages.length - 1]
    if (lastMsg) {
      setStreamingText(lastMsg.content)
    }

    // Check for completion
    if (
      (trackedMission.status === 'waiting_input' || trackedMission.status === 'completed') &&
      lastMsg
    ) {
      const { data, error } = extractJsonFromMarkdown<unknown>(lastMsg.content)
      if (data) {
        const validation = validateResult(data)
        if (validation.valid) {
          // Batch non-urgent state updates to prevent flicker
          startTransition(() => {
            setParsedResult(validation.result)
            setPhase('parsed')
          })
        } else {
          // Error states should be shown immediately (not deferred)
          setParseError(validation.error)
          setPhase('error')
        }
      } else {
        // Error states should be shown immediately (not deferred)
        setParseError(error || 'Failed to parse AI response')
        setPhase('error')
      }
    }

    if (trackedMission.status === 'failed') {
      setParseError('AI generation failed. Please check your agent connection and try again.')
      setPhase('error')
    }
  }, [trackedMission?.status, trackedMission?.messages.length, phase, validateResult])

  const handleGenerate = useCallback(() => {
    if (!userPrompt.trim()) return

    checkKeyAndRun(() => {
      const fullPrompt = `${systemPrompt}\n\nUser request: ${userPrompt}`
      const id = startMission({
        title: missionTitle,
        description: userPrompt.substring(0, 200),
        type: 'custom',
        initialPrompt: fullPrompt,
      })
      setMissionId(id)
      setPhase('generating')
      setStreamingText('')
      setParsedResult(null)
      setParseError(null)
      // Close sidebar so modal stays focused
      setTimeout(() => closeSidebar(), 150)
    })
  }, [userPrompt, systemPrompt, missionTitle, startMission, closeSidebar, checkKeyAndRun])

  const handleRetry = useCallback(() => {
    setPhase('idle')
    setStreamingText('')
    setParsedResult(null)
    setParseError(null)
    setMissionId(null)
  }, [])

  const handleSave = useCallback(() => {
    if (parsedResult) {
      onSave(parsedResult)
      handleRetry()
      setUserPrompt('')
    }
  }, [parsedResult, onSave, handleRetry])

  return (
    <div className="space-y-4 relative">
      {/* API Key Modal */}
      <ApiKeyPromptModal isOpen={showKeyPrompt} onDismiss={dismissPrompt} onGoToSettings={goToSettings} />

      {/* Prompt input (idle and error phases) */}
      {(phase === 'idle' || phase === 'error') && (
        <>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Describe what you want
            </label>
            <textarea
              value={userPrompt}
              onChange={e => setUserPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
              }}
              placeholder={placeholder}
              rows={4}
              className="w-full text-sm px-3 py-2 rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              Press Cmd+Enter to generate
            </p>
          </div>

          {/* Error display */}
          {phase === 'error' && parseError && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-950 border border-red-900">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-red-400 break-words">{parseError}</span>
                {streamingText && (
                  <details className="mt-2 text-xs">
                    <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                      View raw AI output
                    </summary>
                    <pre className="mt-1 p-2 bg-secondary rounded text-[10px] text-muted-foreground overflow-x-auto max-h-40 whitespace-pre-wrap">
                      {streamingText}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!userPrompt.trim()}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors',
              userPrompt.trim()
                ? 'bg-purple-900 text-purple-400 hover:bg-purple-800'
                : 'bg-secondary text-muted-foreground cursor-not-allowed',
            )}
          >
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </button>
        </>
      )}

      {/* Generating — streaming view */}
      {phase === 'generating' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
            <span className="text-sm text-purple-400">
              {trackedMission?.currentStep || 'Generating...'}
            </span>
          </div>
          <textarea
            readOnly
            value={streamingText || 'Waiting for AI response...'}
            rows={12}
            className="w-full text-xs px-3 py-2 rounded-md bg-secondary border border-border text-foreground font-mono focus:outline-none leading-relaxed"
          />
          <p className="text-[10px] text-muted-foreground/50 text-center">
            The AI is generating your definition. This may take a moment.
          </p>
        </div>
      )}

      {/* Parsed result — preview + save */}
      {phase === 'parsed' && parsedResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400">Generation complete!</span>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-secondary p-4">
            {renderPreview(parsedResult)}
          </div>

          {/* Raw output toggle */}
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              View raw AI output
            </summary>
            <textarea
              readOnly
              value={streamingText}
              rows={8}
              className="w-full mt-2 text-xs px-3 py-2 rounded-md bg-secondary border border-border text-foreground font-mono"
            />
          </details>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium bg-purple-900 text-purple-400 hover:bg-purple-800 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saveLabel}
            </button>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
