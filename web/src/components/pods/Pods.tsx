import { useEffect, useCallback, useMemo, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Plus, LayoutGrid, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { usePodIssues, useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { UnifiedStatsSection, PODS_STATS_CONFIG } from '../../lib/unified/stats'
import type { StatBlockValue } from '../ui/StatsOverview'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { useMobile } from '../../hooks/useMobile'

const PODS_CARDS_KEY = 'kubestellar-pods-cards'

// Default cards for the pods dashboard
const DEFAULT_POD_CARDS = [
  { type: 'pod_issues', title: 'Pod Issues', position: { w: 6, h: 2 } },
  { type: 'pod_health_trend', title: 'Pod Health Trend', position: { w: 6, h: 2 } },
  { type: 'top_pods', title: 'Top Pods', position: { w: 6, h: 2 } },
  { type: 'app_status', title: 'Workload Status', position: { w: 6, h: 2 } },
]

// Sortable card component with drag handle
interface SortablePodCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortablePodCard = memo(function SortablePodCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortablePodCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })
  const { isMobile } = useMobile()

  const cardWidth = card.position?.w || 4
  const cardHeight = card.position?.h || 3
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: isMobile ? 'span 1' : `span ${cardWidth}`,
    gridRow: `span ${cardHeight}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
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
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
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
function PodDragPreviewCard({ card }: { card: DashboardCard }) {
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

export function Pods() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const handleRefreshAll = useCallback(() => { refetchPodIssues(); refetchClusters() }, [refetchPodIssues, refetchClusters])
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshAll)
  const { drillToPod, drillToAllPods, drillToAllClusters } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: PODS_CARDS_KEY,
    defaultCards: DEFAULT_POD_CARDS,
    onRefresh: () => {
      refetchPodIssues()
      refetchClusters()
    },
  })

  // Combined loading/refreshing states
  const isLoading = podIssuesLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const showSkeletons = podIssues.length === 0 && isLoading

  // Handle addCard URL param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId, cards)
  }, [openConfigureCard, cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Filter pod issues by global cluster selection
  const filteredPodIssues = useMemo(() => {
    let filtered = podIssues

    if (!isAllClustersSelected) {
      filtered = filtered.filter(issue =>
        issue.cluster && globalSelectedClusters.includes(issue.cluster)
      )
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filtered = filtered.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query)) ||
        (issue.reason && issue.reason.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [podIssues, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Calculate stats
  const stats = useMemo(() => {
    const totalPods = clusters.reduce((sum, c) => sum + (c.podCount || 0), 0)
    const issueCount = filteredPodIssues.length
    const pendingCount = filteredPodIssues.filter(p => p.reason === 'Pending' || p.status === 'Pending').length
    const restartCount = filteredPodIssues.filter(p => (p.restarts || 0) > 5).length
    const clusterCount = isAllClustersSelected ? clusters.length : globalSelectedClusters.length

    return {
      totalPods,
      healthy: Math.max(0, totalPods - issueCount),
      issues: issueCount,
      pending: pendingCount,
      restarts: restartCount,
      clusters: clusterCount,
    }
  }, [clusters, filteredPodIssues, isAllClustersSelected, globalSelectedClusters])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'total_pods':
        return { value: stats.totalPods, sublabel: 'total pods', onClick: () => drillToAllPods(), isClickable: stats.totalPods > 0 }
      case 'healthy':
        return { value: stats.healthy, sublabel: 'healthy pods', onClick: () => drillToAllPods('healthy'), isClickable: stats.healthy > 0 }
      case 'issues':
        return { value: stats.issues, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: stats.issues > 0 }
      case 'pending':
        return { value: stats.pending, sublabel: 'pending pods', onClick: () => drillToAllPods('pending'), isClickable: stats.pending > 0 }
      case 'restarts':
        return { value: stats.restarts, sublabel: 'high restart pods', onClick: () => drillToAllPods('restarts'), isClickable: stats.restarts > 0 }
      case 'clusters':
        return { value: stats.clusters, sublabel: 'clusters', onClick: () => drillToAllClusters(), isClickable: stats.clusters > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, drillToAllPods, drillToAllClusters])

  // Merged getter: dashboard-specific values first, then universal fallback
  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue)(blockId),
    [getDashboardStatValue, getUniversalStatValue]
  )

  // Transform card for ConfigureCardModal
  const configureCardData = configuringCard ? {
    id: configuringCard.id,
    card_type: configuringCard.card_type,
    config: configuringCard.config,
    title: configuringCard.title,
  } : null

  return (
    <div className="">
      {/* Header */}
      <DashboardHeader
        title="Pods"
        subtitle="Monitor pod health and issues across clusters"
        icon={<Box className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="pods-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Stats Overview */}
      <UnifiedStatsSection
        config={PODS_STATS_CONFIG}
        getStatValue={getStatValue}
        hasData={!showSkeletons}
        isLoading={showSkeletons}
        lastUpdated={lastUpdated}
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Pod Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Box className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Pods Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor pod health, issues, and resource usage across your clusters.
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
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortablePodCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
                        isRefreshing={isRefreshing}
                        onRefresh={triggerRefresh}
                        lastUpdated={lastUpdated}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <PodDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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
        onResetToDefaults={reset}
        isCustomized={isCustomized}
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
        card={configureCardData}
        onClose={() => setConfiguringCard(null)}
        onSave={handleSaveCardConfig}
      />

      {/* Pod Issues List */}
      {showSkeletons ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass p-4 rounded-lg border-l-4 border-l-gray-500/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Skeleton variant="circular" width={24} height={24} />
                  <div>
                    <Skeleton variant="text" width={150} height={20} className="mb-1" />
                    <Skeleton variant="rounded" width={80} height={18} />
                  </div>
                </div>
                <Skeleton variant="text" width={100} height={20} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPodIssues.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🎉</div>
          <p className="text-lg text-foreground">No Pod Issues</p>
          <p className="text-sm text-muted-foreground">All pods are running healthy across your clusters</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground mb-4">Pod Issues ({filteredPodIssues.length})</h2>
          {filteredPodIssues.map((issue, i) => (
            <div
              key={i}
              onClick={() => drillToPod(issue.cluster || '', issue.namespace, issue.name)}
              className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${
                issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? 'border-l-red-500' :
                issue.reason === 'Pending' || issue.reason === 'ContainerCreating' ? 'border-l-yellow-500' :
                'border-l-orange-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIndicator
                    status={issue.reason === 'CrashLoopBackOff' || issue.reason === 'OOMKilled' ? 'error' : 'warning'}
                    size="lg"
                  />
                  <div>
                    <h3 className="font-semibold text-foreground">{issue.name}</h3>
                    <div className="flex items-center gap-2">
                      <ClusterBadge cluster={issue.cluster?.split('/').pop() || 'unknown'} size="sm" />
                      <span className="text-xs text-muted-foreground">{issue.namespace}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm font-medium text-orange-400">{issue.reason || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{issue.status || 'Unknown status'}</div>
                  </div>
                  {(issue.restarts || 0) > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-400">{issue.restarts}</div>
                      <div className="text-xs text-muted-foreground">Restarts</div>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clusters Summary */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Clusters Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {clusters
            .filter(cluster => isAllClustersSelected || globalSelectedClusters.includes(cluster.name))
            .map((cluster) => (
            <div key={cluster.name} className="glass p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <StatusIndicator
                  status={cluster.reachable === false ? 'unreachable' : cluster.healthy ? 'healthy' : 'error'}
                  size="sm"
                />
                <span className="font-medium text-foreground text-sm truncate">
                  {cluster.context || cluster.name.split('/').pop()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
