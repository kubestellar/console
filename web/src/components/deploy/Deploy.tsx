import { useState, useEffect, useCallback, memo } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Rocket, Plus, LayoutGrid, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
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
import { DragEndEvent } from '@dnd-kit/core'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { useDashboard, DashboardCard } from '../../lib/dashboards'
import { useDeployments, useHelmReleases } from '../../hooks/useMCP'
import { useCachedDeployments } from '../../hooks/useCachedData'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useCardPublish, type DeployResultPayload } from '../../lib/cardEvents'
import { DeployConfirmDialog } from './DeployConfirmDialog'
import { useDeployWorkload } from '../../hooks/useWorkloads'

const DEPLOY_CARDS_KEY = 'kubestellar-deploy-cards'

// Default cards for the deploy dashboard - deployment monitoring focused
const DEFAULT_DEPLOY_CARDS = [
  // Deployment Status
  { type: 'deployment_status', title: 'Deployment Status', position: { w: 6, h: 4 } },
  { type: 'deployment_progress', title: 'Deployment Progress', position: { w: 5, h: 4 } },
  { type: 'deployment_issues', title: 'Deployment Issues', position: { w: 6, h: 4 } },
  // GitOps
  { type: 'gitops_drift', title: 'GitOps Drift', position: { w: 6, h: 4 } },
  { type: 'argocd_applications', title: 'ArgoCD Applications', position: { w: 6, h: 4 } },
  { type: 'argocd_sync_status', title: 'ArgoCD Sync Status', position: { w: 6, h: 4 } },
  { type: 'argocd_health', title: 'ArgoCD Health', position: { w: 6, h: 4 } },
  // Helm
  { type: 'helm_release_status', title: 'Helm Releases', position: { w: 6, h: 4 } },
  { type: 'helm_history', title: 'Helm History', position: { w: 8, h: 4 } },
  { type: 'chart_versions', title: 'Chart Versions', position: { w: 6, h: 4 } },
  // Kustomize
  { type: 'kustomization_status', title: 'Kustomizations', position: { w: 6, h: 4 } },
  { type: 'overlay_comparison', title: 'Overlay Comparison', position: { w: 8, h: 4 } },
  // Workload Deployment
  { type: 'workload_deployment', title: 'Workloads', position: { w: 6, h: 4 } },
  // Cross-card deploy
  { type: 'cluster_groups', title: 'Cluster Groups', position: { w: 4, h: 4 } },
  { type: 'deployment_missions', title: 'Deployment Missions', position: { w: 5, h: 4 } },
  // Dependency explorer
  { type: 'resource_marshall', title: 'Resource Marshall', position: { w: 6, h: 4 } },
  // Upgrade tracking
  { type: 'upgrade_status', title: 'Upgrade Status', position: { w: 4, h: 4 } },
]

// Sortable card component with drag handle
interface SortableDeployCardProps {
  card: DashboardCard
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableDeployCard = memo(function SortableDeployCard({
  card,
  onConfigure,
  onRemove,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableDeployCardProps) {
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
function DeployDragPreviewCard({ card }: { card: DashboardCard }) {
  const cardWidth = card?.position?.w || 4
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

export function Deploy() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const { isLoading: deploymentsLoading, isRefreshing: deploymentsRefreshing, lastUpdated, refetch } = useDeployments()
  const { deployments: cachedDeployments } = useCachedDeployments()
  const { releases: helmReleases } = useHelmReleases()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
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
    dnd: { sensors, activeId, handleDragStart, handleDragEnd: reorderDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: DEPLOY_CARDS_KEY,
    defaultCards: DEFAULT_DEPLOY_CARDS,
    onRefresh: refetch,
  })

  const publishCardEvent = useCardPublish()
  const { mutate: deployWorkload } = useDeployWorkload()

  const isRefreshing = deploymentsRefreshing || showIndicator
  const isFetching = deploymentsLoading || isRefreshing || showIndicator

  // Deploy stats from cached data (works in demo mode too)
  const runningCount = cachedDeployments.filter(d => d.status === 'running' || (d.readyReplicas === d.replicas && d.replicas > 0)).length
  const progressingCount = cachedDeployments.filter(d => d.status === 'deploying').length
  const failedCount = cachedDeployments.filter(d => d.status === 'failed').length

  const getDeployStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'deployments':
        return { value: cachedDeployments.length, sublabel: 'total deployments' }
      case 'healthy':
        return { value: runningCount, sublabel: 'running' }
      case 'progressing':
        return { value: progressingCount, sublabel: 'deploying' }
      case 'failed':
        return { value: failedCount, sublabel: 'failed' }
      case 'helm':
        return { value: helmReleases.length, sublabel: 'releases' }
      case 'argocd':
        return { value: 0, sublabel: 'applications', isDemo: true }
      // 'namespaces' and 'clusters' fall through to universal stats
      // which returns total counts from useClusters()
      default:
        return { value: '-' }
    }
  }, [cachedDeployments.length, runningCount, progressingCount, failedCount, helmReleases.length])

  const getStatValue = useCallback(
    (blockId: string) => createMergedStatValueGetter(getDeployStatValue, getUniversalStatValue)(blockId),
    [getDeployStatValue, getUniversalStatValue]
  )

  // Pending deploy state for confirmation dialog
  const [pendingDeploy, setPendingDeploy] = useState<{
    workloadName: string
    namespace: string
    sourceCluster: string
    targetClusters: string[]
    groupName: string
  } | null>(null)

  // Wrap DnD handler to support cross-card deploy drops
  const handleDeployDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) {
      reorderDragEnd(event)
      return
    }

    // Workload dropped on cluster group → show confirmation dialog
    if (
      active.data.current?.type === 'workload' &&
      String(over.id).startsWith('cluster-group-')
    ) {
      const workloadData = active.data.current.workload as {
        name: string
        namespace: string
        sourceCluster: string
      }
      const groupData = over.data.current as {
        groupName: string
        clusters: string[]
      }

      if (groupData?.clusters?.length > 0) {
        setPendingDeploy({
          workloadName: workloadData.name,
          namespace: workloadData.namespace,
          sourceCluster: workloadData.sourceCluster,
          targetClusters: groupData.clusters,
          groupName: groupData.groupName,
        })
      }
      return
    }

    // Fall through to normal reorder
    reorderDragEnd(event)
  }, [reorderDragEnd])

  // Handle confirmed deploy
  const handleConfirmDeploy = useCallback(async () => {
    if (!pendingDeploy) return
    const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy
    setPendingDeploy(null)

    const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    publishCardEvent({
      type: 'deploy:started',
      payload: {
        id: deployId,
        workload: workloadName,
        namespace,
        sourceCluster,
        targetClusters,
        groupName,
        timestamp: Date.now(),
      },
    })

    try {
      await deployWorkload({
        workloadName,
        namespace,
        sourceCluster,
        targetClusters,
      }, {
        onSuccess: (result) => {
          const resp = result as unknown as {
            success?: boolean
            message?: string
            deployedTo?: string[]
            failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]
            warnings?: string[]
          }
          if (resp && typeof resp === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: resp.success ?? true,
                message: resp.message ?? '',
                deployedTo: resp.deployedTo,
                failedClusters: resp.failedClusters,
                dependencies: resp.dependencies as DeployResultPayload['dependencies'],
                warnings: resp.warnings,
              },
            })
          }
        },
      })
    } catch (err) {
      console.error('Deploy failed:', err)
    }
  }, [pendingDeploy, publishCardEvent, deployWorkload])

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  // Track location for any navigation effects
  useEffect(() => {
    // Could add analytics or other effects here
  }, [location.key])

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
      <DashboardHeader
        title="KubeStellar Deploy"
        subtitle="Monitor deployments, GitOps, and Helm releases across clusters"
        icon={<Rocket className="w-6 h-6 text-blue-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="deploy-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="deploy"
        getStatValue={getStatValue}
        hasData={cachedDeployments.length > 0}
        isLoading={deploymentsLoading && cachedDeployments.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-deploy-stats-collapsed"
      />

      {/* Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Deployment Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-blue-500/30 text-center">
                <div className="flex justify-center mb-4">
                  <Rocket className="w-12 h-12 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Deployment Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add deployment monitoring cards! Track GitOps status, Helm releases, ArgoCD applications, and deployment health.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors"
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
                onDragEnd={handleDeployDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-12 gap-4">
                    {cards.map(card => (
                      <SortableDeployCard
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
                      {String(activeId).startsWith('workload-') ? (
                        <div className="glass rounded-lg p-3 shadow-xl" style={{ minWidth: 200, maxWidth: 400 }}>
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium truncate">
                              {String(activeId).replace('workload-', '').replace(/-/g, ' / ')}
                            </span>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          const card = cards.find(c => c.id === activeId)
                          return card ? <DeployDragPreviewCard card={card} /> : null
                        })()
                      )}
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

      {/* Pre-deploy Confirmation Dialog */}
      <DeployConfirmDialog
        isOpen={pendingDeploy !== null}
        onClose={() => setPendingDeploy(null)}
        onConfirm={handleConfirmDeploy}
        workloadName={pendingDeploy?.workloadName ?? ''}
        namespace={pendingDeploy?.namespace ?? ''}
        sourceCluster={pendingDeploy?.sourceCluster ?? ''}
        targetClusters={pendingDeploy?.targetClusters ?? []}
        groupName={pendingDeploy?.groupName}
      />
    </div>
  )
}
