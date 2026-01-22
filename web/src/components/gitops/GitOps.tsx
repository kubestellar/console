import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useShowCards } from '../../hooks/useShowCards'
import { StatusIndicator } from '../charts/StatusIndicator'
import { DonutChart, BarChart } from '../charts'
import { useToast } from '../ui/Toast'
import { ClusterBadge } from '../ui/ClusterBadge'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { RefreshCw, Box, Loader2, Package, Ship, Layers, Cog, ChevronDown, ExternalLink, GitBranch, Clock, ArrowRight, AlertTriangle, Plus, LayoutGrid, ChevronRight, Hourglass, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '../../lib/cn'
import { formatStat } from '../../lib/formatStats'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'

interface GitOpsCard {
  id: string
  card_type: string
  config: Record<string, unknown>
  title?: string
  position?: { w: number; h: number }
}

const GITOPS_CARDS_KEY = 'kubestellar-gitops-cards'

function loadGitOpsCards(): GitOpsCard[] {
  try {
    const stored = localStorage.getItem(GITOPS_CARDS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveGitOpsCards(cards: GitOpsCard[]) {
  localStorage.setItem(GITOPS_CARDS_KEY, JSON.stringify(cards))
}

// Sortable card component with drag handle
interface SortableGitOpsCardProps {
  card: GitOpsCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableGitOpsCard = memo(function SortableGitOpsCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableGitOpsCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 4
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cardWidth}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Unknown card type: ${card.card_type}`)
    return null
  }

  return (
    <div ref={setNodeRef} style={style}>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={formatCardTitle(card.card_type)}
        cardWidth={cardWidth}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-secondary cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview for overlay
function GitOpsDragPreviewCard({ card }: { card: GitOpsCard }) {
  const cardWidth = card.position?.w || 4
  return (
    <div
      className="glass rounded-lg p-4 shadow-xl"
      style={{ width: `${(cardWidth / 12) * 100}%`, minWidth: 200, maxWidth: 400 }}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {formatCardTitle(card.card_type)}
        </span>
      </div>
    </div>
  )
}

// Module-level cache for releases (persists across navigation)
let releasesCache: Release[] = []

// Module-level cache for stats (persists across navigation)
interface GitOpsStatsCache {
  total: number
  helm: number
  kustomize: number
  operators: number
  deployed: number
  failed: number
  pending: number
  other: number
}
let statsCache: GitOpsStatsCache | null = null

// Release types
type ReleaseType = 'helm' | 'kustomize' | 'operator'

interface HelmRelease {
  type: 'helm'
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
  cluster?: string
}

interface Kustomization {
  type: 'kustomize'
  name: string
  namespace: string
  path: string
  sourceRef: string
  status: string
  lastApplied: string
  cluster?: string
}

interface Operator {
  type: 'operator'
  name: string
  namespace: string
  version: string
  status: string
  channel: string
  source: string
  cluster?: string
}

type Release = HelmRelease | Kustomization | Operator

// Type icons and labels
const TYPE_CONFIG: Record<ReleaseType, { icon: typeof Ship; label: string; color: string; chartColor: string }> = {
  helm: { icon: Ship, label: 'Helm', color: 'text-blue-400 bg-blue-500/20', chartColor: '#3b82f6' },
  kustomize: { icon: Layers, label: 'Kustomize', color: 'text-purple-400 bg-purple-500/20', chartColor: '#9333ea' },
  operator: { icon: Cog, label: 'Operator', color: 'text-orange-400 bg-orange-500/20', chartColor: '#f97316' },
}

// View tabs
type ViewTab = 'overview' | 'releases' | 'timeline'

function getTimeAgo(timestamp: string | undefined): string {
  if (!timestamp) return 'Unknown'
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return `${diffDays}d ago`
  if (diffHours > 0) return `${diffHours}h ago`
  if (diffMins > 0) return `${diffMins}m ago`
  return 'Just now'
}

// Safe JSON parser that checks content-type first
async function safeJsonParse(response: Response): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      return { ok: false, error: `Expected JSON but got ${contentType || 'unknown content type'}` }
    }
    const data = await response.json()
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to parse JSON' }
  }
}

export function GitOps() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    filterByStatus: globalFilterByStatus,
    customFilter,
  } = useGlobalFilters()

  // Card state
  const [cards, setCards] = useState<GitOpsCard[]>(() => loadGitOpsCards())
  // Stats collapsed state is now managed by StatsOverview component
  const { showCards, setShowCards, expandCards } = useShowCards('kubestellar-gitops')
  const [showAddCard, setShowAddCard] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<GitOpsCard | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const [typeFilter, setTypeFilter] = useState<ReleaseType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      setCards((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  // Initialize from cache if available
  const [releases, setReleases] = useState<Release[]>(() => releasesCache)
  const [isLoading, setIsLoading] = useState(() => releasesCache.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const fetchVersionRef = useRef(0) // Track fetch version to prevent duplicate results

  // Update module-level cache when releases change
  useEffect(() => {
    if (releases.length > 0) {
      releasesCache = releases
    }
  }, [releases])

  // Fetch GitOps releases with gradual loading
  const fetchReleases = useCallback(async (isRefresh = false) => {
    // Increment version to invalidate any in-progress fetches
    const currentVersion = ++fetchVersionRef.current

    // If we have cached data, treat this as a refresh (don't clear releases)
    const hasCachedData = releasesCache.length > 0
    const effectiveRefresh = isRefresh || hasCachedData

    if (!effectiveRefresh) {
      setIsLoading(true)
      setReleases([])
    }
    setError(null)

    const token = localStorage.getItem('token')
    const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {}
    let hasReceivedData = false

    // For refresh, collect all releases and replace at once to avoid duplicates
    // For initial load, update progressively for better UX
    const collectedReleases: Release[] = []

    // Fetch each type and update state as data arrives (gradual loading)
    const fetchAndAddReleases = async (
      url: string,
      processData: (data: unknown) => Release[]
    ) => {
      try {
        const response = await fetch(url, { headers })
        // Check if this fetch is still valid
        if (fetchVersionRef.current !== currentVersion) return

        if (response.ok) {
          const result = await safeJsonParse(response)
          // Check again after parsing
          if (fetchVersionRef.current !== currentVersion) return

          if (result.ok && result.data) {
            const newReleases = processData(result.data)
            if (newReleases.length > 0) {
              if (effectiveRefresh) {
                // Collect releases for batch update on refresh
                collectedReleases.push(...newReleases)
              } else {
                // Progressive update on initial load
                setReleases(prev => [...prev, ...newReleases])
              }
              if (!hasReceivedData) {
                hasReceivedData = true
                if (!effectiveRefresh) {
                  setIsLoading(false)
                  setLastUpdated(new Date())
                }
              }
            }
          }
        }
      } catch {
        // Silently ignore individual fetch failures
      }
    }

    // Start all fetches in parallel - don't wait for slow endpoints
    // Each fetch will update state independently when it completes
    const helmPromise = fetchAndAddReleases('/api/gitops/helm-releases', (data) => {
      const d = data as { releases?: Omit<HelmRelease, 'type'>[] }
      return (d.releases || []).map((r) => ({ ...r, type: 'helm' as const }))
    })
    const kustomizePromise = fetchAndAddReleases('/api/gitops/kustomizations', (data) => {
      const d = data as { kustomizations?: Omit<Kustomization, 'type'>[] }
      return (d.kustomizations || []).map((k) => ({ ...k, type: 'kustomize' as const }))
    })
    // Operators endpoint can be slow - add timeout
    const operatorsPromise = Promise.race([
      fetchAndAddReleases('/api/gitops/operators', (data) => {
        const d = data as { operators?: Omit<Operator, 'type'>[] }
        return (d.operators || []).map((o) => ({ ...o, type: 'operator' as const }))
      }),
      new Promise<void>(resolve => setTimeout(resolve, 10000)) // 10s timeout
    ])

    // Wait for fast endpoints, don't block on operators
    await Promise.all([helmPromise, kustomizePromise])

    // For refresh, replace all releases at once after fast endpoints complete
    if (effectiveRefresh && fetchVersionRef.current === currentVersion) {
      // Wait a bit for operators to potentially complete
      await Promise.race([operatorsPromise, new Promise(resolve => setTimeout(resolve, 2000))])

      if (fetchVersionRef.current === currentVersion && collectedReleases.length > 0) {
        setReleases(collectedReleases)
        setLastUpdated(new Date())
      }
    } else if (!hasReceivedData && fetchVersionRef.current === currentVersion) {
      // If we still have no data after fast endpoints, mark loading complete
      setIsLoading(false)
      setLastUpdated(new Date())
    }

    // Let operators finish in background (already started, will update state when done)
    operatorsPromise.catch(() => {}) // Suppress unhandled rejection
  }, [])

  // Fetch releases on mount and when global cluster selection changes
  // Fetch releases only on mount - filtering is done client-side
  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      setIsRefreshing(true)
      fetchReleases(true).finally(() => setIsRefreshing(false))
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, fetchReleases])

  // Save cards to localStorage when they change
  useEffect(() => {
    saveGitOpsCards(cards)
  }, [cards])

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await fetchReleases(true)
    showToast('Refreshing GitOps releases...', 'info')
    setIsRefreshing(false)
    setLastUpdated(new Date())
  }, [fetchReleases, showToast])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd: GitOpsCard[] = newCards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.type,
      config: card.config,
      title: card.title,
    }))
    setCards(prev => [...prev, ...cardsToAdd])
    expandCards()
    setShowAddCard(false)
  }, [expandCards])

  const handleRemoveCard = useCallback((cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
  }, [])

  const handleConfigureCard = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId)
    if (card) setConfiguringCard(card)
  }, [cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    setConfiguringCard(null)
  }, [])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...(c.position || { w: 4, h: 2 }), w: newWidth } } : c
    ))
  }, [])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: GitOpsCard[] = template.cards.map(card => ({
      id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [expandCards])

  const filteredReleases = useMemo(() => {
    let result = releases

    // Apply global cluster filter (keep items without cluster specified - they're from current context)
    if (!isAllClustersSelected) {
      result = result.filter(release =>
        !release.cluster || globalSelectedClusters.includes(release.cluster)
      )
    }

    // Apply global status filter
    result = globalFilterByStatus(result)

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(release =>
        release.name.toLowerCase().includes(query) ||
        release.namespace.toLowerCase().includes(query) ||
        (release.cluster && release.cluster.toLowerCase().includes(query)) ||
        (release.type === 'helm' && (release as HelmRelease).chart.toLowerCase().includes(query))
      )
    }

    // Apply local type filter
    if (typeFilter !== 'all') {
      result = result.filter(release => release.type === typeFilter)
    }

    // Apply local status filter
    if (statusFilter === 'deployed') {
      result = result.filter(release => release.status === 'deployed' || release.status === 'Ready')
    } else if (statusFilter === 'failed') {
      result = result.filter(release => release.status === 'failed' || release.status === 'Failed')
    } else if (statusFilter === 'pending') {
      result = result.filter(release =>
        (release.status?.toLowerCase().includes('pending')) ||
        (release.status?.toLowerCase().includes('progressing'))
      )
    }

    return result
  }, [releases, typeFilter, statusFilter, globalSelectedClusters, isAllClustersSelected, globalFilterByStatus, customFilter])

  // Releases after global filter (before local type/status filter)
  const globalFilteredReleases = useMemo(() => {
    let result = releases

    // Apply global cluster filter (keep items without cluster specified - they're from current context)
    if (!isAllClustersSelected) {
      result = result.filter(release =>
        !release.cluster || globalSelectedClusters.includes(release.cluster)
      )
    }

    // Apply global status filter
    result = globalFilterByStatus(result)

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(release =>
        release.name.toLowerCase().includes(query) ||
        release.namespace.toLowerCase().includes(query) ||
        (release.cluster && release.cluster.toLowerCase().includes(query)) ||
        (release.type === 'helm' && (release as HelmRelease).chart.toLowerCase().includes(query))
      )
    }

    return result
  }, [releases, globalSelectedClusters, isAllClustersSelected, globalFilterByStatus, customFilter])

  const stats = useMemo(() => {
    const helmReleases = globalFilteredReleases.filter(r => r.type === 'helm')
    const kustomizations = globalFilteredReleases.filter(r => r.type === 'kustomize')
    const operators = globalFilteredReleases.filter(r => r.type === 'operator')

    const deployed = globalFilteredReleases.filter(r => r.status === 'deployed' || r.status === 'Ready' || r.status === 'Succeeded').length
    const failed = globalFilteredReleases.filter(r => r.status === 'failed' || r.status === 'Failed').length
    const pending = globalFilteredReleases.filter(r =>
      r.status?.toLowerCase().includes('pending') ||
      r.status?.toLowerCase().includes('progressing')
    ).length
    // Never show negative - clamp to 0
    const other = Math.max(0, globalFilteredReleases.length - deployed - failed - pending)

    const currentStats = {
      total: globalFilteredReleases.length,
      helm: helmReleases.length,
      kustomize: kustomizations.length,
      operators: operators.length,
      deployed,
      failed,
      pending,
      other,
    }

    // Update cache when we have real data
    if (currentStats.total > 0) {
      statsCache = currentStats
    }

    // Use cached values when current values are zero (e.g., during re-fetch)
    const displayStats = currentStats.total === 0 && statsCache
      ? statsCache
      : currentStats

    return {
      ...displayStats,
      // Chart data for status distribution (uses display stats)
      statusChartData: [
        { name: 'Deployed', value: displayStats.deployed, color: '#22c55e' },
        { name: 'Failed', value: displayStats.failed, color: '#ef4444' },
        { name: 'Pending', value: displayStats.pending, color: '#3b82f6' },
        { name: 'Other', value: displayStats.other, color: '#6b7280' },
      ].filter(d => d.value > 0),
      // Chart data for type distribution (uses display stats)
      typeChartData: [
        { name: 'Helm', value: displayStats.helm, color: TYPE_CONFIG.helm.chartColor },
        { name: 'Kustomize', value: displayStats.kustomize, color: TYPE_CONFIG.kustomize.chartColor },
        { name: 'Operators', value: displayStats.operators, color: TYPE_CONFIG.operator.chartColor },
      ].filter(d => d.value > 0),
    }
  }, [globalFilteredReleases])

  // Stats value getter for the configurable StatsOverview component
  const getStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total':
        return { value: stats.total, sublabel: 'releases', onClick: () => { setTypeFilter('all'); setActiveTab('releases') }, isClickable: stats.total > 0 }
      case 'helm':
        return { value: stats.helm, sublabel: 'helm charts', onClick: () => { setTypeFilter('helm'); setActiveTab('releases') }, isClickable: stats.helm > 0 }
      case 'kustomize':
        return { value: stats.kustomize, sublabel: 'kustomizations', onClick: () => { setTypeFilter('kustomize'); setActiveTab('releases') }, isClickable: stats.kustomize > 0 }
      case 'operators':
        return { value: stats.operators, sublabel: 'operators', onClick: () => { setTypeFilter('operator'); setActiveTab('releases') }, isClickable: stats.operators > 0 }
      case 'deployed':
        return { value: stats.deployed, sublabel: 'successful', onClick: () => { setStatusFilter('deployed'); setActiveTab('releases') }, isClickable: stats.deployed > 0 }
      case 'failed':
        return { value: stats.failed, sublabel: 'failed', onClick: () => { setStatusFilter('failed'); setActiveTab('releases') }, isClickable: stats.failed > 0 }
      case 'pending':
        return { value: stats.pending, sublabel: 'in progress', onClick: () => { setStatusFilter('pending'); setActiveTab('releases') }, isClickable: stats.pending > 0 }
      case 'other':
        return { value: stats.other, sublabel: 'other statuses', onClick: () => { setTypeFilter('all'); setActiveTab('releases') }, isClickable: stats.other > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, setTypeFilter, setStatusFilter, setActiveTab])

  // Get recent changes (sorted by timestamp)
  const recentChanges = useMemo(() => {
    return [...globalFilteredReleases]
      .filter(r => {
        if (r.type === 'helm') return (r as HelmRelease).updated
        if (r.type === 'kustomize') return (r as Kustomization).lastApplied
        return false
      })
      .sort((a, b) => {
        const aTime = a.type === 'helm'
          ? new Date((a as HelmRelease).updated).getTime()
          : new Date((a as Kustomization).lastApplied).getTime()
        const bTime = b.type === 'helm'
          ? new Date((b as HelmRelease).updated).getTime()
          : new Date((b as Kustomization).lastApplied).getTime()
        return bTime - aTime
      })
      .slice(0, 10)
  }, [globalFilteredReleases])

  const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase()
    if (['deployed', 'ready', 'succeeded', 'running'].includes(s)) return 'text-green-400 bg-green-500/20'
    if (['failed', 'error'].includes(s)) return 'text-red-400 bg-red-500/20'
    if (['pending', 'progressing', 'installing'].includes(s)) return 'text-blue-400 bg-blue-500/20'
    if (['superseded', 'unknown'].includes(s)) return 'text-muted-foreground bg-card/50'
    return 'text-muted-foreground bg-card'
  }

  const getHealthStatus = (status: string): 'healthy' | 'warning' | 'error' => {
    const s = (status || '').toLowerCase()
    if (['deployed', 'ready', 'succeeded', 'running'].includes(s)) return 'healthy'
    if (['failed', 'error'].includes(s)) return 'error'
    return 'warning'
  }

  const getBorderColor = (release: Release) => {
    const status = getHealthStatus(release.status)
    if (status === 'healthy') return 'border-l-green-500'
    if (status === 'error') return 'border-l-red-500'
    return 'border-l-blue-500'
  }

  const renderRelease = (release: Release, index: number) => {
    const TypeIcon = TYPE_CONFIG[release.type].icon
    const typeConfig = TYPE_CONFIG[release.type]

    return (
      <div
        key={`${release.type}-${release.namespace}-${release.name}-${index}`}
        className={cn(
          'glass p-4 rounded-lg border-l-4 cursor-pointer hover:bg-secondary/30 transition-colors',
          getBorderColor(release)
        )}
        onClick={() => {
          // Drill-down handler would go here
          console.log('Open drill-down for:', release)
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <StatusIndicator status={getHealthStatus(release.status)} size="lg" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{release.name}</span>
                <span className={cn('text-xs px-2 py-0.5 rounded flex items-center gap-1', typeConfig.color)}>
                  <TypeIcon className="w-3 h-3" />
                  {typeConfig.label}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded capitalize', getStatusColor(release.status))}>
                  {release.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1" title="Kubernetes Namespace">
                  <Box className="w-3 h-3" />
                  <span>{release.namespace}</span>
                </span>
                {release.type === 'helm' && (
                  <span className="flex items-center gap-1" title="Revision">
                    <span className="text-muted-foreground/50">rev</span>
                    <span>{(release as HelmRelease).revision}</span>
                  </span>
                )}
                {release.cluster && <ClusterBadge cluster={release.cluster} size="sm" />}
              </div>
              {release.type === 'helm' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Helm Chart">
                  <Package className="w-3 h-3 text-purple-400" />
                  <span className="font-mono">{(release as HelmRelease).chart}</span>
                  {(release as HelmRelease).app_version && (
                    <span className="text-muted-foreground/70">v{(release as HelmRelease).app_version}</span>
                  )}
                </div>
              )}
              {release.type === 'kustomize' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Path">
                  <Layers className="w-3 h-3 text-purple-400" />
                  <span className="font-mono">{(release as Kustomization).path}</span>
                </div>
              )}
              {release.type === 'operator' && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1" title="Operator">
                  <Cog className="w-3 h-3 text-orange-400" />
                  <span className="font-mono">{(release as Operator).source}</span>
                  <span className="text-muted-foreground/70">({(release as Operator).channel})</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground flex items-center gap-2">
            <span>
              {release.type === 'helm' && `Updated: ${getTimeAgo((release as HelmRelease).updated)}`}
              {release.type === 'kustomize' && `Applied: ${getTimeAgo((release as Kustomization).lastApplied)}`}
              {release.type === 'operator' && `v${(release as Operator).version}`}
            </span>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </div>
        </div>
      </div>
    )
  }

  // Transform card for ConfigureCardModal
  const configureCard = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <GitBranch className="w-6 h-6 text-purple-400" />
                GitOps Releases
              </h1>
              <p className="text-muted-foreground">Helm, Kustomize, and Operator deployments across your clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="gitops-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="gitops-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview - configurable */}
      <StatsOverview
        dashboardType="gitops"
        getStatValue={getStatValue}
        hasData={releases.length > 0}
        isLoading={isLoading && releases.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-gitops-stats-collapsed"
      />

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border pb-2">
        {(['overview', 'releases', 'timeline'] as ViewTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2 rounded-t-lg text-sm font-medium transition-colors capitalize',
              activeTab === tab
                ? 'bg-purple-500/20 text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            )}
          >
            {tab === 'overview' && <span className="flex items-center gap-2"><Package className="w-4 h-4" /> Overview</span>}
            {tab === 'releases' && <span className="flex items-center gap-2"><Box className="w-4 h-4" /> All Releases</span>}
            {tab === 'timeline' && <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> Timeline</span>}
          </button>
        ))}
      </div>

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle and buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>GitOps Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <GitBranch className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">GitOps Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor Helm releases, Kustomizations, and GitOps drift across your clusters.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cards
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableGitOpsCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <GitOpsDragPreviewCard card={cards.find(c => c.id === activeId)!} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={!!configuringCard}
        card={configureCard}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Status Distribution Chart */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-foreground mb-4">Status Distribution</h3>
            {stats.statusChartData.length > 0 ? (
              <DonutChart
                data={stats.statusChartData}
                size={160}
                thickness={25}
                centerValue={formatStat(stats.total)}
                centerLabel="Total"
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">No releases to display</div>
            )}
          </div>

          {/* Type Distribution Chart */}
          <div className="glass p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-foreground mb-4">Release Types</h3>
            {stats.typeChartData.length > 0 ? (
              <BarChart
                data={stats.typeChartData}
                height={160}
                horizontal
                showGrid={false}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">No releases to display</div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="glass p-4 rounded-lg lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
              <button
                onClick={() => setActiveTab('timeline')}
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                View all <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            {recentChanges.length > 0 ? (
              <div className="space-y-3">
                {recentChanges.slice(0, 5).map((release, index) => {
                  const TypeIcon = TYPE_CONFIG[release.type].icon
                  const time = release.type === 'helm'
                    ? (release as HelmRelease).updated
                    : (release as Kustomization).lastApplied
                  return (
                    <div key={`recent-${index}`} className="flex items-center gap-3 text-sm">
                      <StatusIndicator status={getHealthStatus(release.status)} size="sm" />
                      <TypeIcon className={cn('w-4 h-4', TYPE_CONFIG[release.type].color.split(' ')[0])} />
                      <span className="font-medium text-foreground">{release.name}</span>
                      <span className="text-muted-foreground">{release.namespace}</span>
                      {release.cluster && <ClusterBadge cluster={release.cluster} size="sm" />}
                      <span className="ml-auto text-muted-foreground">{getTimeAgo(time)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No recent activity</div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="glass p-4 rounded-lg lg:col-span-2">
            <h3 className="text-lg font-semibold text-foreground mb-4">Quick Filters</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setStatusFilter('failed'); setActiveTab('releases') }}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                View Failed Releases ({formatStat(stats.failed)})
              </button>
              <button
                onClick={() => { setStatusFilter('pending'); setActiveTab('releases') }}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm flex items-center gap-2"
              >
                <Clock className="w-4 h-4" />
                View Pending ({stats.pending})
              </button>
              <button
                onClick={() => { setTypeFilter('helm'); setActiveTab('releases') }}
                className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-sm flex items-center gap-2"
              >
                <Ship className="w-4 h-4" />
                Helm Charts Only
              </button>
              <button
                onClick={() => { setTypeFilter('kustomize'); setActiveTab('releases') }}
                className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 text-sm flex items-center gap-2"
              >
                <Layers className="w-4 h-4" />
                Kustomizations Only
              </button>
              <button
                onClick={() => { setTypeFilter('operator'); setActiveTab('releases') }}
                className="px-3 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-sm flex items-center gap-2"
              >
                <Cog className="w-4 h-4" />
                Operators Only
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Timeline Tab Content */}
      {activeTab === 'timeline' && (
        <div className="glass p-4 rounded-lg mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Deployment Timeline</h3>
          {recentChanges.length > 0 ? (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-6">
                {recentChanges.map((release, index) => {
                  const TypeIcon = TYPE_CONFIG[release.type].icon
                  const time = release.type === 'helm'
                    ? (release as HelmRelease).updated
                    : (release as Kustomization).lastApplied
                  const date = new Date(time)

                  return (
                    <div key={`timeline-${index}`} className="relative flex gap-4 pl-12">
                      {/* Timeline dot */}
                      <div className={cn(
                        'absolute left-4 w-4 h-4 rounded-full border-2 border-background',
                        getHealthStatus(release.status) === 'healthy' ? 'bg-green-500' :
                        getHealthStatus(release.status) === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      )} />

                      <div className="flex-1 glass p-4 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <TypeIcon className={cn('w-5 h-5', TYPE_CONFIG[release.type].color.split(' ')[0])} />
                            <span className="font-semibold text-foreground">{release.name}</span>
                            <span className={cn('text-xs px-2 py-0.5 rounded capitalize', getStatusColor(release.status))}>
                              {release.status}
                            </span>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {date.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Box className="w-3 h-3" />
                            {release.namespace}
                          </span>
                          {release.cluster && <ClusterBadge cluster={release.cluster} size="sm" />}
                          {release.type === 'helm' && (
                            <span className="font-mono text-xs">{(release as HelmRelease).chart}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No deployment history available</p>
            </div>
          )}
        </div>
      )}

      {/* Releases Tab Content */}
      {activeTab === 'releases' && (
        <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Type filter dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              typeFilter !== 'all'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            {typeFilter === 'all' ? (
              <>All Types</>
            ) : (
              <>
                {(() => { const T = TYPE_CONFIG[typeFilter].icon; return <T className="w-4 h-4" /> })()}
                {TYPE_CONFIG[typeFilter].label}
              </>
            )}
            <ChevronDown className="w-4 h-4" />
          </button>
          {showTypeDropdown && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-xl z-10 py-1">
              <button
                onClick={() => { setTypeFilter('all'); setShowTypeDropdown(false) }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm transition-colors',
                  typeFilter === 'all' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                )}
              >
                All Types
              </button>
              {(Object.keys(TYPE_CONFIG) as ReleaseType[]).map((type) => {
                const Icon = TYPE_CONFIG[type].icon
                return (
                  <button
                    key={type}
                    onClick={() => { setTypeFilter(type); setShowTypeDropdown(false) }}
                    className={cn(
                      'w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                      typeFilter === type ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {TYPE_CONFIG[type].label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('deployed')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'deployed'
                ? 'bg-green-500 text-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Deployed
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'failed'
                ? 'bg-red-500 text-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Failed
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              statusFilter === 'pending'
                ? 'bg-blue-500 text-foreground'
                : 'bg-card/50 text-muted-foreground hover:text-foreground'
            )}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-lg text-foreground">Loading GitOps releases...</p>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg text-foreground">No GitOps releases found</p>
          <p className="text-sm text-muted-foreground">
            {typeFilter !== 'all'
              ? `No ${TYPE_CONFIG[typeFilter].label} releases found. Try changing the filter.`
              : 'Install Helm charts, Kustomizations, or Operators to see them here'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReleases.map((release, i) => renderRelease(release, i))}
        </div>
      )}

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-card/30 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-3">GitOps Release Management</h3>
        <p className="text-sm text-muted-foreground mb-3">
          This page shows all GitOps-managed resources across your clusters:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <Ship className="w-4 h-4 text-blue-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Helm Releases</span>
              <p className="text-muted-foreground text-xs">Charts deployed via helm install/upgrade</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Layers className="w-4 h-4 text-purple-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Kustomizations</span>
              <p className="text-muted-foreground text-xs">Flux/ArgoCD managed overlays</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Cog className="w-4 h-4 text-orange-400 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Operators</span>
              <p className="text-muted-foreground text-xs">OLM-managed operator subscriptions</p>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
