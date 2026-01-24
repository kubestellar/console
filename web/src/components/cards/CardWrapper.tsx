import { ReactNode, useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, MoreVertical, Clock, Settings, Replace, Trash2, MessageCircle, RefreshCw, MoveHorizontal, ChevronRight, ChevronDown } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { useCardCollapse } from '../../lib/cards'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { ChatMessage } from './CardChat'

// Format relative time (e.g., "2m ago", "1h ago")
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

interface PendingSwap {
  newType: string
  newTitle?: string
  reason: string
  swapAt: Date
}

// Card width options (in grid columns out of 12)
const WIDTH_OPTIONS = [
  { value: 3, label: 'Small', description: '1/4 width' },
  { value: 4, label: 'Medium', description: '1/3 width' },
  { value: 6, label: 'Large', description: '1/2 width' },
  { value: 8, label: 'Wide', description: '2/3 width' },
  { value: 12, label: 'Full', description: 'Full width' },
]

// Cards that need extra-large expanded modal (for maps, complex visualizations, etc.)
// These use 95vh height and 7xl width instead of the default 80vh/4xl
const LARGE_EXPANDED_CARDS = new Set([
  'cluster_comparison',
  'cluster_resource_tree',
  'match_game',
])

// Cards that should be nearly fullscreen when expanded (maps, large visualizations, games)
const FULLSCREEN_EXPANDED_CARDS = new Set([
  'cluster_locations',
  'sudoku_game', // Games need fullscreen for the grid to fill properly
])

// Context to expose card expanded state to children
interface CardExpandedContextType {
  isExpanded: boolean
}
const CardExpandedContext = createContext<CardExpandedContextType>({ isExpanded: false })

/** Hook for child components to know if their parent card is expanded */
export function useCardExpanded() {
  return useContext(CardExpandedContext)
}

/** Flash type for significant data changes */
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  lastSummary?: string
  pendingSwap?: PendingSwap
  chatMessages?: ChatMessage[]
  dragHandle?: ReactNode
  /** Whether the card is currently refreshing data */
  isRefreshing?: boolean
  /** Last time the card data was updated */
  lastUpdated?: Date | null
  /** Whether this card uses demo/mock data instead of real data */
  isDemoData?: boolean
  /** Whether data refresh has failed 3+ times consecutively */
  isFailed?: boolean
  /** Number of consecutive refresh failures */
  consecutiveFailures?: number
  /** Current card width in grid columns (1-12) */
  cardWidth?: number
  /** Whether the card is collapsed (showing only header) */
  isCollapsed?: boolean
  /** Flash animation type when significant data changes occur */
  flashType?: CardFlashType
  /** Callback when collapsed state changes */
  onCollapsedChange?: (collapsed: boolean) => void
  onSwap?: (newType: string) => void
  onSwapCancel?: () => void
  onConfigure?: () => void
  onReplace?: () => void
  onRemove?: () => void
  onRefresh?: () => void
  /** Callback when card width is changed */
  onWidthChange?: (newWidth: number) => void
  onChatMessage?: (message: string) => Promise<ChatMessage>
  onChatMessagesChange?: (messages: ChatMessage[]) => void
  children: ReactNode
}

const CARD_TITLES: Record<string, string> = {
  // Core cluster cards
  cluster_health: 'Cluster Health',
  cluster_focus: 'Cluster Focus',
  cluster_network: 'Cluster Network',
  cluster_comparison: 'Cluster Comparison',
  cluster_costs: 'Cluster Costs',
  cluster_metrics: 'Cluster Metrics',

  // Workload and deployment cards
  app_status: 'Workload Status',
  deployment_progress: 'Deployment Progress',
  deployment_status: 'Deployment Status',
  deployment_issues: 'Deployment Issues',

  // Pod and resource cards
  pod_issues: 'Pod Issues',
  top_pods: 'Top Pods',
  resource_capacity: 'Resource Capacity',
  resource_usage: 'Resource Usage',

  // Events
  event_stream: 'Event Stream',

  // Namespace cards
  namespace_overview: 'Namespace Overview',
  namespace_analysis: 'Namespace Analysis',
  namespace_rbac: 'Namespace RBAC',
  namespace_quotas: 'Namespace Quotas',
  namespace_events: 'Namespace Events',
  namespace_monitor: 'Namespace Monitor',

  // Operator cards
  operator_status: 'Operator Status',
  operator_subscriptions: 'Operator Subscriptions',
  crd_health: 'CRD Health',

  // Helm/GitOps cards
  gitops_drift: 'GitOps Drift',
  helm_release_status: 'Helm Release Status',
  helm_releases: 'Helm Releases',
  helm_history: 'Helm History',
  helm_values_diff: 'Helm Values Diff',
  kustomization_status: 'Kustomization Status',
  overlay_comparison: 'Overlay Comparison',
  chart_versions: 'Helm Chart Versions',

  // ArgoCD cards
  argocd_applications: 'ArgoCD Applications',
  argocd_sync_status: 'ArgoCD Sync Status',
  argocd_health: 'ArgoCD Health',

  // GPU cards
  gpu_overview: 'GPU Overview',
  gpu_status: 'GPU Status',
  gpu_inventory: 'GPU Inventory',

  // Security and RBAC
  security_issues: 'Security Issues',
  rbac_overview: 'RBAC Overview',
  policy_violations: 'Policy Violations',

  // Other
  upgrade_status: 'Cluster Upgrade Status',
  user_management: 'User Management',
  github_activity: 'GitHub Activity',
  kubectl: 'Kubectl Terminal',

  // Klaude AI cards (consistent naming with Klaude prefix)
  klaude_issues: 'Klaude Issues',
  klaude_kubeconfig_audit: 'Klaude Kubeconfig Audit',
  klaude_health_check: 'Klaude Health Check',
  
  // Stock Market Ticker
  stock_market_ticker: 'Stock Market Ticker',

  // Games
  sudoku_game: 'Sudoku Game',
  match_game: 'Kube Match',
  solitaire: 'Kube Solitaire',
  checkers: 'AI Checkers',
  game_2048: 'Kube 2048',
  kubedle: 'Kubedle',
  pod_sweeper: 'Pod Sweeper',
  container_tetris: 'Container Tetris',
  flappy_pod: 'Flappy Pod',
  kube_man: 'Kube-Man',
  kube_kong: 'Kube Kong',
  pod_pitfall: 'Pod Pitfall',
  node_invaders: 'Node Invaders',
}

export function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  isRefreshing,
  lastUpdated,
  isDemoData,
  isFailed,
  consecutiveFailures,
  cardWidth,
  isCollapsed: externalCollapsed,
  flashType = 'none',
  onCollapsedChange,
  onSwap,
  onSwapCancel,
  onConfigure,
  onReplace,
  onRemove,
  onRefresh,
  onWidthChange,
  onChatMessage,
  onChatMessagesChange,
  children,
}: CardWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  // Track animation key to re-trigger flash animation
  const [flashKey, setFlashKey] = useState(0)
  const prevFlashType = useRef(flashType)

  // Re-trigger animation when flashType changes to a non-none value
  useEffect(() => {
    if (flashType !== 'none' && flashType !== prevFlashType.current) {
      setFlashKey(k => k + 1)
    }
    prevFlashType.current = flashType
  }, [flashType])

  // Get flash animation class based on type
  const getFlashClass = () => {
    switch (flashType) {
      case 'info': return 'animate-card-flash'
      case 'warning': return 'animate-card-flash-warning'
      case 'error': return 'animate-card-flash-error'
      default: return ''
    }
  }

  // Use the shared collapse hook with localStorage persistence
  // cardId is required for persistence; fall back to cardType if not provided
  const collapseKey = cardId || `${cardType}-default`
  const { isCollapsed: hookCollapsed, setCollapsed: hookSetCollapsed } = useCardCollapse(collapseKey)

  // Allow external control to override hook state
  const isCollapsed = externalCollapsed ?? hookCollapsed
  const setCollapsed = useCallback((collapsed: boolean) => {
    if (onCollapsedChange) {
      onCollapsedChange(collapsed)
    }
    // Always update the hook state for persistence
    hookSetCollapsed(collapsed)
  }, [onCollapsedChange, hookSetCollapsed])

  const [showSummary, setShowSummary] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showResizeMenu, setShowResizeMenu] = useState(false)
  const [resizeMenuOnLeft, setResizeMenuOnLeft] = useState(false)
  const [_timeRemaining, setTimeRemaining] = useState<number | null>(null)
  // Chat state reserved for future use
  // const [isChatOpen, setIsChatOpen] = useState(false)
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([])
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
  const { snoozeSwap } = useSnoozedCards()
  const { isDemoMode } = useDemoMode()
  const menuContainerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Use external messages if provided, otherwise use local state
  const messages = externalMessages ?? localMessages

  const title = CARD_TITLES[cardType] || customTitle || cardType
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

  // Close resize submenu when main menu closes
  useEffect(() => {
    if (!showMenu) {
      setShowResizeMenu(false)
      setMenuPosition(null)
    }
  }, [showMenu])

  // Calculate menu position when menu opens
  useEffect(() => {
    if (showMenu && menuButtonRef.current) {
      const rect = menuButtonRef.current.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [showMenu])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Check if click is outside the menu button and menu content
      if (!target.closest('[data-tour="card-menu"]') && !target.closest('.fixed.glass')) {
        setShowMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Calculate if resize submenu should be on the left side
  useEffect(() => {
    if (showResizeMenu && menuContainerRef.current) {
      const rect = menuContainerRef.current.getBoundingClientRect()
      const submenuWidth = 144 // w-36 = 9rem = 144px
      const margin = 20
      const shouldBeOnLeft = rect.right + submenuWidth + margin > window.innerWidth
      setResizeMenuOnLeft(shouldBeOnLeft)
    }
  }, [showResizeMenu])

  // Silence unused variable warnings for future chat implementation
  void messages
  void onChatMessage
  void onChatMessagesChange
  void title
  void setLocalMessages

  return (
    <CardExpandedContext.Provider value={{ isExpanded }}>
      <>
        {/* Main card */}
        <div
          key={flashKey}
          data-tour="card"
          className={cn(
            'glass rounded-xl overflow-hidden card-hover',
            'flex flex-col transition-all duration-200',
            isCollapsed ? 'h-auto' : 'h-full',
            (isDemoMode || isDemoData) && '!border-2 !border-yellow-500/50',
            getFlashClass()
          )}
          onMouseEnter={() => setShowSummary(true)}
          onMouseLeave={() => setShowSummary(false)}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {dragHandle}
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            {/* Demo data indicator - shows if global demo mode is on OR card uses demo data */}
            {(isDemoMode || isDemoData) && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400"
                title={isDemoMode ? "Demo mode enabled - showing sample data" : "This card displays demo data"}
              >
                Demo
              </span>
            )}
            {/* Failure indicator */}
            {isFailed && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1"
                title={`${consecutiveFailures} consecutive refresh failures`}
              >
                Refresh failed
              </span>
            )}
            {/* Refresh indicator */}
            {isRefreshing && !isFailed && (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            )}
            {/* Last updated indicator */}
            {!isRefreshing && !isFailed && lastUpdated && (
              <span className="text-[10px] text-muted-foreground" title={lastUpdated.toLocaleString()}>
                {formatTimeAgo(lastUpdated)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Collapse/expand button */}
            <button
              onClick={() => setCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title={isCollapsed ? 'Expand card' : 'Collapse card'}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {/* Manual refresh button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isRefreshing
                    ? 'text-blue-400 cursor-not-allowed'
                    : isFailed
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
                title={isFailed ? `Refresh failed ${consecutiveFailures} times - click to retry` : 'Refresh data'}
              >
                <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
              </button>
            )}
            <button
              data-tour="card-chat"
              onClick={() => console.log('Open chat for card:', cardType)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Ask AI about this card"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
              title="Expand card to full screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <div className="relative" data-tour="card-menu">
              <button
                ref={menuButtonRef}
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Card menu - configure, replace, or remove"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && menuPosition && createPortal(
                <div
                  className="fixed w-48 glass rounded-lg py-1 z-50 shadow-xl"
                  style={{ top: menuPosition.top, right: menuPosition.right }}
                >
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onConfigure?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                    title="Configure card settings like cluster and namespace filters"
                  >
                    <Settings className="w-4 h-4" />
                    Configure
                  </button>
                  {/* Resize submenu */}
                  {onWidthChange && (
                    <div className="relative" ref={menuContainerRef}>
                      <button
                        onClick={() => setShowResizeMenu(!showResizeMenu)}
                        className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center justify-between"
                        title="Change card width"
                      >
                        <span className="flex items-center gap-2">
                          <MoveHorizontal className="w-4 h-4" />
                          Resize
                        </span>
                        <ChevronRight className={cn('w-4 h-4 transition-transform', showResizeMenu && 'rotate-90')} />
                      </button>
                      {showResizeMenu && (
                        <div className={cn(
                          'absolute top-0 w-36 glass rounded-lg py-1 z-20',
                          resizeMenuOnLeft ? 'right-full mr-1' : 'left-full ml-1'
                        )}>
                          {WIDTH_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                onWidthChange(option.value)
                                setShowResizeMenu(false)
                                setShowMenu(false)
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm flex items-center justify-between',
                                cardWidth === option.value
                                  ? 'text-purple-400 bg-purple-500/10'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                              )}
                            >
                              <span>{option.label}</span>
                              <span className="text-xs opacity-60">{option.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      onReplace?.()
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 flex items-center gap-2"
                    title="Replace this card with a different card type"
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
                    title="Remove this card from the dashboard"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                </div>,
                document.body
              )}
            </div>
          </div>
        </div>

        {/* Content - hidden when collapsed */}
        {!isCollapsed && (
          <div className="flex-1 p-4 overflow-auto min-h-0 flex flex-col">{children}</div>
        )}

        {/* Pending swap notification - hidden when collapsed */}
        {!isCollapsed && pendingSwap && (
          <div className="px-4 py-3 bg-purple-500/10 border-t border-purple-500/20">
            <div className="flex items-center gap-2 text-sm">
              <span title="Card swap pending"><Clock className="w-4 h-4 text-purple-400 animate-pulse" /></span>
              <span className="text-purple-300">
                Swapping to "{newTitle}" in 30s
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pendingSwap.reason}</p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => handleSnooze(3600000)}
                className="text-xs px-2 py-1 rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                title="Delay this swap for 1 hour"
              >
                Snooze 1hr
              </button>
              <button
                onClick={handleSwapNow}
                className="text-xs px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300"
                title="Swap to the new card immediately"
              >
                Swap Now
              </button>
              <button
                onClick={() => onSwapCancel?.()}
                className="text-xs px-2 py-1 rounded hover:bg-secondary/50 text-muted-foreground"
                title="Cancel the swap and keep this card"
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
            <p className="text-foreground">{lastSummary}</p>
          </div>
        )}
      </div>

      {/* Expanded modal */}
      <BaseModal
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        size={FULLSCREEN_EXPANDED_CARDS.has(cardType) ? 'full' : LARGE_EXPANDED_CARDS.has(cardType) ? 'xl' : 'lg'}
      >
        <BaseModal.Header
          title={title}
          icon={Maximize2}
          onClose={() => setIsExpanded(false)}
          showBack={false}
        />
        <BaseModal.Content className={cn(
          'overflow-auto flex flex-col',
          FULLSCREEN_EXPANDED_CARDS.has(cardType)
            ? 'h-[calc(98vh-80px)]'
            : LARGE_EXPANDED_CARDS.has(cardType)
              ? 'h-[calc(95vh-80px)]'
              : 'max-h-[calc(80vh-80px)]'
        )}>
          {children}
        </BaseModal.Content>
      </BaseModal>
      </>
    </CardExpandedContext.Provider>
  )
}
