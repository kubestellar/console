import { ReactNode, useState, useEffect, useCallback, useRef, createContext, useContext, ComponentType } from 'react'
import { createPortal } from 'react-dom'
import {
  Maximize2, MoreVertical, Clock, Settings, Replace, Trash2, MessageCircle, RefreshCw, MoveHorizontal, ChevronRight, ChevronDown,
  // Card icons
  AlertTriangle, Box, Activity, Database, Server, Cpu, Network, Shield, Package, GitBranch, FileCode, Gauge, AlertCircle, Layers, HardDrive, Globe, Users, Terminal, TrendingUp, Gamepad2, Puzzle, Target, Zap, Crown, Ghost, Bird, Rocket, Wand2,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'
import { useCardCollapse } from '../../lib/cards'
import { useSnoozedCards } from '../../hooks/useSnoozedCards'
import { useDemoMode } from '../../hooks/useDemoMode'
import { ChatMessage } from './CardChat'

// Minimum duration to show spin animation (ensures at least one full rotation)
const MIN_SPIN_DURATION = 500

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
  'mobile_browser', // Shows iPad view when expanded
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

// Stagger mount delays across cards to prevent rendering all at once
let mountIndex = 0
const MOUNT_DELAY_BASE = 16 // ~1 frame at 60fps
const MOUNT_DELAY_INCREMENT = 8 // stagger by half frame increments

/**
 * Hook for lazy mounting - only renders content when visible in viewport.
 * This prevents mounting 100+ cards at once when adding many cards.
 * Also staggers the rendering of visible cards to spread work across frames.
 */
function useLazyMount(rootMargin = '100px') {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Track which mount batch this card is in
  const mountOrderRef = useRef<number>(-1)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // If already visible, no need to observe
    if (isVisible) return

    // Assign mount order on first effect
    if (mountOrderRef.current === -1) {
      mountOrderRef.current = mountIndex++
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Stagger the visibility change to spread work across frames
          const delay = MOUNT_DELAY_BASE + (mountOrderRef.current % 20) * MOUNT_DELAY_INCREMENT
          setTimeout(() => {
            setIsVisible(true)
          }, delay)
          // Stop observing immediately - we don't unmount on scroll away
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [isVisible, rootMargin])

  return { ref, isVisible }
}

/** Flash type for significant data changes */
export type CardFlashType = 'none' | 'info' | 'warning' | 'error'

interface CardWrapperProps {
  cardId?: string
  cardType: string
  title?: string
  /** Icon to display next to the card title */
  icon?: ComponentType<{ className?: string }>
  /** Icon color class (e.g., 'text-purple-400') - defaults to title color */
  iconColor?: string
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
  /** Whether this card is showing live/real-time data (for time-series/trend cards) */
  isLive?: boolean
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
  resource_usage: 'Resource Allocation',

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

  // Prow CI/CD cards
  prow_jobs: 'Prow Jobs',
  prow_status: 'Prow Status',
  prow_history: 'Prow History',

  // ML/AI workload cards
  llm_inference: 'llm-d inference',
  llm_models: 'llm-d models',
  ml_jobs: 'ML Jobs',
  ml_notebooks: 'ML Notebooks',

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

// Card icons with their colors - displayed in the card header next to the title
const CARD_ICONS: Record<string, { icon: ComponentType<{ className?: string }>, color: string }> = {
  // Core cluster cards
  cluster_health: { icon: Activity, color: 'text-green-400' },
  cluster_focus: { icon: Server, color: 'text-purple-400' },
  cluster_network: { icon: Network, color: 'text-cyan-400' },
  cluster_comparison: { icon: Layers, color: 'text-blue-400' },
  cluster_costs: { icon: TrendingUp, color: 'text-emerald-400' },
  cluster_metrics: { icon: Activity, color: 'text-purple-400' },
  cluster_locations: { icon: Globe, color: 'text-blue-400' },

  // Workload and deployment cards
  app_status: { icon: Box, color: 'text-purple-400' },
  deployment_progress: { icon: Clock, color: 'text-blue-400' },
  deployment_status: { icon: Box, color: 'text-purple-400' },
  deployment_issues: { icon: AlertTriangle, color: 'text-orange-400' },

  // Pod and resource cards
  pod_issues: { icon: AlertTriangle, color: 'text-orange-400' },
  top_pods: { icon: Box, color: 'text-purple-400' },
  resource_capacity: { icon: Gauge, color: 'text-blue-400' },
  resource_usage: { icon: Gauge, color: 'text-purple-400' },
  pod_health_trend: { icon: Box, color: 'text-purple-400' },
  resource_trend: { icon: TrendingUp, color: 'text-blue-400' },

  // Events
  event_stream: { icon: Activity, color: 'text-blue-400' },
  events_timeline: { icon: Clock, color: 'text-purple-400' },

  // Namespace cards
  namespace_overview: { icon: Layers, color: 'text-purple-400' },
  namespace_analysis: { icon: Layers, color: 'text-purple-400' },
  namespace_rbac: { icon: Shield, color: 'text-yellow-400' },
  namespace_quotas: { icon: Gauge, color: 'text-yellow-400' },
  namespace_events: { icon: Activity, color: 'text-blue-400' },
  namespace_monitor: { icon: Activity, color: 'text-purple-400' },

  // Operator cards
  operator_status: { icon: Package, color: 'text-purple-400' },
  operator_subscriptions: { icon: Package, color: 'text-purple-400' },
  crd_health: { icon: Database, color: 'text-teal-400' },

  // Helm/GitOps cards
  gitops_drift: { icon: GitBranch, color: 'text-purple-400' },
  helm_release_status: { icon: Package, color: 'text-blue-400' },
  helm_releases: { icon: Package, color: 'text-blue-400' },
  helm_history: { icon: Clock, color: 'text-purple-400' },
  helm_values_diff: { icon: FileCode, color: 'text-yellow-400' },
  kustomization_status: { icon: Layers, color: 'text-purple-400' },
  overlay_comparison: { icon: Layers, color: 'text-blue-400' },
  chart_versions: { icon: Package, color: 'text-emerald-400' },

  // ArgoCD cards
  argocd_applications: { icon: GitBranch, color: 'text-orange-400' },
  argocd_sync_status: { icon: GitBranch, color: 'text-orange-400' },
  argocd_health: { icon: Activity, color: 'text-orange-400' },

  // GPU cards
  gpu_overview: { icon: Cpu, color: 'text-green-400' },
  gpu_status: { icon: Cpu, color: 'text-green-400' },
  gpu_inventory: { icon: Cpu, color: 'text-green-400' },
  gpu_workloads: { icon: Cpu, color: 'text-green-400' },
  gpu_usage_trend: { icon: Cpu, color: 'text-green-400' },
  gpu_utilization: { icon: Cpu, color: 'text-green-400' },

  // Security and RBAC
  security_issues: { icon: Shield, color: 'text-red-400' },
  rbac_overview: { icon: Shield, color: 'text-yellow-400' },
  policy_violations: { icon: AlertTriangle, color: 'text-red-400' },
  opa_policies: { icon: Shield, color: 'text-purple-400' },
  kyverno_policies: { icon: Shield, color: 'text-blue-400' },
  alert_rules: { icon: AlertCircle, color: 'text-orange-400' },
  active_alerts: { icon: AlertTriangle, color: 'text-red-400' },

  // Storage
  pvc_status: { icon: HardDrive, color: 'text-blue-400' },
  storage_overview: { icon: Database, color: 'text-purple-400' },

  // Network
  network_overview: { icon: Network, color: 'text-cyan-400' },
  service_status: { icon: Server, color: 'text-purple-400' },
  service_topology: { icon: Network, color: 'text-blue-400' },
  service_exports: { icon: Server, color: 'text-green-400' },
  service_imports: { icon: Server, color: 'text-blue-400' },
  gateway_status: { icon: Network, color: 'text-purple-400' },

  // Compute
  compute_overview: { icon: Cpu, color: 'text-purple-400' },

  // Other
  upgrade_status: { icon: TrendingUp, color: 'text-blue-400' },
  user_management: { icon: Users, color: 'text-purple-400' },
  github_activity: { icon: Activity, color: 'text-purple-400' },
  kubectl: { icon: Terminal, color: 'text-green-400' },
  weather: { icon: Globe, color: 'text-blue-400' },
  stock_market_ticker: { icon: TrendingUp, color: 'text-green-400' },

  // Klaude AI cards
  klaude_issues: { icon: Wand2, color: 'text-purple-400' },
  klaude_kubeconfig_audit: { icon: Wand2, color: 'text-purple-400' },
  klaude_health_check: { icon: Wand2, color: 'text-purple-400' },

  // Cost cards
  opencost_overview: { icon: TrendingUp, color: 'text-emerald-400' },
  kubecost_overview: { icon: TrendingUp, color: 'text-emerald-400' },

  // Compliance and security tools
  falco_alerts: { icon: AlertTriangle, color: 'text-red-400' },
  trivy_scan: { icon: Shield, color: 'text-blue-400' },
  kubescape_scan: { icon: Shield, color: 'text-purple-400' },
  compliance_score: { icon: Shield, color: 'text-green-400' },

  // Data compliance
  vault_secrets: { icon: Shield, color: 'text-yellow-400' },
  external_secrets: { icon: Shield, color: 'text-blue-400' },
  cert_manager: { icon: Shield, color: 'text-green-400' },

  // Prow CI cards
  prow_jobs: { icon: Activity, color: 'text-blue-400' },
  prow_status: { icon: Activity, color: 'text-green-400' },
  prow_history: { icon: Clock, color: 'text-purple-400' },

  // ML/AI workload cards
  llm_inference: { icon: Cpu, color: 'text-purple-400' },
  llm_models: { icon: Database, color: 'text-blue-400' },
  ml_jobs: { icon: Activity, color: 'text-orange-400' },
  ml_notebooks: { icon: FileCode, color: 'text-purple-400' },

  // Workload deployment
  workload_deployment: { icon: Box, color: 'text-blue-400' },

  // Games
  sudoku_game: { icon: Puzzle, color: 'text-purple-400' },
  match_game: { icon: Puzzle, color: 'text-purple-400' },
  solitaire: { icon: Gamepad2, color: 'text-red-400' },
  checkers: { icon: Crown, color: 'text-amber-400' },
  game_2048: { icon: Gamepad2, color: 'text-orange-400' },
  kubedle: { icon: Target, color: 'text-green-400' },
  pod_sweeper: { icon: Zap, color: 'text-red-400' },
  container_tetris: { icon: Gamepad2, color: 'text-cyan-400' },
  flappy_pod: { icon: Bird, color: 'text-yellow-400' },
  kube_man: { icon: Ghost, color: 'text-yellow-400' },
  kube_kong: { icon: Gamepad2, color: 'text-red-400' },
  pod_pitfall: { icon: Rocket, color: 'text-green-400' },
  node_invaders: { icon: Rocket, color: 'text-purple-400' },
  pod_brothers: { icon: Gamepad2, color: 'text-red-400' },
  kube_kart: { icon: Gamepad2, color: 'text-green-400' },
  kube_pong: { icon: Gamepad2, color: 'text-cyan-400' },
  kube_snake: { icon: Gamepad2, color: 'text-green-400' },
  kube_galaga: { icon: Rocket, color: 'text-blue-400' },
  kube_craft: { icon: Puzzle, color: 'text-brown-400' },
  kube_chess: { icon: Crown, color: 'text-amber-400' },
  kube_craft_3d: { icon: Puzzle, color: 'text-green-400' },

  // Utilities
  iframe_embed: { icon: Globe, color: 'text-blue-400' },
  network_utils: { icon: Network, color: 'text-cyan-400' },
  mobile_browser: { icon: Globe, color: 'text-purple-400' },
}

export function CardWrapper({
  cardId,
  cardType,
  title: customTitle,
  icon: Icon,
  iconColor,
  lastSummary,
  pendingSwap,
  chatMessages: externalMessages,
  dragHandle,
  isRefreshing,
  lastUpdated,
  isDemoData,
  isLive,
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
  // Lazy mounting - only render children when card is visible in viewport
  const { ref: lazyRef, isVisible } = useLazyMount('200px')
  // Track animation key to re-trigger flash animation
  const [flashKey, setFlashKey] = useState(0)
  const prevFlashType = useRef(flashType)

  // Track visual spinning state separately to ensure minimum spin duration
  const [isVisuallySpinning, setIsVisuallySpinning] = useState(false)
  const spinStartRef = useRef<number | null>(null)

  // Handle minimum spin duration for refresh button
  useEffect(() => {
    if (isRefreshing) {
      setIsVisuallySpinning(true)
      spinStartRef.current = Date.now()
    } else if (spinStartRef.current !== null) {
      const elapsed = Date.now() - spinStartRef.current
      const remaining = Math.max(0, MIN_SPIN_DURATION - elapsed)

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setIsVisuallySpinning(false)
          spinStartRef.current = null
        }, remaining)
        return () => clearTimeout(timeout)
      } else {
        setIsVisuallySpinning(false)
        spinStartRef.current = null
      }
    }
  }, [isRefreshing])

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

  // Get icon from prop or registry
  const cardIconConfig = CARD_ICONS[cardType]
  const ResolvedIcon = Icon || cardIconConfig?.icon
  const resolvedIconColor = iconColor || cardIconConfig?.color || 'text-foreground'

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
          ref={lazyRef}
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
            {ResolvedIcon && <ResolvedIcon className={cn('w-4 h-4', resolvedIconColor)} />}
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
            {/* Live data indicator - for time-series/trend cards with real data */}
            {isLive && !isDemoMode && !isDemoData && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400"
                title="Showing live data"
              >
                Live
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
            {isVisuallySpinning && !isFailed && (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            )}
            {/* Last updated indicator */}
            {!isVisuallySpinning && !isFailed && lastUpdated && (
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
                disabled={isRefreshing || isVisuallySpinning}
                className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isVisuallySpinning
                    ? 'text-blue-400 cursor-not-allowed'
                    : isFailed
                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                    : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
                title={isFailed ? `Refresh failed ${consecutiveFailures} times - click to retry` : 'Refresh data'}
              >
                <RefreshCw className={cn('w-4 h-4', isVisuallySpinning && 'animate-spin')} />
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

        {/* Content - hidden when collapsed, lazy loaded when visible or expanded */}
        {!isCollapsed && (
          <div className="flex-1 p-4 overflow-auto min-h-0 flex flex-col">
            {(isVisible || isExpanded) ? children : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="animate-pulse flex flex-col items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-secondary/50" />
                  <div className="w-24 h-2 rounded bg-secondary/50" />
                </div>
              </div>
            )}
          </div>
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
