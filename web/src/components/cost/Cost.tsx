import { useState, useEffect, useCallback, memo, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { DollarSign, GripVertical } from 'lucide-react'
import { DashboardHeader } from '../shared/DashboardHeader'
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
import { useClusters, useGPUNodes } from '../../hooks/useMCP'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS, DEMO_DATA_CARDS } from '../cards/cardRegistry'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { ConfigureCardModal } from '../dashboard/ConfigureCardModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useDashboard, DashboardCard } from '../../lib/dashboards'

// Width class lookup for Tailwind (dynamic classes don't work)
const WIDTH_CLASSES: Record<number, string> = {
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
}

// Sortable Card Component
interface SortableCardProps {
  card: DashboardCard
  onRemove: () => void
  onConfigure: () => void
  onWidthChange: (width: number) => void
  isDragging: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

const SortableCard = memo(function SortableCard({
  card,
  onRemove,
  onConfigure,
  onWidthChange,
  isDragging,
  isRefreshing,
  onRefresh,
  lastUpdated,
}: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) {
    console.warn(`Card component not found: ${card.card_type}`)
    return null
  }

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div ref={setNodeRef} style={style} className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        onRemove={onRemove}
        onConfigure={onConfigure}
        cardType={card.card_type}
        cardWidth={width}
        onWidthChange={onWidthChange}
        isDemoData={DEMO_DATA_CARDS.has(card.card_type)}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
        dragHandle={
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        }
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
})

// Drag preview component
function DragPreviewCard({ card }: { card: DashboardCard }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]
  if (!CardComponent) return null

  const width = Math.min(12, Math.max(3, card.position?.w || 6))
  const colSpan = WIDTH_CLASSES[width] || 'col-span-6'

  return (
    <div className={colSpan}>
      <CardWrapper
        title={formatCardTitle(card.card_type)}
        cardType={card.card_type}
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
}

const COST_CARDS_KEY = 'kubestellar-cost-cards'

// Default cards for the Cost dashboard
const DEFAULT_COST_CARDS = [
  { type: 'cluster_costs', position: { w: 6, h: 4 } },
  { type: 'opencost_overview', position: { w: 6, h: 4 } },
  { type: 'kubecost_overview', position: { w: 6, h: 4 } },
  { type: 'resource_usage', position: { w: 3, h: 2 } },
  { type: 'resource_capacity', position: { w: 3, h: 2 } },
]

export function Cost() {
  const location = useLocation()
  const { clusters, isLoading, refetch, lastUpdated, isRefreshing: dataRefreshing } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { nodes: gpuNodes } = useGPUNodes()
  const { drillToCost } = useDrillDownActions()
  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

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
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: COST_CARDS_KEY,
    defaultCards: DEFAULT_COST_CARDS,
    onRefresh: refetch,
  })

  // Trigger refresh when navigating to this page
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filter clusters based on global selection
  const filteredClusters = clusters.filter(c =>
    isAllClustersSelected || globalSelectedClusters.includes(c.name)
  )
  const reachableClusters = filteredClusters.filter(c => c.reachable !== false)

  // Cloud provider pricing (same as ClusterCosts card for consistency)
  type CloudProvider = 'estimate' | 'aws' | 'gcp' | 'azure' | 'oci' | 'openshift'
  const CLOUD_PRICING: Record<CloudProvider, { cpu: number; memory: number; gpu: number }> = {
    estimate: { cpu: 0.05, memory: 0.01, gpu: 2.50 },
    aws: { cpu: 0.048, memory: 0.012, gpu: 3.06 },
    gcp: { cpu: 0.0475, memory: 0.0064, gpu: 2.48 },
    azure: { cpu: 0.05, memory: 0.011, gpu: 2.07 },
    oci: { cpu: 0.025, memory: 0.0015, gpu: 2.95 },
    openshift: { cpu: 0.048, memory: 0.012, gpu: 3.00 },
  }

  // Read provider overrides from localStorage (same key as ClusterCosts card)
  const [providerOverrides, setProviderOverrides] = useState<Record<string, CloudProvider>>(() => {
    try {
      const saved = localStorage.getItem('kubestellar-cluster-provider-overrides')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  // Listen for localStorage changes (when user changes provider in ClusterCosts card)
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const saved = localStorage.getItem('kubestellar-cluster-provider-overrides')
        setProviderOverrides(saved ? JSON.parse(saved) : {})
      } catch { /* ignore */ }
    }
    window.addEventListener('storage', handleStorageChange)
    // Also poll for changes since storage event doesn't fire for same-tab changes
    const interval = setInterval(handleStorageChange, 1000)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  // Detect cloud provider from cluster name (matches ClusterCosts logic)
  const detectClusterProvider = (name: string, context?: string): CloudProvider => {
    // Check for manual override first
    if (providerOverrides[name]) {
      return providerOverrides[name]
    }
    const searchStr = `${name} ${context || ''}`.toLowerCase()
    if (searchStr.includes('openshift') || searchStr.includes('ocp') || searchStr.includes('rosa') || searchStr.includes('aro')) return 'openshift'
    if (searchStr.includes('eks') || searchStr.includes('aws') || searchStr.includes('amazon')) return 'aws'
    if (searchStr.includes('gke') || searchStr.includes('gcp') || searchStr.includes('google')) return 'gcp'
    if (searchStr.includes('aks') || searchStr.includes('azure') || searchStr.includes('microsoft')) return 'azure'
    if (searchStr.includes('oke') || searchStr.includes('oci') || searchStr.includes('oracle') || name.toLowerCase() === 'prow') return 'oci'
    return 'estimate'
  }

  // Count GPUs from GPU nodes
  const gpuByCluster = useMemo(() => {
    const map: Record<string, number> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      map[clusterKey] = (map[clusterKey] || 0) + node.gpuCount
    })
    return map
  }, [gpuNodes])

  // Calculate per-cluster costs (matches ClusterCosts card exactly)
  const costStats = useMemo(() => {
    let totalCPU = 0
    let totalMemoryGB = 0
    let totalGPUs = 0
    let totalMonthly = 0
    let cpuMonthly = 0
    let memoryMonthly = 0
    let gpuMonthly = 0

    reachableClusters.forEach(cluster => {
      const cpus = cluster.cpuCores || 0
      const memory = 32 * (cluster.nodeCount || 0) // Estimate 32GB per node (matches ClusterCosts)
      const gpus = gpuByCluster[cluster.name] || 0

      // Get per-cluster pricing based on detected provider
      const provider = detectClusterProvider(cluster.name, cluster.context)
      const pricing = CLOUD_PRICING[provider]

      const clusterHourly = (cpus * pricing.cpu) + (memory * pricing.memory) + (gpus * pricing.gpu)
      const clusterMonthly = clusterHourly * 24 * 30

      totalCPU += cpus
      totalMemoryGB += memory
      totalGPUs += gpus
      totalMonthly += clusterMonthly
      cpuMonthly += cpus * pricing.cpu * 24 * 30
      memoryMonthly += memory * pricing.memory * 24 * 30
      gpuMonthly += gpus * pricing.gpu * 24 * 30
    })

    const totalStorageGB = reachableClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0)
    const storageCostPerGBMonth = 0.10
    const storageMonthly = totalStorageGB * storageCostPerGBMonth

    return {
      totalCPU,
      totalMemoryGB,
      totalGPUs,
      totalStorageGB,
      totalMonthly: totalMonthly + storageMonthly,
      cpuMonthly,
      memoryMonthly,
      gpuMonthly,
      storageMonthly,
    }
  }, [reachableClusters, gpuByCluster, providerOverrides])

  // Stats value getter for the configurable StatsOverview component
  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    const drillToCostType = (type: string) => {
      drillToCost('all', { costType: type, totalMonthly: costStats.totalMonthly })
    }

    switch (blockId) {
      case 'total_cost':
        return { value: `$${Math.round(costStats.totalMonthly).toLocaleString()}`, sublabel: 'est. monthly', onClick: () => drillToCostType('total'), isClickable: costStats.totalMonthly > 0 }
      case 'cpu_cost':
        return { value: `$${Math.round(costStats.cpuMonthly).toLocaleString()}`, sublabel: `${costStats.totalCPU} cores`, onClick: () => drillToCostType('cpu'), isClickable: costStats.cpuMonthly > 0 }
      case 'memory_cost':
        return { value: `$${Math.round(costStats.memoryMonthly).toLocaleString()}`, sublabel: `${costStats.totalMemoryGB} GB`, onClick: () => drillToCostType('memory'), isClickable: costStats.memoryMonthly > 0 }
      case 'storage_cost':
        return { value: `$${Math.round(costStats.storageMonthly).toLocaleString()}`, sublabel: costStats.totalStorageGB >= 1024 ? `${(costStats.totalStorageGB / 1024).toFixed(1)} TB` : `${Math.round(costStats.totalStorageGB)} GB`, onClick: () => drillToCostType('storage'), isClickable: costStats.storageMonthly > 0 }
      case 'network_cost':
        return { value: '$0', sublabel: 'not tracked', isClickable: false }
      case 'gpu_cost':
        return { value: `$${Math.round(costStats.gpuMonthly).toLocaleString()}`, sublabel: `${costStats.totalGPUs} GPUs`, onClick: () => drillToCostType('gpu'), isClickable: costStats.gpuMonthly > 0 }
      default:
        return { value: 0 }
    }
  }, [costStats, drillToCost])

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
      <DashboardHeader
        title="Cost Management"
        subtitle="Monitor and optimize resource costs across clusters"
        icon={<DollarSign className="w-6 h-6 text-green-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="cost-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Configurable Stats Overview */}
      <StatsOverview
        dashboardType="cost"
        getStatValue={getStatValue}
        hasData={reachableClusters.length > 0}
        isLoading={isLoading && clusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey="kubestellar-cost-stats-collapsed"
      />

      {/* Cards Grid */}
      {showCards && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-4 pb-32">
              {cards.map(card => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onRemove={() => handleRemoveCard(card.id)}
                  onConfigure={() => handleConfigureCard(card.id)}
                  onWidthChange={(width) => handleWidthChange(card.id, width)}
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
                <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Floating Actions */}
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
    </div>
  )
}
