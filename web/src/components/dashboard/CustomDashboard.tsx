import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent } from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from 'react-i18next'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { useDashboards, Dashboard } from '../../hooks/useDashboards'
import { safeRevokeObjectURL } from '../../lib/download'
import { useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useSidebarConfig } from '../../hooks/useSidebarConfig'
import { useToast } from '../ui/Toast'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../lib/utils/localStorage'
import { ROUTES } from '../../config/routes'
import { AddCardModal } from './AddCardModal'
import { ConfigureCardModal } from './ConfigureCardModal'
import { CardRecommendations } from './CardRecommendations'
import { MissionSuggestions } from './MissionSuggestions'
import { TemplatesModal } from './TemplatesModal'
import { FloatingDashboardActions } from './FloatingDashboardActions'
import { POLL_INTERVAL_MS } from '../../lib/constants/network'
import { DashboardTemplate } from './templates'
import { useModalState } from '../../lib/modals'
import { formatCardTitle } from '../../lib/formatCardTitle'
import { StatsOverview, StatBlockValue } from '../ui/StatsOverview'
import { getClusterHealthState, isClusterUnreachable } from '../clusters/utils'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { DashboardHealthIndicator } from './DashboardHealthIndicator'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { setAutoRefreshPaused } from '../../lib/cache'
import type { Card } from './customDashboard/types'
import { SortableCard } from './customDashboard/SortableCard'
import { DragPreviewCard } from './customDashboard/DragPreviewCard'
import { DashboardEmptyState } from './customDashboard/DashboardEmptyState'
import { DashboardDeleteModal } from './customDashboard/DashboardDeleteModal'

export function CustomDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const activeDashboardPath = `/custom-dashboard/${id}`
  const isActiveDashboard = location.pathname === activeDashboardPath
  const { showToast } = useToast()
  const { getDashboardWithCards, deleteDashboard, exportDashboard, importDashboard } = useDashboards()
  const { deduplicatedClusters, isLoading: isClustersLoading } = useClusters()
  const { config, removeItem } = useSidebarConfig()
  const { drillToAllClusters, drillToAllNodes, drillToAllPods } = useDrillDownActions()
  const { t } = useTranslation()

  // Find the sidebar item matching this dashboard to get name/description
  const sidebarItem = [...config.primaryNav, ...config.secondaryNav]
      .find(item => item.href === `/custom-dashboard/${id}`)

  // Stats data from clusters — use the centralised state machine so these
  // counts always match the main cluster grid and sidebar (#5928).
  const { healthyClusters, unhealthyClusters, totalNodes, totalPods } = useMemo(() => {
    return deduplicatedClusters.reduce((stats, cluster) => {
      if (!isClusterUnreachable(cluster)) {
        const healthState = getClusterHealthState(cluster)
        if (healthState === 'healthy') {
          stats.healthyClusters += 1
        }
        if (healthState === 'unhealthy') {
          stats.unhealthyClusters += 1
        }
      }

      stats.totalNodes += cluster.nodeCount || 0
      stats.totalPods += cluster.podCount || 0
      return stats
    }, {
      healthyClusters: 0,
      unhealthyClusters: 0,
      totalNodes: 0,
      totalPods: 0,
    })
  }, [deduplicatedClusters])

  const getDashboardStatValue = (blockId: string): StatBlockValue => {
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
  }

  const getStatValue = getDashboardStatValue

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Modal states
  const { isOpen: isAddCardOpen, open: openAddCard, close: closeAddCard } = useModalState()
  const { isOpen: isConfigureCardOpen, open: openConfigureCard, close: closeConfigureCard } = useModalState()
  const { isOpen: isTemplatesOpen, open: openTemplates, close: closeTemplates } = useModalState()
  const { isOpen: isDeleteConfirmOpen, open: openDeleteConfirm, close: closeDeleteConfirm } = useModalState()
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Storage key for this dashboard's cards
  const storageKey = `kubestellar-custom-dashboard-${id}-cards`

  // Request ID tracking — prevents stale async responses from overwriting newer state (#4664)
  const requestIdRef = useRef(0)

  // Undo/redo support
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const {
    snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
    (restored) => setCards(restored),
    () => cardsRef.current,
    isActiveDashboard,
  )

  // Load dashboard
  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (!id) return

    // Increment request ID so stale responses are discarded (#4664)
    const thisRequestId = ++requestIdRef.current

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

      // Discard if a newer request has been issued while we were waiting
      if (thisRequestId !== requestIdRef.current) return

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
    } catch (error: unknown) {
      // Discard errors from stale requests
      if (thisRequestId !== requestIdRef.current) return

      const isExpectedFailure = error instanceof BackendUnavailableError ||
        error instanceof UnauthenticatedError ||
        (error instanceof Error && (
          error.message.includes('Request timeout') ||
          error.message.includes('Failed to fetch') ||
          error.message.includes('NetworkError') ||
          error.message.includes('Load failed') ||
          error.message.includes('HTTP request to an HTTPS server') ||
          error.message.includes('API error:') ||
          error.message.includes('Invalid JSON')
        ))
      if (!isExpectedFailure) {
        console.error('Failed to load dashboard:', error)
      }
      if (!isRefresh && !isExpectedFailure) {
        showToast(t('dashboard.toast.loadFailed', 'Failed to load dashboard'), 'error')
      }
    } finally {
      // Only clear loading state if this is still the latest request
      if (thisRequestId === requestIdRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }
  }, [id, getDashboardWithCards, showToast, storageKey])

  const handleRefreshDashboard = () => loadDashboard(true)
  const { showIndicator, triggerRefresh } = useRefreshIndicator(handleRefreshDashboard, id)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator

  // Initial load
  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Propagate auto-refresh state to global cache layer
  useEffect(() => {
    setAutoRefreshPaused(!autoRefresh)
    return () => { setAutoRefreshPaused(false) }
  }, [autoRefresh])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => loadDashboard(true), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [autoRefresh, loadDashboard])

  // Persist cards to localStorage when they change
  useEffect(() => {
    if (cards.length > 0) {
      safeSetJSON(storageKey, cards)
    }
  }, [cards, storageKey])

  // Card operations
  const handleAddCards = async (newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    const cardsToAdd = newCards.map((c, index) => ({
      id: `card-${Date.now()}-${index}`,
      card_type: c.type,
      title: c.title,
      config: c.config,
      position: { x: 0, y: 0, w: 4, h: 2 }
    }))

    // Add to local state
    snapshot(cardsRef.current)
    const idx = insertAtIndexRef.current
    if (idx !== null) {
      setCards(prev => [...prev.slice(0, idx), ...cardsToAdd, ...prev.slice(idx)])
      setInsertAtIndex(null)
    } else {
      setCards(prev => [...cardsToAdd, ...prev])
    }

    // Persist to backend
    if (id) {
      for (const card of cardsToAdd) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error: unknown) {
          console.error('Failed to persist card:', error)
          showToast(t('dashboard.toast.persistFailed', 'Failed to persist card to backend'), 'error')
        }
      }
    }

    closeAddCard()
    showToast(t('dashboard.toast.cardsAdded', 'Added {{count}} card(s)', { count: newCards.length }), 'success')
  }

  const handleRemoveCard = async (cardId: string) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.filter(c => c.id !== cardId))

    if (id) {
      try {
        await api.delete(`/api/dashboards/${id}/cards/${cardId}`)
      } catch (error: unknown) {
        // Card is already removed from UI state above — backend failure is
        // non-critical. Log for debugging but don't alarm the user. (#8564)
        console.debug('Backend card deletion failed (card already removed from UI):', error)
      }
    }
  }

  const handleConfigureCard = (card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }

  const handleCardConfigured = async (cardId: string, config: Record<string, unknown>) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, config } : c
    ))
    closeConfigureCard()
    setSelectedCard(null)
  }

  const handleWidthChange = (cardId: string, newWidth: number) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...c.position, w: newWidth } } : c
    ))
  }

  const handleHeightChange = (cardId: string, newHeight: number) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, position: { ...c.position, h: newHeight } } : c
    ))
  }

  const handleApplyTemplate = async (template: DashboardTemplate) => {
    const templateCards = template.cards.map((tc, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: tc.card_type,
      title: tc.title,
      config: tc.config || {},
      position: { x: 0, y: 0, w: tc.position?.w || 4, h: tc.position?.h || 2 }
    }))

    snapshot(cardsRef.current)
    setCards(templateCards)
    closeTemplates()

    // Persist to backend
    if (id) {
      for (const card of templateCards) {
        try {
          await api.post(`/api/dashboards/${id}/cards`, card)
        } catch (error: unknown) {
          console.error('Failed to persist template card:', error)
          showToast(t('dashboard.toast.persistTemplateFailed', 'Failed to persist template card'), 'error')
        }
      }
    }

    showToast(t('dashboard.toast.templateApplied', 'Applied "{{name}}" template with {{count}} cards', { name: template.name, count: templateCards.length }), 'success')
  }

  const handleAddRecommendedCard = (cardType: string, config?: Record<string, unknown>) => {
    handleAddCards([{ type: cardType, title: formatCardTitle(cardType), config: config || {} }])
  }

  const handleReset = () => {
    snapshot(cardsRef.current)
    setCards([])
    safeRemoveItem(storageKey)
    showToast(t('dashboard.toast.resetToEmpty', 'Dashboard reset to empty'), 'info')
  }

  const handleDeleteDashboard = () => {
    if (!id) return

    // Remove sidebar item
    if (sidebarItem) {
      removeItem(sidebarItem.id)
    }

    // Remove local card storage
    safeRemoveItem(storageKey)

    const displayName = sidebarItem?.name || dashboard?.name || 'this dashboard'
    showToast(t('dashboard.toast.deleted', 'Deleted "{{name}}"', { name: displayName }), 'success')
    navigate(ROUTES.HOME)

    // Try to delete from backend in the background (may fail offline)
    deleteDashboard(id).catch((err) => {
      // Backend deletion is optional — sidebar + localStorage are the source of truth
      console.error('[CustomDashboard] backend delete failed (non-critical):', err)
      showToast(t('dashboard.toast.deleteBackendFailed', 'Deleted locally, but failed to sync dashboard deletion to the backend'), 'warning')
    })
  }

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      snapshot(cardsRef.current)
      setCards(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  // Current card types for recommendations
  const currentCardTypes = cards.map(c => {
    if (c.card_type === 'dynamic_card' && c.config?.dynamicCardId) {
      return `dynamic_card::${c.config.dynamicCardId as string}`
    }
    return c.card_type
  })

  // Loading skeleton
  if (isLoading && cards.length === 0) {
    return (
      <div className="pt-16">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-secondary/50 rounded" />
          <div className="h-4 w-96 bg-secondary/30 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
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
        showTimestamp={false}
        afterTitle={<DashboardHealthIndicator />}
        rightExtra={
          <button
            onClick={() => openDeleteConfirm()}
            className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
            title={t('dashboard.delete.title')}
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

      {/* Empty state or card grid */}
      {cards.length === 0 ? (
        <DashboardEmptyState
          onAddCard={() => openAddCard()}
          onOpenTemplates={() => openTemplates()}
        />
      ) : (
        /* Card grid with drag and drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 auto-rows-min grid-flow-dense">
              {cards.map((card, index) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  onConfigure={() => handleConfigureCard(card)}
                  onRemove={() => handleRemoveCard(card.id)}
                  onWidthChange={(w) => handleWidthChange(card.id, w)}
                  onHeightChange={(h) => handleHeightChange(card.id, h)}
                  isDragging={activeId === card.id}
                  isRefreshing={isRefreshing}
                  onRefresh={triggerRefresh}
                  lastUpdated={lastUpdated}
                  onInsertBefore={() => { setInsertAtIndex(index); openAddCard() }}
                  onInsertAfter={() => { setInsertAtIndex(index + 1); openAddCard() }}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              (() => {
                const dragCard = cards.find(c => c.id === activeId)
                return dragCard ? (
                  <div className="opacity-80 rotate-3 scale-105">
                    <DragPreviewCard card={dragCard} />
                  </div>
                ) : null
              })()
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => openAddCard()}
        onOpenTemplates={() => openTemplates()}
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
            safeRevokeObjectURL(url)
            showToast(t('dashboard.toast.exported', 'Dashboard exported'), 'success')
          } catch {
            showToast(t('dashboard.toast.exportFailed', 'Failed to export dashboard'), 'error')
          }
        } : undefined}
        onImport={async (json) => {
          try {
            await importDashboard(json)
            showToast(t('dashboard.toast.imported', 'Dashboard imported'), 'success')
          } catch {
            showToast(t('dashboard.toast.importFailed', 'Failed to import dashboard'), 'error')
          }
        }}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={isAddCardOpen}
        onClose={() => { closeAddCard(); setInsertAtIndex(null) }}
        onAddCards={handleAddCards}
        existingCardTypes={currentCardTypes}
      />

      {/* Configure Card Modal */}
      <ConfigureCardModal
        isOpen={isConfigureCardOpen}
        card={selectedCard}
        onClose={() => {
          closeConfigureCard()
          setSelectedCard(null)
        }}
        onSave={handleCardConfigured}
      />

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={isTemplatesOpen}
        onClose={closeTemplates}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* Delete Confirmation Modal */}
      <DashboardDeleteModal
        isOpen={isDeleteConfirmOpen}
        onClose={closeDeleteConfirm}
        onConfirm={() => {
          closeDeleteConfirm()
          handleDeleteDashboard()
        }}
        dashboardName={sidebarItem?.name || dashboard?.name || 'this dashboard'}
      />
    </div>
  )
}
