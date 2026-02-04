/**
 * LLM-d AI Insights Panel
 *
 * Claude-powered analysis of the LLM-d stack with
 * recommendations, anomaly detection, and optimization suggestions.
 */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Lightbulb, AlertTriangle, TrendingUp, Gauge, MessageSquare, RefreshCw, ChevronRight } from 'lucide-react'
import { generateAIInsights, type AIInsight } from '../../../lib/llmd/mockData'

const INSIGHT_ICONS = {
  optimization: Lightbulb,
  anomaly: AlertTriangle,
  capacity: Gauge,
  performance: TrendingUp,
}

const SEVERITY_COLORS = {
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', icon: 'text-blue-400' },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', icon: 'text-amber-400' },
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: 'text-red-400' },
}

interface InsightCardProps {
  insight: AIInsight
  isExpanded: boolean
  onToggle: () => void
}

function InsightCard({ insight, isExpanded, onToggle }: InsightCardProps) {
  const Icon = INSIGHT_ICONS[insight.type]
  const colors = SEVERITY_COLORS[insight.severity]

  return (
    <motion.div
      className={`${colors.bg} ${colors.border} border rounded-lg overflow-hidden cursor-pointer`}
      onClick={onToggle}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className={`p-1.5 rounded ${colors.bg}`}>
            <Icon size={14} className={colors.icon} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className={`font-medium text-sm ${colors.text}`}>{insight.title}</h4>
              <motion.div
                animate={{ rotate: isExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight size={14} className="text-muted-foreground" />
              </motion.div>
            </div>

            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {insight.description}
            </p>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-3 pt-3 border-t border-slate-700/50"
            >
              {/* Recommendation */}
              <div className="mb-3">
                <div className="text-xs font-medium text-white mb-1">Recommendation</div>
                <p className="text-xs text-muted-foreground">{insight.recommendation}</p>
              </div>

              {/* Metrics */}
              {insight.metrics && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(insight.metrics).map(([key, value]) => (
                    <div key={key} className="bg-slate-800/50 rounded p-2 text-center">
                      <div className="text-xs text-muted-foreground truncate">{key}</div>
                      <div className="text-sm font-mono text-white">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <div className="mt-2 text-xs text-muted-foreground">
                {insight.timestamp.toLocaleTimeString()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export function LLMdAIInsights() {
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([])

  // Load initial insights
  useEffect(() => {
    setInsights(generateAIInsights())
  }, [])

  // Simulate AI analysis
  const runAnalysis = async () => {
    setIsAnalyzing(true)
    await new Promise(resolve => setTimeout(resolve, 2000))
    setInsights(generateAIInsights())
    setIsAnalyzing(false)
  }

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatHistory(prev => [...prev, { role: 'user', message: userMessage }])
    setChatInput('')

    // Simulate AI response
    await new Promise(resolve => setTimeout(resolve, 1500))

    const responses: Record<string, string> = {
      'scale': 'Based on current load patterns, I recommend scaling up to 4 prefill replicas during peak hours (10am-2pm) and scaling down to 2 during off-peak. This would reduce P95 latency by ~30% while maintaining cost efficiency.',
      'cache': 'KV cache utilization is averaging 72% with occasional spikes to 87%. Consider enabling prefix caching for repeated prompt patterns, which could improve hit rate by 15-20%.',
      'performance': 'Current TTFT is 420ms, which is 50% better than baseline. To further optimize, consider enabling disaggregated serving - this could reduce TTFT to ~280ms.',
      'default': 'I can help analyze your LLM-d stack. Try asking about scaling recommendations, cache optimization, performance tuning, or capacity planning.',
    }

    const keyword = Object.keys(responses).find(k => userMessage.toLowerCase().includes(k)) || 'default'
    setChatHistory(prev => [...prev, { role: 'ai', message: responses[keyword] }])
  }

  const insightCounts = {
    total: insights.length,
    warning: insights.filter(i => i.severity === 'warning').length,
    critical: insights.filter(i => i.severity === 'critical').length,
  }

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <span className="font-medium text-white">AI Insights</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={isAnalyzing ? 'animate-spin' : ''} />
            {isAnalyzing ? 'Analyzing...' : 'Refresh'}
          </button>
          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
            Demo
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Insights:</span>
          <span className="text-white font-mono">{insightCounts.total}</span>
        </div>
        {insightCounts.warning > 0 && (
          <div className="flex items-center gap-1 text-amber-400">
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
      <div className="flex-1 overflow-auto space-y-2 mb-4">
        {isAnalyzing ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <motion.div
                className="w-12 h-12 mx-auto mb-3 rounded-full border-2 border-purple-500/30 border-t-purple-500"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-sm text-muted-foreground">Analyzing your LLM-d stack...</p>
            </div>
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
      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <MessageSquare size={12} />
          <span>Ask about your stack</span>
        </div>

        {/* Chat history */}
        {chatHistory.length > 0 && (
          <div className="max-h-24 overflow-auto mb-2 space-y-2">
            {chatHistory.slice(-4).map((msg, i) => (
              <div
                key={i}
                className={`text-xs p-2 rounded ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white ml-8'
                    : 'bg-purple-500/10 text-purple-200 mr-8'
                }`}
              >
                {msg.message}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="e.g., How should I scale my prefill servers?"
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  )
}

export default LLMdAIInsights
