/**
 * LLM-d AI Insights Panel
 *
 * Generates insights based on the selected llm-d stack's real state.
 * Shows optimization suggestions, warnings, and anomaly detection.
 */
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Lightbulb, AlertTriangle, TrendingUp, Gauge, MessageSquare, ChevronRight, Sparkles, Settings2, Zap } from 'lucide-react'
import { useOptionalStack } from '../../../contexts/StackContext'
import { useCardDemoState, useReportCardDataState } from '../CardDataContext'
import { generateAIInsights, type AIInsight } from '../../../lib/llmd/mockData'
import type { LLMdStack } from '../../../hooks/useStackDiscovery'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation(['cards', 'common'])
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
                <div className="text-xs font-medium text-white mb-1">{t('llmdAIInsights.recommendation')}</div>
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

/**
 * Generate real insights based on the selected stack's state
 */
function generateStackInsights(stack: LLMdStack, t?: (key: string, options?: any) => string): AIInsight[] {
  const insights: AIInsight[] = []
  const now = new Date()

  // Check stack health status
  if (stack.status === 'degraded') {
    insights.push({
      id: 'stack-degraded',
      type: 'anomaly',
      severity: 'warning',
      title: t ? t('llmdAIInsights.stackHealthDegraded') : 'Stack Health Degraded',
      description: t ? t('llmdAIInsights.stackDegraded', { name: stack.name }) : `The ${stack.name} stack is in a degraded state. Some components may not be functioning optimally.`,
      recommendation: t ? t('llmdAIInsights.stackDegradedRec') : 'Check pod status and logs for failing components. Look for resource constraints or configuration issues.',
      metrics: {
        'Total Replicas': stack.totalReplicas,
        'Ready': stack.readyReplicas,
        'Status': stack.status,
      },
      timestamp: now,
    })
  } else if (stack.status === 'unhealthy') {
    insights.push({
      id: 'stack-unhealthy',
      type: 'anomaly',
      severity: 'critical',
      title: t ? t('llmdAIInsights.stackUnhealthy') : 'Stack Unhealthy',
      description: t ? t('llmdAIInsights.stackUnhealthyDesc', { name: stack.name }) : `The ${stack.name} stack is unhealthy. Critical components are not running.`,
      recommendation: t ? t('llmdAIInsights.stackUnhealthyRec') : 'Immediate investigation required. Check pod events, resource quotas, and node availability.',
      metrics: {
        'Total Replicas': stack.totalReplicas,
        'Ready': stack.readyReplicas,
        'Status': stack.status,
      },
      timestamp: now,
    })
  }

  // Check for missing gateway
  if (!stack.components.gateway) {
    insights.push({
      id: 'missing-gateway',
      type: 'capacity',
      severity: 'warning',
      title: t ? t('llmdAIInsights.noGatewayConfigured') : 'No Gateway Configured',
      description: t ? t('llmdAIInsights.noGatewayDesc') : 'This stack has no gateway component. External traffic routing may not be properly configured.',
      recommendation: t ? t('llmdAIInsights.noGatewayRec') : 'Deploy an Istio Gateway or Envoy ingress to handle external inference requests.',
      timestamp: now,
    })
  }

  // Check for no autoscaler
  if (!stack.autoscaler) {
    insights.push({
      id: 'no-autoscaler',
      type: 'optimization',
      severity: 'info',
      title: t ? t('llmdAIInsights.manualScaling') : 'Manual Scaling Configured',
      description: t ? t('llmdAIInsights.manualScalingDesc') : 'This stack does not have an autoscaler. Replicas must be scaled manually.',
      recommendation: t ? t('llmdAIInsights.manualScalingRec') : 'Consider enabling Variant Autoscaling (WVA) or HPA for automatic scaling based on load.',
      metrics: {
        'Current Replicas': stack.totalReplicas,
        'Autoscaler': 'None',
      },
      timestamp: now,
    })
  } else {
    // Check autoscaler headroom
    const currentReplicas = stack.autoscaler.currentReplicas ?? 0
    const maxReplicas = stack.autoscaler.maxReplicas ?? 0
    if (maxReplicas > 0) {
      const headroomPercent = ((maxReplicas - currentReplicas) / maxReplicas) * 100
      if (headroomPercent < 20) {
        insights.push({
          id: 'low-autoscaler-headroom',
          type: 'capacity',
          severity: 'warning',
          title: t ? t('llmdAIInsights.limitedHeadroom') : 'Limited Scaling Headroom',
          description: t ? t('llmdAIInsights.limitedHeadroomDesc', { current: currentReplicas, max: maxReplicas }) : `Autoscaler is at ${currentReplicas}/${maxReplicas} replicas. Limited capacity for traffic spikes.`,
          recommendation: t ? t('llmdAIInsights.limitedHeadroomRec') : 'Consider increasing maxReplicas to allow for traffic bursts, or optimize resource usage.',
          metrics: {
            'Current': currentReplicas,
            'Max': maxReplicas,
            'Headroom': `${headroomPercent.toFixed(0)}%`,
          },
          timestamp: now,
        })
      }
    }
  }

  // Check replica readiness
  if (stack.totalReplicas > 0 && stack.readyReplicas < stack.totalReplicas) {
    const readyPercent = (stack.readyReplicas / stack.totalReplicas) * 100
    insights.push({
      id: 'replica-not-ready',
      type: 'anomaly',
      severity: readyPercent < 50 ? 'critical' : 'warning',
      title: 'Replicas Not Ready',
      description: `Only ${stack.readyReplicas} of ${stack.totalReplicas} replicas are ready (${readyPercent.toFixed(0)}%).`,
      recommendation: 'Check pod status for pending or failing replicas. Look for resource constraints or image pull issues.',
      metrics: {
        'Ready': stack.readyReplicas,
        'Total': stack.totalReplicas,
        'Health': `${readyPercent.toFixed(0)}%`,
      },
      timestamp: now,
    })
  }

  // P/D disaggregation insights
  if (stack.hasDisaggregation) {
    const prefillCount = stack.components.prefill.reduce((sum, c) => sum + c.replicas, 0)
    const decodeCount = stack.components.decode.reduce((sum, c) => sum + c.replicas, 0)

    if (prefillCount > 0 && decodeCount > 0) {
      const ratio = prefillCount / decodeCount

      if (ratio > 3) {
        insights.push({
          id: 'pd-ratio-high',
          type: 'optimization',
          severity: 'info',
          title: 'High Prefill/Decode Ratio',
          description: `Prefill to decode ratio is ${ratio.toFixed(1)}:1. This may indicate decode bottleneck potential.`,
          recommendation: 'Consider adding more decode replicas if you observe high TPOT latency.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1`,
          },
          timestamp: now,
        })
      } else if (ratio < 0.5) {
        insights.push({
          id: 'pd-ratio-low',
          type: 'optimization',
          severity: 'info',
          title: 'Low Prefill/Decode Ratio',
          description: `Prefill to decode ratio is ${ratio.toFixed(1)}:1. Prefill phase may be a bottleneck.`,
          recommendation: 'Consider adding more prefill replicas if you observe high TTFT latency.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1`,
          },
          timestamp: now,
        })
      } else {
        insights.push({
          id: 'pd-balanced',
          type: 'performance',
          severity: 'info',
          title: 'Balanced P/D Configuration',
          description: `Disaggregated serving with balanced ${ratio.toFixed(1)}:1 prefill-to-decode ratio.`,
          recommendation: 'Configuration looks optimal. Monitor TTFT and TPOT metrics for fine-tuning.',
          metrics: {
            'Prefill': prefillCount,
            'Decode': decodeCount,
            'Ratio': `${ratio.toFixed(1)}:1`,
          },
          timestamp: now,
        })
      }
    }
  } else if (stack.components.both.length > 0) {
    // Unified serving - suggest disaggregation
    const totalReplicas = stack.components.both.reduce((sum, c) => sum + c.replicas, 0)
    if (totalReplicas >= 4) {
      insights.push({
        id: 'suggest-disaggregation',
        type: 'performance',
        severity: 'info',
        title: 'Disaggregation Opportunity',
        description: `Running ${totalReplicas} unified replicas. Prefill/Decode disaggregation could improve TTFT by 30-50%.`,
        recommendation: 'Consider enabling P/D disaggregation for large deployments to reduce time-to-first-token.',
        metrics: {
          'Current Mode': 'Unified',
          'Replicas': totalReplicas,
          'Potential TTFT': '-40%',
        },
        timestamp: now,
      })
    }
  }

  // If stack looks healthy with no issues, add a positive insight
  if (insights.length === 0 && stack.status === 'healthy') {
    insights.push({
      id: 'stack-healthy',
      type: 'performance',
      severity: 'info',
      title: 'Stack Operating Normally',
      description: `The ${stack.name} stack is healthy with all ${stack.readyReplicas} replicas ready.`,
      recommendation: 'Continue monitoring. Consider setting up alerts for latency thresholds.',
      metrics: {
        'Status': 'Healthy',
        'Replicas': `${stack.readyReplicas}/${stack.totalReplicas}`,
        'Model': stack.model || 'N/A',
      },
      timestamp: now,
    })
  }

  return insights
}

export function LLMdAIInsights() {
  const { t } = useTranslation(['cards', 'common'])
  const stackContext = useOptionalStack()
  const { shouldUseDemoData, showDemoBadge, reason } = useCardDemoState({ requires: 'stack' })

  // Report demo state to CardWrapper so it can show demo badge and yellow outline
  // Use showDemoBadge (true when global demo mode) rather than shouldUseDemoData (false when stack selected)
  useReportCardDataState({ isDemoData: showDemoBadge, isFailed: false, consecutiveFailures: 0, hasData: true })

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([])

  // Generate insights based on demo mode or real stack
  const insights = useMemo(() => {
    if (shouldUseDemoData) {
      return generateAIInsights()
    }

    if (stackContext?.selectedStack) {
      return generateStackInsights(stackContext.selectedStack, t as unknown as (key: string, options?: any) => string)
    }

    return []
  }, [shouldUseDemoData, stackContext?.selectedStack])

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    const userMessage = chatInput
    setChatHistory(prev => [...prev, { role: 'user', message: userMessage }])
    setChatInput('')

    // Generate contextual responses based on stack state
    await new Promise(resolve => setTimeout(resolve, 800))

    let response: string
    const stack = stackContext?.selectedStack
    const messageLower = userMessage.toLowerCase()

    if (shouldUseDemoData) {
      // Demo mode responses
      const responses: Record<string, string> = {
        'scale': 'Based on current load patterns, I recommend scaling up to 4 prefill replicas during peak hours (10am-2pm) and scaling down to 2 during off-peak.',
        'cache': 'KV cache utilization is averaging 72% with occasional spikes to 87%. Consider enabling prefix caching for repeated prompt patterns.',
        'performance': 'Current TTFT is 420ms. To optimize, consider enabling disaggregated serving - this could reduce TTFT to ~280ms.',
        'default': 'I can help analyze your LLM-d stack. Try asking about scaling recommendations, cache optimization, or performance tuning.',
      }
      const keyword = Object.keys(responses).find(k => messageLower.includes(k)) || 'default'
      response = responses[keyword]
    } else if (stack) {
      // Live mode responses based on actual stack
      if (messageLower.includes('scale') || messageLower.includes('replica')) {
        if (stack.autoscaler) {
          const curReplicas = stack.autoscaler.currentReplicas ?? 0
          const maxReplicas = stack.autoscaler.maxReplicas ?? 0
          response = `Your stack "${stack.name}" is using ${stack.autoscaler.type} autoscaling with ${curReplicas}/${maxReplicas} replicas. ${maxReplicas > 0 && curReplicas >= maxReplicas * 0.8 ? 'Consider increasing maxReplicas for more headroom.' : 'Current scaling configuration looks healthy.'}`
        } else {
          response = `Stack "${stack.name}" has ${stack.totalReplicas} manual replicas. Consider enabling Variant Autoscaling (WVA) for automatic scaling based on queue depth and KV cache pressure.`
        }
      } else if (messageLower.includes('disaggregat') || messageLower.includes('prefill') || messageLower.includes('decode')) {
        if (stack.hasDisaggregation) {
          const pCount = stack.components.prefill.reduce((s, c) => s + c.replicas, 0)
          const dCount = stack.components.decode.reduce((s, c) => s + c.replicas, 0)
          response = `Stack "${stack.name}" uses P/D disaggregation with ${pCount} prefill and ${dCount} decode replicas. This optimizes TTFT by separating compute-intensive prefill from memory-bound decode.`
        } else {
          response = `Stack "${stack.name}" uses unified serving (${stack.totalReplicas} replicas). Disaggregation could reduce TTFT by 30-50% for large models by separating prefill and decode phases.`
        }
      } else if (messageLower.includes('health') || messageLower.includes('status')) {
        response = `Stack "${stack.name}" is ${stack.status}. ${stack.readyReplicas}/${stack.totalReplicas} replicas ready. Model: ${stack.model || 'Unknown'}. ${stack.status !== 'healthy' ? 'Check pod logs for issues.' : 'All systems operational.'}`
      } else {
        response = `I can help with your "${stack.name}" stack (${stack.model || 'model'}). Ask about scaling, disaggregation, health status, or optimization opportunities.`
      }
    } else {
      response = 'No stack selected. Select a stack from the stack selector to get contextual insights.'
    }

    setChatHistory(prev => [...prev, { role: 'ai', message: response }])
  }

  const insightCounts = {
    total: insights.length,
    warning: insights.filter(i => i.severity === 'warning').length,
    critical: insights.filter(i => i.severity === 'critical').length,
  }

  const selectedStack = stackContext?.selectedStack

  return (
    <div className="p-4 h-full flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-purple-400" />
          <span className="font-medium text-white">{t('llmdAIInsights.aiInsights')}</span>
        </div>

        <div className="flex items-center gap-2">
          {selectedStack && !shouldUseDemoData && (
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded truncate max-w-[100px]" title={selectedStack.name}>
              {selectedStack.name}
            </span>
          )}
          {showDemoBadge && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded flex items-center gap-1">
              <Sparkles size={10} />
              {t('common:common.demo')}
            </span>
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
        {insights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
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
      <div className="border-t border-slate-700 pt-3">
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
            placeholder={t('llmdAIInsights.scalePlaceholder')}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
          >
            <Zap size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}

export default LLMdAIInsights
