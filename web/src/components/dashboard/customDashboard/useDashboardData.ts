import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, BackendUnavailableError, UnauthenticatedError } from '../../../lib/api'
import { useDashboards, Dashboard } from '../../../hooks/useDashboards'
import { useToast } from '../../ui/Toast'
import { safeGetJSON, safeSetJSON, safeRemoveItem } from '../../../lib/utils/localStorage'
import { ROUTES } from '../../../config/routes'
import { POLL_INTERVAL_MS } from '../../../lib/constants/network'
import type { DashboardTemplate } from '../templates'
import { formatCardTitle } from '../../../lib/formatCardTitle'
import { useRefreshIndicator } from '../../../hooks/useRefreshIndicator'
import { useDashboardUndoRedo } from '../../../hooks/useUndoRedo'
import { setAutoRefreshPaused } from '../../../lib/cache'
import { safeRevokeObjectURL } from '../../../lib/download'
import type { SidebarItem } from '../../../hooks/useSidebarConfig'
import type { Card } from './types'
import type { TFunction } from 'i18next'

interface UseDashboardDataOptions {
  id: string | undefined
  isActiveDashboard: boolean
  sidebarItem: SidebarItem | undefined
  removeItem: (itemId: string) => void
  t: TFunction
}

/**
 * Owns dashboard/card state, persistence (backend + localStorage), and all
 * card CRUD handlers for CustomDashboard. Extracted from CustomDashboard.tsx
 * to separate data/state management from rendering.
 */
export function useDashboardData({ id, isActiveDashboard, sidebarItem, removeItem, t }: UseDashboardDataOptions) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { getDashboardWithCards, deleteDashboard, exportDashboard, importDashboard } = useDashboards()

  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dataRefreshing, setIsRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)

  // Inline card insertion
  const [insertAtIndex, setInsertAtIndex] = useState<number | null>(null)
  const insertAtIndexRef = useRef<number | null>(null)
  insertAtIndexRef.current = insertAtIndex

  // Storage key for this dashboard's cards
  const storageKey = `kubestellar-custom-dashboard-${id}-cards`

  // Request ID tracking — prevents stale async responses from overwriting newer state (#4664)
  const requestIdRef = useRef(0)

  // Undo/redo support
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const { snapshot, undo, redo, canUndo, canRedo } = useDashboardUndoRedo<Card>(
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
  }, [id, getDashboardWithCards, showToast, storageKey, t])

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
  const handleAddCards = async (
    newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>,
    closeAddCard: () => void,
  ) => {
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

  const handleConfigureCard = (card: Card, openConfigureCard: () => void) => {
    setSelectedCard(card)
    openConfigureCard()
  }

  const handleCardConfigured = async (
    cardId: string,
    config: Record<string, unknown>,
    closeConfigureCard: () => void,
  ) => {
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

  const handleApplyTemplate = async (template: DashboardTemplate, closeTemplates: () => void) => {
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

  const handleAddRecommendedCard = (
    cardType: string,
    config: Record<string, unknown> | undefined,
    closeAddCard: () => void,
  ) => {
    handleAddCards([{ type: cardType, title: formatCardTitle(cardType), config: config || {} }], closeAddCard)
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

  const handleExportDashboard = async () => {
    if (!id) return
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
  }

  const handleImportDashboard = async (json: unknown) => {
    try {
      await importDashboard(json)
      showToast(t('dashboard.toast.imported', 'Dashboard imported'), 'success')
    } catch {
      showToast(t('dashboard.toast.importFailed', 'Failed to import dashboard'), 'error')
    }
  }

  return {
    dashboard,
    cards,
    setCards,
    cardsRef,
    isLoading,
    isRefreshing,
    isFetching,
    autoRefresh,
    setAutoRefresh,
    lastUpdated,
    triggerRefresh,
    storageKey,
    selectedCard,
    setSelectedCard,
    insertAtIndex,
    setInsertAtIndex,
    snapshot,
    undo,
    redo,
    canUndo,
    canRedo,
    handleExportDashboard,
    handleImportDashboard,
    handleAddCards,
    handleRemoveCard,
    handleConfigureCard,
    handleCardConfigured,
    handleWidthChange,
    handleHeightChange,
    handleApplyTemplate,
    handleAddRecommendedCard,
    handleReset,
    handleDeleteDashboard,
  }
}
