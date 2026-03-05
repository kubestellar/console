/**
 * Smart Card Suggestions — shown after kc-agent connects.
 *
 * Analyzes connected cluster capabilities and suggests relevant cards
 * the user doesn't already have. One-click to add individual cards
 * or "Add all" for the full set.
 */

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, X, CheckCircle2 } from 'lucide-react'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useClusters } from '../../hooks/useMCP'
import {
  emitSmartSuggestionsShown,
  emitSmartSuggestionAccepted,
  emitSmartSuggestionsAddAll,
} from '../../lib/analytics'
import { safeGetItem, safeSetItem } from '../../lib/utils/localStorage'
import { STORAGE_KEY_SMART_SUGGESTIONS_DISMISSED } from '../../lib/constants/storage'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface SmartCardSuggestionsProps {
  existingCardTypes: string[]
  onAddCard: (cardType: string) => void
  onAddMultipleCards: (cardTypes: string[]) => void
}

/** Card suggestion with the reason it's recommended */
interface Suggestion {
  cardType: string
  reason: string
}

/** How long to show the "Added!" confirmation before hiding the suggestion */
const ADDED_FEEDBACK_MS = 1500

/**
 * Maps cluster capabilities to recommended card types.
 * Each entry: [cardType, reason, condition function].
 */
type SuggestionRule = [
  cardType: string,
  reason: string,
  condition: (ctx: ClusterContext) => boolean,
]

interface ClusterContext {
  hasGpu: boolean
  clusterCount: number
  hasMultipleClusters: boolean
  hasPrometheus: boolean
  hasArgo: boolean
  totalPods: number
  totalNodes: number
}

const SUGGESTION_RULES: SuggestionRule[] = [
  ['gpu_overview', 'GPU nodes detected in your clusters', (ctx) => ctx.hasGpu],
  ['gpu_namespace_allocations', 'Track GPU usage across namespaces', (ctx) => ctx.hasGpu],
  ['resource_usage', 'Monitor resource consumption across clusters', (ctx) => ctx.clusterCount > 0],
  ['pod_issues', 'Spot problematic pods early', (ctx) => ctx.totalPods > 0],
  ['deployment_status', 'Track deployment health', (ctx) => ctx.totalPods > 0],
  ['node_status', 'Monitor node health across clusters', (ctx) => ctx.totalNodes > 0],
  ['event_stream', 'Watch cluster events in real time', (ctx) => ctx.clusterCount > 0],
  ['security_issues', 'Security audit for your clusters', (ctx) => ctx.clusterCount > 0],
  ['cluster_metrics', 'Performance metrics over time', (ctx) => ctx.hasMultipleClusters],
]

/** Maximum number of suggestions to show at once */
const MAX_SUGGESTIONS = 4

export function SmartCardSuggestions({
  existingCardTypes,
  onAddCard,
  onAddMultipleCards,
}: SmartCardSuggestionsProps) {
  const { t } = useTranslation()
  const { status: agentStatus, health } = useLocalAgent()
  const { deduplicatedClusters: clusters } = useClusters()
  const [dismissed, setDismissed] = useState(() =>
    safeGetItem(STORAGE_KEY_SMART_SUGGESTIONS_DISMISSED) === 'true'
  )
  const [addedCards, setAddedCards] = useState<Set<string>>(new Set())
  const [hasEmittedShown, setHasEmittedShown] = useState(false)

  // Build cluster context from live data
  const clusterContext: ClusterContext = useMemo(() => {
    const clusterList = clusters || []
    // Detect GPU presence via namespace hints (gpu-operator, nvidia-gpu-operator)
    const hasGpu = clusterList.some(c =>
      (c.namespaces || []).some(ns =>
        ns.includes('gpu') || ns.includes('nvidia')
      )
    )
    return {
      hasGpu,
      clusterCount: clusterList.length,
      hasMultipleClusters: clusterList.length > 1,
      hasPrometheus: clusterList.some(c => (c.namespaces || []).some(ns => ns.includes('monitoring') || ns.includes('prometheus'))),
      hasArgo: clusterList.some(c => (c.namespaces || []).some(ns => ns.includes('argocd') || ns.includes('argo'))),
      totalPods: clusterList.reduce((sum, c) => sum + (c.podCount || 0), 0),
      totalNodes: clusterList.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
    }
  }, [clusters])

  // Generate suggestions based on cluster context, excluding existing cards
  const suggestions: Suggestion[] = useMemo(() => {
    const existing = new Set(existingCardTypes)
    return SUGGESTION_RULES
      .filter(([cardType, , condition]) => !existing.has(cardType) && condition(clusterContext))
      .map(([cardType, reason]) => ({ cardType, reason }))
      .slice(0, MAX_SUGGESTIONS)
  }, [existingCardTypes, clusterContext])

  // Emit analytics when suggestions are first shown
  useEffect(() => {
    if (suggestions.length > 0 && !hasEmittedShown && !dismissed) {
      emitSmartSuggestionsShown(suggestions.length)
      setHasEmittedShown(true)
    }
  }, [suggestions.length, hasEmittedShown, dismissed])

  // Don't show if agent not connected, or no suggestions, or dismissed
  if (agentStatus !== 'connected' || suggestions.length === 0 || dismissed) {
    return null
  }

  // Filter out already-added cards
  const visibleSuggestions = suggestions.filter(s => !addedCards.has(s.cardType))
  if (visibleSuggestions.length === 0) return null

  const handleAdd = (cardType: string) => {
    onAddCard(cardType)
    emitSmartSuggestionAccepted(cardType)
    setAddedCards(prev => new Set(prev).add(cardType))
    // Auto-hide after feedback
    setTimeout(() => {
      setAddedCards(prev => {
        const next = new Set(prev)
        next.delete(cardType)
        return next
      })
    }, ADDED_FEEDBACK_MS)
  }

  const handleAddAll = () => {
    const types = visibleSuggestions.map(s => s.cardType)
    onAddMultipleCards(types)
    emitSmartSuggestionsAddAll(types.length)
    handleDismiss()
  }

  const handleDismiss = () => {
    setDismissed(true)
    safeSetItem(STORAGE_KEY_SMART_SUGGESTIONS_DISMISSED, 'true')
  }

  return (
    <div className="mb-4 glass rounded-xl border border-purple-500/30 overflow-hidden animate-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">
            {t('dashboard.smartSuggestions.title', 'Recommended for your clusters')}
          </span>
          <span className="text-xs text-muted-foreground">
            {health?.clusters ?? 0} {t('dashboard.smartSuggestions.clustersConnected', 'clusters connected')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddAll}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors px-2 py-1 rounded hover:bg-purple-500/10"
          >
            {t('dashboard.smartSuggestions.addAll', 'Add all')}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title={t('common.dismiss', 'Dismiss')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Suggestion cards */}
      <div className="flex flex-wrap gap-2 p-3">
        {visibleSuggestions.map(({ cardType, reason }) => {
          const justAdded = addedCards.has(cardType)
          return (
            <button
              key={cardType}
              onClick={() => !justAdded && handleAdd(cardType)}
              disabled={justAdded}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
                ${justAdded
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-secondary/50 border border-border/50 hover:border-purple-500/40 hover:bg-purple-500/10 text-foreground'
                }
              `}
            >
              {justAdded ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 text-purple-400" />
              )}
              <span className="font-medium">{formatCardTitle(cardType)}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {reason}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
