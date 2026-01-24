import { useEffect, useCallback, useMemo, memo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, Plus, LayoutGrid, ChevronDown, ChevronRight, RefreshCw, Hourglass, GripVertical } from 'lucide-react'
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
import { useDeploymentIssues, usePodIssues, useClusters, useDeployments } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { StatusIndicator } from '../charts/StatusIndicator'
import { ClusterBadge } from '../ui/ClusterBadge'
import { Skeleton } from '../ui/Skeleton'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
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

const WORKLOADS_CARDS_KEY = 'kubestellar-workloads-cards'

// Default cards for the workloads dashboard
const DEFAULT_WORKLOAD_CARDS = [
  { type: 'app_status', title: 'Workload Status', position: { w: 4, h: 2 } },
  { type: 'deployment_status', title: 'Deployment Status', position: { w: 4, h: 2 } },
  { type: 'deployment_progress', title: 'Deployment Progress', position: { w: 4, h: 2 } },
  { type: 'pod_issues', title: 'Pod Issues', position: { w: 6, h: 2 } },
  { type: 'deployment_issues', title: 'Deployment Issues', position: { w: 6, h: 2 } },
]

// Sortable card component with drag handle
interface SortableWorkloadCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
}

const SortableWorkloadCard = memo(function SortableWorkloadCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
}: SortableWorkloadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const cardWidth = card.position?.w || 4
  const cardHeight = card.position?.h || 3
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${cardWidth}`,
    gridRow: `span ${cardHeight}`,
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
function WorkloadDragPreviewCard({ card }: { card: DashboardCard }) {
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

interface AppSummary {
  namespace: string
  cluster: string
  deploymentCount: number
  podIssues: number
  deploymentIssues: number
  status: 'healthy' | 'warning' | 'error'
}

export function Workloads() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { issues: podIssues, isLoading: podIssuesLoading, isRefreshing: podIssuesRefreshing, lastUpdated, refetch: refetchPodIssues } = usePodIssues()
  const { issues: deploymentIssues, isLoading: deploymentIssuesLoading, isRefreshing: deploymentIssuesRefreshing, refetch: refetchDeploymentIssues } = useDeploymentIssues()
  const { deployments: allDeployments, isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, refetch: refetchDeployments } = useDeployments()
  const { clusters, isLoading: clustersLoading, refetch: refetchClusters } = useClusters()
  const { drillToNamespace, drillToAllNamespaces, drillToAllDeployments, drillToAllPods } = useDrillDownActions()
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
    storageKey: WORKLOADS_CARDS_KEY,
    defaultCards: DEFAULT_WORKLOAD_CARDS,
    onRefresh: () => {
      refetchPodIssues()
      refetchDeploymentIssues()
      refetchDeployments()
      refetchClusters()
    },
  })

  // Combined loading/refreshing states
  const isLoading = podIssuesLoading || deploymentIssuesLoading || deploymentsLoading || clustersLoading
  const isRefreshing = podIssuesRefreshing || deploymentIssuesRefreshing || deploymentsRefreshing
  const isFetching = isLoading || isRefreshing
  // Only show skeletons when we have no data yet
  const showSkeletons = (allDeployments.length === 0 && podIssues.length === 0 && deploymentIssues.length === 0) && isLoading

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  const handleRefresh = useCallback(() => {
    refetchPodIssues()
    refetchDeploymentIssues()
    refetchDeployments()
    refetchClusters()
  }, [refetchPodIssues, refetchDeploymentIssues, refetchDeployments, refetchClusters])

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

  // Group applications by namespace with global filter applied
  const apps = useMemo(() => {
    // Filter deployments and issues by global cluster selection
    let filteredDeployments = allDeployments
    let filteredPodIssues = podIssues
    let filteredDeploymentIssues = deploymentIssues

    if (!isAllClustersSelected) {
      filteredDeployments = filteredDeployments.filter(d =>
        d.cluster && globalSelectedClusters.includes(d.cluster)
      )
      filteredPodIssues = filteredPodIssues.filter(issue =>
        issue.cluster && globalSelectedClusters.includes(issue.cluster)
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter(issue =>
        issue.cluster && globalSelectedClusters.includes(issue.cluster)
      )
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      filteredDeployments = filteredDeployments.filter(d =>
        d.name.toLowerCase().includes(query) ||
        d.namespace.toLowerCase().includes(query) ||
        (d.cluster && d.cluster.toLowerCase().includes(query))
      )
      filteredPodIssues = filteredPodIssues.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query))
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter(issue =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query))
      )
    }

    const appMap = new Map<string, AppSummary>()

    // First, populate from ALL deployments (not just issues)
    filteredDeployments.forEach(deployment => {
      const key = `${deployment.cluster}/${deployment.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: deployment.namespace,
          cluster: deployment.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.deploymentCount++
    })

    // Add pod issues to the map
    filteredPodIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.podIssues++
      app.status = app.podIssues > 3 ? 'error' : 'warning'
    })

    // Add deployment issues to the map
    filteredDeploymentIssues.forEach(issue => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
        })
      }
      const app = appMap.get(key)!
      app.deploymentIssues++
      if (app.status !== 'error') {
        app.status = 'warning'
      }
    })

    return Array.from(appMap.values()).sort((a, b) => {
      // Sort by status (critical first), then by deployment count
      const statusOrder: Record<string, number> = { error: 0, critical: 0, warning: 1, healthy: 2 }
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      // Then sort by deployment count (more deployments = more important)
      return b.deploymentCount - a.deploymentCount
    })
  }, [allDeployments, podIssues, deploymentIssues, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => ({
    total: apps.length,
    healthy: apps.filter(a => a.status === 'healthy').length,
    warning: apps.filter(a => a.status === 'warning').length,
    critical: apps.filter(a => a.status === 'error').length,
    totalDeployments: apps.reduce((sum, a) => sum + a.deploymentCount, 0),
    totalPodIssues: podIssues.length,
    totalDeploymentIssues: deploymentIssues.length,
  }), [apps, podIssues, deploymentIssues])

  // Dashboard-specific stats value getter
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'namespaces':
        return { value: stats.total, sublabel: 'active namespaces', onClick: () => drillToAllNamespaces(), isClickable: apps.length > 0 }
      case 'critical':
        return { value: stats.critical, sublabel: 'critical issues', onClick: () => drillToAllNamespaces('critical'), isClickable: stats.critical > 0 }
      case 'warning':
        return { value: stats.warning, sublabel: 'warning issues', onClick: () => drillToAllNamespaces('warning'), isClickable: stats.warning > 0 }
      case 'healthy':
        return { value: stats.healthy, sublabel: 'healthy namespaces', onClick: () => drillToAllNamespaces('healthy'), isClickable: stats.healthy > 0 }
      case 'deployments':
        return { value: stats.totalDeployments, sublabel: 'total deployments', onClick: () => drillToAllDeployments(), isClickable: stats.totalDeployments > 0 }
      case 'pod_issues':
        return { value: stats.totalPodIssues, sublabel: 'pod issues', onClick: () => drillToAllPods('issues'), isClickable: stats.totalPodIssues > 0 }
      case 'deployment_issues':
        return { value: stats.totalDeploymentIssues, sublabel: 'deployment issues', onClick: () => drillToAllDeployments('issues'), isClickable: stats.totalDeploymentIssues > 0 }
      default:
        return { value: '-', sublabel: '' }
    }
  }, [stats, apps, drillToAllNamespaces, drillToAllDeployments, drillToAllPods])

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
    <div className="pt-16">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Layers className="w-6 h-6 text-purple-400" />
                Workloads
              </h1>
              <p className="text-muted-foreground">View and manage deployed applications across clusters</p>
            </div>
            {isRefreshing && (
              <span className="flex items-center gap-1 text-xs text-amber-400 animate-pulse" title="Updating...">
                <Hourglass className="w-3 h-3" />
                <span>Updating</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="workloads-auto-refresh" className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground" title="Auto-refresh every 30s">
              <input
                type="checkbox"
                id="workloads-auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border w-3.5 h-3.5"
              />
              Auto
            </label>
            <button
              onClick={handleRefresh}
              disabled={isFetching}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Overview - configurable */}
      <StatsOverview
        dashboardType="workloads"
        getStatValue={getStatValue}
        hasData={apps.length > 0 || !showSkeletons}
        isLoading={showSkeletons}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-workloads-stats-collapsed"
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle and buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Workload Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Layers className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Workloads Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor deployments, pods, and application health across your clusters.
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
                      <SortableWorkloadCard
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
                      <WorkloadDragPreviewCard card={cards.find(c => c.id === activeId)!} />
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

      {/* Workloads List */}
      {showSkeletons ? (
        // Loading skeletons for workloads list (only when no cached data)
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
      ) : apps.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-lg text-foreground">No workloads found</p>
          <p className="text-sm text-muted-foreground">No deployments detected across your clusters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app, i) => (
            <div
              key={i}
              onClick={() => drillToNamespace(app.cluster, app.namespace)}
              className={`glass p-4 rounded-lg cursor-pointer transition-all hover:scale-[1.01] border-l-4 ${
                app.status === 'error' ? 'border-l-red-500' :
                app.status === 'warning' ? 'border-l-yellow-500' :
                'border-l-green-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StatusIndicator status={app.status} size="lg" />
                  <div>
                    <h3 className="font-semibold text-foreground">{app.namespace}</h3>
                    <ClusterBadge cluster={app.cluster.split('/').pop() || app.cluster} size="sm" />
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-lg font-bold text-foreground">{app.deploymentCount}</div>
                    <div className="text-xs text-muted-foreground">Deployments</div>
                  </div>
                  {app.deploymentIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-orange-400">{app.deploymentIssues}</div>
                      <div className="text-xs text-muted-foreground">Issues</div>
                    </div>
                  )}
                  {app.podIssues > 0 && (
                    <div className="text-center">
                      <div className="text-lg font-bold text-red-400">{app.podIssues}</div>
                      <div className="text-xs text-muted-foreground">Pod Issues</div>
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
                {cluster.reachable !== false ? (cluster.podCount ?? '-') : '-'} pods • {cluster.reachable !== false ? (cluster.nodeCount ?? '-') : '-'} nodes
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
