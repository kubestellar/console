import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { GripVertical, Trash2, AlertTriangle } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { CardWrapper } from '../cards/CardWrapper'
import { CARD_COMPONENTS } from '../cards/cardRegistry'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../lib/utils/localStorage'
import { ROUTES } from '../../config/routes'
import { AddCardModal } from './AddCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'
import { MissionSuggestions } from './MissionSuggestions'
import { TemplatesModal } from './TemplatesModal'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { DashboardTemplate } from './templates'
import { BaseModal } from '../../lib/modals'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { useUniversalStats, createMergedStatValueGetter } from '../../hooks/useUniversalStats'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'

interface Card {
  id: string
  card_type: string
  config: Record<string, unknown>
  position: { x: number; y: number; w: number; h: number }
  title?: string
}

// Sortable card component
interface SortableCardProps {
  card: Card
  onConfigure: () => void
  onRemove: () => void
  onWidthChange: (newWidth: number) => void
  isDragging?: boolean
  isRefreshing?: boolean
  onRefresh?: () => void
  lastUpdated?: Date | null
}

function SortableCard({ card, onConfigure, onRemove, onWidthChange, isDragging, isRefreshing, onRefresh, lastUpdated }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: `span ${card.position?.w || 4}`,
    opacity: isDragging ? 0.5 : 1,
  }

  const CardComponent = CARD_COMPONENTS[card.card_type]

  if (!CardComponent) {
    return (
      <div ref={setNodeRef} style={style} className="relative">
        <CardWrapper
          cardId={card.id}
          cardType={card.card_type}
          title={formatCardTitle(card.card_type)}
          onConfigure={onConfigure}
          onRemove={onRemove}
          onWidthChange={onWidthChange}
          cardWidth={card.position?.w || 4}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          lastUpdated={lastUpdated}
        >
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Unknown card type: {card.card_type}
          </div>
        </CardWrapper>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity bg-secondary/80"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        onConfigure={onConfigure}
        onRemove={onRemove}
        onWidthChange={onWidthChange}
        cardWidth={card.position?.w || 4}
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
        lastUpdated={lastUpdated}
      >
        <CardComponent config={card.config} />
      </CardWrapper>
    </div>
  )
}

// Drag preview card
function DragPreviewCard({ card }: { card: Card }) {
  const CardComponent = CARD_COMPONENTS[card.card_type]

  return (
    <div
      className="rounded-lg border border-purple-500 bg-card shadow-lg"
      style={{ width: `${(card.position?.w || 4) * 80}px`, height: '200px' }}
    >
      <CardWrapper
        cardId={card.id}
        cardType={card.card_type}
        title={card.title || formatCardTitle(card.card_type)}
        cardWidth={card.position?.w || 4}
      >
        {CardComponent ? <CardComponent config={card.config} /> : null}
      </CardWrapper>
    </div>
  )
}

export function CustomDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { getDashboardWithCards, deleteDashboard, exportDashboard, importDashboard } = useDashboards()
  const { clusters, deduplicatedClusters, isLoading: isClustersLoading } = useClusters()
  const { config, removeItem } = useSidebarConfig()
  const { drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()

  // Find the sidebar item matching this dashboard to get name/description
  const sidebarItem = useMemo(() => {
    return [...config.primaryNav, ...config.secondaryNav]
      .find(item => item.href === `/custom-dashboard/${id}`)
  }, [config.primaryNav, config.secondaryNav, id])

  // Stats data from clusters
  const healthyClusters = deduplicatedClusters.filter((c) => c.healthy === true && c.reachable !== false).length
  const unhealthyClusters = deduplicatedClusters.filter((c) => c.healthy === false && c.reachable !== false).length
  const totalNodes = deduplicatedClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0)
  const totalPods = deduplicatedClusters.reduce((sum, c) => sum + (c.podCount || 0), 0)

  const getDashboardStatValue = useCallback((blockId: string): StatBlockValue => {
    switch (blockId) {
      case 'clusters':
        return { value: deduplicatedClusters.length, sublabel: 'total clusters', onClick: () => drillToAllClusters(), isClickable: deduplicatedClusters.length > 0 }
      case 'healthy':
        return { value: healthyClusters, sublabel: 'healthy', onClick: () => drillToAllClusters('healthy'), isClickable: healthyClusters > 0 }
      case 'warnings':
        return { value: 0, sublabel: 'warnings', isClickable: false }
      case 'errors':
        return { value: unhealthyClusters, sublabel: 'unhealthy', onClick: () => drillToAllClusters('unhealthy'), isClickable: unhealthyClusters > 0 }
      case 'namespaces':
        return { value: totalNodes, sublabel: 'nodes', onClick: () => drillToAllNodes(), isClickable: totalNodes > 0 }
      case 'pods':
        return { value: totalPods, sublabel: 'pods', onClick: () => drillToAllPods(), isClickable: totalPods > 0 }
      default:
        return { value: '-' }
    }
  }, [deduplicatedClusters, healthyClusters, unhealthyClusters, totalNodes, totalPods, drillToAllClusters, drillToAllNodes, drillToAllPods])

  const { getStatValue: getUniversalStatValue } = useUniversalStats()
  const getStatValue = useMemo(() => createMergedStatValueGetter(getDashboardStatValue, getUniversalStatValue), [getDashboardStatValue, getUniversalStatValue])

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Modal states
  const [isAddCardOpen, setIsAddCardOpen] = useState(false)
  const [isConfigureCardOpen, setIsConfigureCardOpen] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Storage key for this dashboard's cards
  const storageKey = `kubestellar-custom-dashboard-${id}-cards`

  // Load dashboard
  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!id) return

    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      // First try to load from localStorage for instant display
      if (!isRefresh) {
        const parsed = safeGetJSON<Card[]>(storageKey)
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          setCards(parsed)
        }
      }

      // Then fetch from API
      const data = await getDashboardWithCards(id)
      if (data) {
        setDashboard(data)
        if (data.cards && data.cards.length > 0) {
          const loadedCards = data.cards.map(c => ({
            ...c,
            position: c.position || { x: 0, y: 0, w: 4, h: 2 }
          }))
          setCards(loadedCards)
          safeSetJSON(storageKey, loadedCards)
        }
      }
      setLastUpdated(new Date())
    } catch (error) {
      const isExpectedFailure = error instanceof BackendUnavailableError ||
        error instanceof UnauthenticatedError
      if (!isExpectedFailure) {
        console.error('Failed to load dashboard:', error)
      }
      if (!isRefresh && !isExpectedFailure) {
        showToast('Failed to load dashboard', 'error')
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [id, getDashboardWithCards, showToast, storageKey])

  const handleRefreshDashboard = useCallback(() => loadDashboard(true), [loadDashboard])
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshDashboard, id)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator

  // Initial load
  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => loadDashboard(true), 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, loadDashboard])

  // Persist cards to localStorage when they change
  useEffect(() => {
    if (cards.length > 0) {
      safeSetJSON(storageKey, cards)
    }
  }, [cards, storageKey])

  // Card operations
  const handleAddCards = useCallback(async (newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd = newCards.map((c, index) => ({
      id: `card-${Date.now()}-${index}`,
      card_type: c.type,
      title: c.title,
      config: c.config,
      position: { x: 0, y: 0, w: 4, h: 2 }
    }))

    // Add to local state
    setCards(prev => [...prev, ...cardsToAdd])

    // Persist to backend
    if (id) {
      for (const card of cardsToAdd) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error) {
          console.error('Failed to persist card:', error)
          showToast('Failed to persist card to backend', 'error')
        }
      }
    }

    setIsAddCardOpen(false)
    showToast(`Added ${newCards.length} card${newCards.length > 1 ? 's' : ''}`, 'success')
  }, [id, showToast])

  const handleRemoveCard = useCallback(async (cardId: string) => {
    setCards(prev => prev.filter(c => c.id !== cardId))

    if (id) {
      try {
        await api.delete(`/api/dashboards/${id}/cards/${cardId}`)
      } catch (error) {
        console.error('Failed to delete card:', error)
        showToast('Failed to delete card from backend', 'error')
      }
    }
  }, [id])

  const handleConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    setIsConfigureCardOpen(true)
  }, [])

  const handleCardConfigured = useCallback(async (cardId: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    setIsConfigureCardOpen(false)
    setSelectedCard(null)
  }, [])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...c.position, w: newWidth } } : c
    ))
  }, [])

  const handleApplyTemplate = useCallback(async (template: DashboardTemplate) => {
    const templateCards = template.cards.map((tc, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: tc.card_type,
      title: tc.title,
      config: tc.config || {},
      position: { x: 0, y: 0, w: tc.position.w, h: tc.position.h }
    }))

    setCards(templateCards)
    setIsTemplatesOpen(false)

    // Persist to backend
    if (id) {
      for (const card of templateCards) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error) {
          console.error('Failed to persist template card:', error)
          showToast('Failed to persist template card', 'error')
        }
      }
    }

    showToast(`Applied template "${template.name}" with ${templateCards.length} cards`, 'success')
  }, [id, showToast])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>) => {
    handleAddCards([{ type: cardType, title: formatCardTitle(cardType), config: config || {} }])
  }, [handleAddCards])

  const handleReset = useCallback(() => {
    setCards([])
    safeRemoveItem(storageKey)
    showToast('Dashboard reset to empty', 'info')
  }, [storageKey, showToast])

  const handleDeleteDashboard = useCallback(() => {
    if (!id) return

    // Remove sidebar item
    if (sidebarItem) {
      removeItem(sidebarItem.id)
    }

    // Remove local card storage
    safeRemoveItem(storageKey)

    const displayName = sidebarItem?.name || dashboard?.name || 'this dashboard'
    showToast(`Deleted "${displayName}"`, 'success')
    navigate(ROUTES.HOME)

    // Try to delete from backend in the background (may fail offline)
    deleteDashboard(id).catch(() => {
      // Backend deletion is optional — sidebar + localStorage are the source of truth
    })
  }, [id, sidebarItem, dashboard, deleteDashboard, removeItem, storageKey, showToast, navigate])

  // Drag handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      setCards(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [])

  // Current card types for recommendations
  const currentCardTypes = useMemo(() => cards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  }), [cards])

  // Loading skeleton
  if (isLoading && cards.length === 0) {
    return (
      <div className="pt-16">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-secondary/50 rounded" />
          <div className="h-4 w-96 bg-secondary/30 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="col-span-4 h-48 bg-secondary/30 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16">
      {/* Header - name from sidebar item takes priority for consistency */}
      <DashboardHeader
        title={sidebarItem?.name || dashboard?.name || 'Custom Dashboard'}
        subtitle={sidebarItem?.description || (cards.length === 0
          ? 'Add cards to start monitoring your clusters'
          : `${cards.length} card${cards.length !== 1 ? 's' : ''}`
        )}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        lastUpdated={lastUpdated}
        rightExtra={
          <button
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete dashboard"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        }
      />

      {/* Stats Overview */}
      <StatsOverview
        dashboardType="dashboard"
        getStatValue={getStatValue}
        hasData={deduplicatedClusters.length > 0}
        isLoading={isClustersLoading && deduplicatedClusters.length === 0}
        lastUpdated={lastUpdated}
        collapsedStorageKey={`kubestellar-custom-${id}-stats-collapsed`}
      />

      {/* AI Recommendations - always shown to help users add relevant cards */}
      <CardRecommendations
        currentCardTypes={currentCardTypes}
        onAddCard={handleAddRecommendedCard}
      />

      {/* Mission Suggestions */}
      <MissionSuggestions />

      {/* Empty state */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No cards yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            This dashboard is empty. Add cards to start monitoring your {clusters.length > 0 ? `${clusters.length} clusters` : 'Kubernetes clusters'}.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setIsAddCardOpen(true)}
              className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              Add Cards
            </button>
            <button
              onClick={() => setIsTemplatesOpen(true)}
              className="px-4 py-2 bg-secondary text-foreground rounded-lg hover:bg-secondary/80 transition-colors"
            >
              Start with Template
            </button>
          </div>
        </div>
      ) : (
        /* Card grid with drag and drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
              {cards.map((card) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onConfigure={() => handleConfigureCard(card)}
                  onRemove={() => handleRemoveCard(card.id)}
                  onWidthChange={(w) => handleWidthChange(card.id, w)}
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

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setIsAddCardOpen(true)}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onResetToDefaults={handleReset}
        isCustomized={cards.length > 0}
        onExport={id ? async () => {
          try {
            const data = await exportDashboard(id)
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${(dashboard?.name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
            a.click()
            URL.revokeObjectURL(url)
            showToast('Dashboard exported', 'success')
          } catch {
            showToast('Failed to export dashboard', 'error')
          }
        } : undefined}
        onImport={async (json) => {
          try {
            await importDashboard(json)
            showToast('Dashboard imported', 'success')
          } catch {
            showToast('Failed to import dashboard', 'error')
          }
        }}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => setIsAddCardOpen(false)}
        onAddCards={handleAddCards}
        existingCardTypes={currentCardTypes}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={selectedCard}
        onClose={() => {
          setIsConfigureCardOpen(false)
          setSelectedCard(null)
        }}
        onSave={handleCardConfigured}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Delete Confirmation Modal */}
      <BaseModal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} size="md">
        <BaseModal.Header
          title="Delete Dashboard"
          description={`Are you sure you want to delete "${sidebarItem?.name || dashboard?.name || 'this dashboard'}"?`}
          icon={Trash2}
          onClose={() => setIsDeleteConfirmOpen(false)}
          showBack={false}
        />
        <BaseModal.Content>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium">This action cannot be undone</p>
              <p className="text-sm text-muted-foreground mt-1">
                The dashboard and all its cards will be permanently removed from the sidebar.
              </p>
            </div>
          </div>
        </BaseModal.Content>
        <BaseModal.Footer>
          <button
            onClick={() => setIsDeleteConfirmOpen(false)}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setIsDeleteConfirmOpen(false)
              handleDeleteDashboard()
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Dashboard
          </button>
        </BaseModal.Footer>
      </BaseModal>
    </div>
  )
}
