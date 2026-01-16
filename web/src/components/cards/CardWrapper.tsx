import { ReactNode, useState, useEffect, useCallback } from 'react'
import { Maximize2, MoreVertical, Clock, X, Settings, Replace, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { ChatMessage } from './CardChat'

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  lastSummary?: string
  pendingSwap?: PendingSwap
  chatMessages?: ChatMessage[]
  dragHandle?: ReactNode
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onConfigure?: () => void
  onReplace?: () => void
  onRemove?: () => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  children: ReactNode
}

const CARD_TITLES: Record<string, string> = {
  cluster_health: 'Cluster Health',
  app_status: 'App Status',
  event_stream: 'Event Stream',
  pod_issues: 'Pod Issues',
  deployment_progress: 'Deployment Progress',
  deployment_status: 'Deployment Status',
  top_pods: 'Top Pods',
  resource_capacity: 'Resource Capacity',
  resource_usage: 'Resource Usage',
  cluster_metrics: 'Cluster Metrics',
  gitops_drift: 'GitOps Drift',
  security_issues: 'Security Issues',
  rbac_overview: 'RBAC Overview',
  policy_violations: 'Policy Violations',
  upgrade_status: 'Upgrade Status',
  namespace_analysis: 'Namespace Analysis',
}

export function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  onSwap,
  onSwapCancel,
  onConfigure,
  onReplace,
  onRemove,
  onChatMessage,
  onChatMessagesChange,
  children,
}: CardWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [_timeRemaining, setTimeRemaining] = useState<number | null>(null)
  // Chat state reserved for future use
  // const [isChatOpen, setIsChatOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const { snoozeSwap } = useSnoozedCards()

  // Use external messages if provided, otherwise use local state
  const messages = externalMessages ?? localMessages

  const title = customTitle || CARD_TITLES[cardType] || cardType
  const newTitle = pendingSwap?.newTitle || CARD_TITLES[pendingSwap?.newType || ''] || pendingSwap?.newType

  // Countdown timer for pending swap
  useEffect(() => {
    if (!pendingSwap) {
      setTimeRemaining(null)
      return
    }

    const updateTime = () => {
      const now = Date.now()
      const swapTime = pendingSwap.swapAt.getTime()
      const remaining = Math.max(0, Math.floor((swapTime - now) / 1000))
      setTimeRemaining(remaining)

      if (remaining === 0 && onSwap) {
        onSwap(pendingSwap.newType)
      }
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [pendingSwap, onSwap])

  const handleSnooze = useCallback((durationMs: number = 3600000) => {
    if (!pendingSwap || !cardId) return

    snoozeSwap({
      originalCardId: cardId,
      originalCardType: cardType,
      originalCardTitle: title,
      newCardType: pendingSwap.newType,
      newCardTitle: newTitle || pendingSwap.newType,
      reason: pendingSwap.reason,
    }, durationMs)

    onSwapCancel?.()
  }, [pendingSwap, cardId, cardType, title, newTitle, snoozeSwap, onSwapCancel])

  const handleSwapNow = useCallback(() => {
    if (pendingSwap && onSwap) {
      onSwap(pendingSwap.newType)
    }
  }, [pendingSwap, onSwap])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void title
  void setLocalMessages

  return (
    <>
      {/* Main card */}
      <div
        className={cn(
          'glass rounded-xl h-full overflow-hidden card-hover',
          'flex flex-col'
        )}
        onMouseEnter={() => setShowSummary(true)}
        onMouseLeave={() => setShowSummary(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h3 className="text-sm font-medium text-white">{title}</h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-white transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-white transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 glass rounded-lg py-1 z-10">
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onConfigure?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-white hover:bg-secondary/50 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Configure
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onReplace?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-white hover:bg-secondary/50 flex items-center gap-2"
                  >
                    <Replace className="w-4 h-4" />
                    Replace Card
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onRemove?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">{children}</div>

        {/* Pending swap notification */}
        {pendingSwap && (
          <div className="px-4 py-3 bg-purple-500/10 border-t border-purple-500/20">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-purple-400 animate-pulse" />
              <span className="text-purple-300">
                Swapping to "{newTitle}" in 30s
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pendingSwap.reason}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleSnooze(3600000)}
                className="text-xs px-2 py-1 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-white"
              >
                Snooze 1hr
              </button>
              <button
                onClick={handleSwapNow}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
              >
                Swap Now
              </button>
              <button
                onClick={() => onSwapCancel?.()}
                className="text-xs px-2 py-1 rounded hover:bg-secondary/50 text-muted-foreground"
              >
                Keep This
              </button>
            </div>
          </div>
        )}

        {/* Hover summary */}
        {showSummary && lastSummary && (
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-4 p-3 glass rounded-lg text-sm animate-fade-in-up">
            <p className="text-xs text-muted-foreground mb-1">Since last focus:</p>
            <p className="text-white">{lastSummary}</p>
          </div>
        )}
      </div>

      {/* Expanded modal */}
      {isExpanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80">
          <div className="w-full max-w-4xl max-h-[80vh] glass rounded-2xl overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="text-lg font-medium text-white">{title}</h3>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(80vh-80px)]">{children}</div>
          </div>
        </div>
      )}
    </>
  )
}
