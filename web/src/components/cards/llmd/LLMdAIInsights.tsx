/**
 * LLM-d AI Insights Panel
 *
 * Generates insights based on the selected llm-d stack's real state.
 * Shows optimization suggestions, warnings, and anomaly detection.
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Brain, MessageSquare, Sparkles, Settings2, Zap, Loader2 } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { useCardExpanded } from '../CardWrapper'
import { generateAIInsights } from '../../../lib/llmd/mockData'
import { useTranslation } from 'react-i18next'
import { PROGRESS_SIMULATION_MS } from '../../../lib/constants/network'
import { useToast } from '../../../components/ui/Toast'
import { InsightCard } from './LLMdAIInsights.InsightCard'
import { buildChatResponse, generateStackInsights, type TranslateFn } from './LLMdAIInsights.utils'

export function LLMdAIInsights() {
  const { t } = useTranslation(['cards', 'common'])
  const { showToast } = useToast()
  const stackContext = useOptionalStack()
  const { shouldUseDemoData, showDemoBadge, reason } = useCardDemoState({ requires: 'stack' })
  const isRefreshing = stackContext?.isRefreshing ?? false

  // Report demo state to CardWrapper so it can show demo badge and yellow outline
  // Use showDemoBadge (true when global demo mode) rather than shouldUseDemoData (false when stack selected)
  useReportCardDataState({ isDemoData: showDemoBadge, isRefreshing, isFailed: false, consecutiveFailures: 0, hasData: true })

  const { isExpanded: isCardExpanded } = useCardExpanded()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const chatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (chatTimerRef.current) {
        clearTimeout(chatTimerRef.current)
      }
    }
  }, [])

  // Generate insights based on demo mode or real stack
  const insights = (() => {
    if (shouldUseDemoData) {
      return generateAIInsights()
    }

    if (stackContext?.selectedStack) {
      return generateStackInsights(stackContext.selectedStack, t as unknown as TranslateFn)
    }

    return []
  })()

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isGenerating) return

    const userMessage = chatInput
    setChatHistory(prev => [...prev, { role: 'user', message: userMessage }])
    setChatInput('')
    setIsGenerating(true)

    try {
      // Generate contextual responses based on stack state
      await new Promise<void>(resolve => {
        chatTimerRef.current = setTimeout(() => {
          chatTimerRef.current = null
          resolve()
        }, PROGRESS_SIMULATION_MS)
      })

      const response = buildChatResponse(userMessage, stackContext?.selectedStack, shouldUseDemoData)

      setChatHistory(prev => [...prev, { role: 'ai', message: response }])
      showToast(t('cards:llmdAIInsights.chatSubmitted'), 'success')
    } catch (err: unknown) {
      console.error('[LLMdAIInsights] Chat generation failed:', err)
      const message = t('cards:llmdAIInsights.chatError', { defaultValue: 'Failed to generate response. Please try again.' })
      showToast(message, 'error')
      setChatHistory(prev => [...prev, { role: 'ai', message }])
    } finally {
      setIsGenerating(false)
    }
  }

  const insightCounts = {
    total: insights.length,
    warning: insights.filter(i => i.severity === 'warning').length,
    critical: insights.filter(i => i.severity === 'critical').length }

  const selectedStack = stackContext?.selectedStack

  return (
    <div className="p-4 h-full flex-1 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <span className="font-medium text-white">{t('llmdAIInsights.aiInsights')}</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedStack && !shouldUseDemoData && (
            <StatusBadge color="purple" className="truncate max-w-[100px]" title={selectedStack.name}>
              {selectedStack.name}
            </StatusBadge>
          )}
          {showDemoBadge && (
            <StatusBadge color="yellow" icon={<Sparkles size={10} />}>
              {t('common:common.demo')}
            </StatusBadge>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('llmdAIInsights.insights')}:</span>
          <span className="text-white font-mono">{insightCounts.total}</span>
        </div>
        {insightCounts.warning > 0 && (
          <div className="flex items-center gap-1 text-yellow-400">
            <AlertTriangle size={12} />
            <span className="font-mono">{insightCounts.warning}</span>
          </div>
        )}
        {insightCounts.critical > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <AlertTriangle size={12} />
            <span className="font-mono">{insightCounts.critical}</span>
          </div>
        )}
      </div>

      {/* Insights list */}
      <div className={`flex-1 overflow-auto mb-4 ${isCardExpanded ? 'grid grid-cols-2 gap-3 auto-rows-min' : 'space-y-2'}`}>
        {insights.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full text-center ${isCardExpanded ? 'col-span-2' : ''}`}>
            <Settings2 size={32} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {reason === 'stack-not-selected'
                ? t('llmdAIInsights.selectStackToSee')
                : t('llmdAIInsights.noInsightsAvailable')}
            </p>
          </div>
        ) : (
          insights.map(insight => (
            <InsightCard
              key={insight.id}
              insight={insight}
              isExpanded={expandedId === insight.id}
              onToggle={() => setExpandedId(expandedId === insight.id ? null : insight.id)}
            />
          ))
        )}
      </div>

      {/* Chat interface */}
      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <MessageSquare size={12} />
          <span>{t('llmdAIInsights.askAboutStack')}</span>
        </div>

        {/* Chat history */}
        {chatHistory.length > 0 && (
          <div className="max-h-24 overflow-auto mb-2 space-y-2">
            {chatHistory.slice(-4).map((msg, i) => (
              <div
                key={i}
                className={`text-xs p-2 rounded ${
                  msg.role === 'user'
                    ? 'bg-secondary text-white ml-8'
                    : 'bg-purple-500/10 text-purple-200 mr-8'
                }`}
              >
                {msg.message}
              </div>
            ))}
            {isGenerating && (
              <div className="bg-purple-500/10 text-purple-300 mr-8 text-xs p-2 rounded flex items-center gap-2">
                <Loader2 size={10} className="animate-spin" />
                <span>{t('llmdAIInsights.thinking')}</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder={t('llmdAIInsights.scalePlaceholder')}
            className="flex-1 bg-secondary border border-border rounded px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-hidden focus:border-purple-500"
            disabled={isGenerating}
          />
          <button
            type="submit"
            disabled={isGenerating || !chatInput.trim()}
            className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LLMdAIInsights
