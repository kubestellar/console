import { useState, useEffect, useCallback, useMemo, useRef, SetStateAction } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { dashboardSync } from './dashboardSync'
import { DashboardCard, DashboardCardPlacement, NewCardInput } from './types'
import { useDashboardUndoRedo } from '../../hooks/useUndoRedo'
import { setAutoRefreshPaused } from '../cache'

// Re-export dashboardSync for use in auth context (clear cache on logout)
export { dashboardSync } from './dashboardSync'

// ============================================================================
// useDashboardDnD - Drag and drop hook
// ============================================================================

/**
 * Provides drag and drop functionality for dashboard cards.
 * Extracts the 100% duplicated DnD setup code from all 20 dashboards.
 */
export interface UseDashboardDnDResult {
  /** DnD sensors configuration */
  sensors: ReturnType<typeof useSensors>
  /** Currently dragging item ID */
  activeId: string | null
  /** Data attached to the currently dragged item (from useDraggable) */
  activeDragData: Record<string, unknown> | null
  /** Handle drag start event */
  handleDragStart: (event: DragStartEvent) => void
  /** Handle drag end event */
  handleDragEnd: (event: DragEndEvent) => void
}

export function useDashboardDnD<T extends { id: string }>(
  _items: T[],
  setItems: React.Dispatch<React.SetStateAction<T[]>>
): UseDashboardDnDResult {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<Record<string, unknown> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setActiveDragData(event.active.data.current as Record<string, unknown> | null)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveDragData(null)

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }, [setItems])

  return {
    sensors,
    activeId,
    activeDragData,
    handleDragStart,
    handleDragEnd,
  }
}

// ============================================================================
// useDashboardCards - Card state management hook
// ============================================================================

/**
 * Provides card CRUD operations and localStorage persistence.
 * Replaces duplicated card management code in all dashboards.
 */
export interface UseDashboardCardsResult {
  /** Current cards */
  cards: DashboardCard[]
  /** Set cards directly */
  setCards: React.Dispatch<React.SetStateAction<DashboardCard[]>>
  /** Add new cards */
  addCards: (cards: NewCardInput[]) => void
  /** Remove a card */
  removeCard: (id: string) => void
  /** Update card configuration */
  configureCard: (id: string, config: Record<string, unknown>) => void
  /** Update card width */
  updateCardWidth: (id: string, width: number) => void
  /** Reset to default cards */
  reset: () => void
  /** Whether layout has been customized from defaults */
  isCustomized: boolean
  /** Whether currently syncing with backend */
  isSyncing: boolean
  /** Manually trigger a sync with backend */
  syncWithBackend: () => Promise<void>
  /** Undo last card mutation */
  undo: () => void
  /** Redo last undone mutation */
  redo: () => void
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
}

export function useDashboardCards(
  storageKey: string,
  defaultCards: DashboardCardPlacement[]
): UseDashboardCardsResult {
  // Convert default placements to card instances
  const defaultCardInstances = useMemo(() =>
    defaultCards.map((card, i) => ({
      id: `default-${card.type}-${i}`,
      card_type: card.type,
      config: card.config || {},
      title: card.title,
      position: card.position,
    })),
    [defaultCards]
  )

  // Track if we've done initial sync
  const hasSyncedRef = useRef(false)
  const isInitialLoadRef = useRef(true)

  // Load cards from localStorage initially (fast), then sync with backend
  const [cards, setCards] = useState<DashboardCard[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch {
      // Fall through to return defaults
    }
    return defaultCardInstances
  })

  const [isSyncing, setIsSyncing] = useState(false)

  // Compute isCustomized by comparing current card types to defaults
  const isCustomized = useMemo(() => {
    if (cards.length !== defaultCardInstances.length) return true
    const currentTypes = cards.map(c => c.card_type).sort()
    const defaultTypes = defaultCardInstances.map(c => c.card_type).sort()
    return currentTypes.some((t, i) => t !== defaultTypes[i])
  }, [cards, defaultCardInstances])

  // On mount, sync with backend if authenticated
  useEffect(() => {
    if (hasSyncedRef.current) return
    hasSyncedRef.current = true

    const syncWithBackend = async () => {
      if (!dashboardSync.isAuthenticated()) return

      setIsSyncing(true)
      try {
        const backendCards = await dashboardSync.fullSync(storageKey)
        if (backendCards && backendCards.length > 0) {
          setCards(backendCards)
        }
      } catch (err) {
        console.error('[useDashboardCards] Backend sync failed:', err)
      } finally {
        setIsSyncing(false)
        isInitialLoadRef.current = false
      }
    }

    syncWithBackend()
  }, [storageKey])

  // Save cards to localStorage and sync to backend when they change
  useEffect(() => {
    // Skip initial load to avoid re-saving what we just loaded
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      return
    }

    // Always save to localStorage (fast, works offline)
    localStorage.setItem(storageKey, JSON.stringify(cards))

    // Sync to backend (debounced in the sync service)
    dashboardSync.saveCards(storageKey, cards)
  }, [cards, storageKey])

  // Ref to always have current cards for undo/redo without stale closures
  const cardsRef = useRef(cards)
  cardsRef.current = cards

  // Undo/redo support
  const {
    snapshot, undo, redo, canUndo, canRedo,
  } = useDashboardUndoRedo<DashboardCard>(
    (restored) => setCards(restored),
    () => cardsRef.current,
  )

  // Wrapper that snapshots before calling setCards
  const setCardsWithSnapshot = useCallback((action: SetStateAction<DashboardCard[]>) => {
    snapshot(cardsRef.current)
    setCards(action)
  }, [snapshot])

  // Generate unique ID for new cards
  const generateId = useCallback(() =>
    `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    []
  )

  const addCards = useCallback((newCards: NewCardInput[]) => {
    // Batch card additions to prevent UI freeze when adding many cards
    const BATCH_SIZE = 5 // Add 5 cards at a time
    const BATCH_DELAY = 50 // 50ms between batches

    const cardsToAdd: DashboardCard[] = newCards.map(card => ({
      id: generateId(),
      card_type: card.type,
      config: card.config || {},
      title: card.title,
    }))

    snapshot(cardsRef.current)

    // If small number of cards, add all at once
    if (cardsToAdd.length <= BATCH_SIZE) {
      setCards(prev => [...cardsToAdd, ...prev])
      return
    }

    // For many cards, add in batches to keep UI responsive
    let currentIndex = 0
    const addBatch = () => {
      const batch = cardsToAdd.slice(currentIndex, currentIndex + BATCH_SIZE)
      if (batch.length === 0) return

      setCards(prev => [...batch, ...prev])
      currentIndex += BATCH_SIZE

      if (currentIndex < cardsToAdd.length) {
        setTimeout(addBatch, BATCH_DELAY)
      }
    }
    addBatch()
  }, [generateId, snapshot])

  const removeCard = useCallback((id: string) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.filter(c => c.id !== id))
  }, [snapshot])

  const configureCard = useCallback((id: string, config: Record<string, unknown>) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === id ? { ...c, config } : c
    ))
  }, [snapshot])

  const updateCardWidth = useCallback((id: string, width: number) => {
    snapshot(cardsRef.current)
    setCards(prev => prev.map(c =>
      c.id === id
        ? { ...c, position: { ...(c.position || { w: 4, h: 2 }), w: width } }
        : c
    ))
  }, [snapshot])

  const reset = useCallback(() => {
    snapshot(cardsRef.current)
    setCards(defaultCardInstances)
  }, [defaultCardInstances, snapshot])

  // Manual sync with backend
  const syncWithBackend = useCallback(async () => {
    if (!dashboardSync.isAuthenticated()) return

    setIsSyncing(true)
    try {
      const backendCards = await dashboardSync.fullSync(storageKey)
      if (backendCards && backendCards.length > 0) {
        setCards(backendCards)
      }
    } catch (err) {
      console.error('[useDashboardCards] Backend sync failed:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [storageKey])

  return {
    cards,
    setCards: setCardsWithSnapshot,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    isSyncing,
    syncWithBackend,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}

// ============================================================================
// useDashboardAutoRefresh - Auto-refresh hook
// ============================================================================

export interface UseDashboardAutoRefreshResult {
  /** Whether auto-refresh is enabled */
  autoRefresh: boolean
  /** Toggle auto-refresh */
  setAutoRefresh: (enabled: boolean) => void
}

export function useDashboardAutoRefresh(
  refreshFn: () => void,
  interval: number = 30000,
  initialEnabled: boolean = true
): UseDashboardAutoRefreshResult {
  const [autoRefresh, setAutoRefresh] = useState(initialEnabled)

  // Propagate auto-refresh state to global cache layer so card-level
  // cache intervals are also paused when the user unchecks "Auto".
  useEffect(() => {
    setAutoRefreshPaused(!autoRefresh)
    return () => { setAutoRefreshPaused(false) }
  }, [autoRefresh])

  useEffect(() => {
    if (!autoRefresh) return

    const timer = setInterval(refreshFn, interval)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshFn, interval])

  return { autoRefresh, setAutoRefresh }
}

// ============================================================================
// useDashboardModals - Modal state management
// ============================================================================

export interface UseDashboardModalsResult {
  /** Add card modal state */
  showAddCard: boolean
  setShowAddCard: (show: boolean) => void
  /** Templates modal state */
  showTemplates: boolean
  setShowTemplates: (show: boolean) => void
  /** Card being configured */
  configuringCard: DashboardCard | null
  setConfiguringCard: (card: DashboardCard | null) => void
  /** Open configure modal for a card (uses internal ref — no cards param needed) */
  openConfigureCard: (cardId: string) => void
  /** Close configure modal and optionally save */
  closeConfigureCard: () => void
  /** Set the cards ref (called by useDashboard to wire cards without deps) */
  _setCardsRef: (cards: DashboardCard[]) => void
}

export function useDashboardModals(): UseDashboardModalsResult {
  const [showAddCard, setShowAddCard] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<DashboardCard | null>(null)

  // Use a ref so openConfigureCard is stable (no cards in deps)
  const cardsRef = useRef<DashboardCard[]>([])

  const _setCardsRef = useCallback((cards: DashboardCard[]) => {
    cardsRef.current = cards
  }, [])

  const openConfigureCard = useCallback((cardId: string) => {
    const card = cardsRef.current.find(c => c.id === cardId)
    if (card) setConfiguringCard(card)
  }, [])

  const closeConfigureCard = useCallback(() => {
    setConfiguringCard(null)
  }, [])

  return {
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    closeConfigureCard,
    _setCardsRef,
  }
}

// ============================================================================
// useDashboardShowCards - Card visibility state
// ============================================================================

export interface UseDashboardShowCardsResult {
  /** Whether cards section is expanded */
  showCards: boolean
  /** Set cards visibility */
  setShowCards: (show: boolean) => void
  /** Expand cards section */
  expandCards: () => void
  /** Collapse cards section */
  collapseCards: () => void
}

export function useDashboardShowCards(storageKey: string): UseDashboardShowCardsResult {
  const [showCards, setShowCards] = useState(() => {
    try {
      const stored = localStorage.getItem(`${storageKey}-cards-visible`)
      return stored !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    localStorage.setItem(`${storageKey}-cards-visible`, String(showCards))
  }, [showCards, storageKey])

  const expandCards = useCallback(() => setShowCards(true), [])
  const collapseCards = useCallback(() => setShowCards(false), [])

  return {
    showCards,
    setShowCards,
    expandCards,
    collapseCards,
  }
}

// ============================================================================
// useDashboard - Combined dashboard hook
// ============================================================================

/**
 * Combined hook that provides all dashboard functionality.
 * This is the main hook for building dashboards.
 */
export interface UseDashboardOptions {
  /** localStorage key for cards */
  storageKey: string
  /** Default card placements */
  defaultCards: DashboardCardPlacement[]
  /** Refresh function for auto-refresh */
  onRefresh?: () => void
  /** Auto-refresh interval in ms */
  autoRefreshInterval?: number
}

export interface UseDashboardResult
  extends UseDashboardCardsResult,
    UseDashboardModalsResult,
    UseDashboardShowCardsResult {
  /** DnD state and handlers */
  dnd: UseDashboardDnDResult
  /** Auto-refresh state */
  autoRefresh: boolean
  setAutoRefresh: (enabled: boolean) => void
  /** Whether currently syncing with backend */
  isSyncing: boolean
  /** Manually trigger a sync with backend */
  syncWithBackend: () => Promise<void>
}

export function useDashboard(options: UseDashboardOptions): UseDashboardResult {
  const { storageKey, defaultCards, onRefresh, autoRefreshInterval = 30000 } = options

  // Card management
  const cardState = useDashboardCards(storageKey, defaultCards)

  // DnD
  const dnd = useDashboardDnD(cardState.cards, cardState.setCards)

  // Modals
  const modals = useDashboardModals()

  // Keep the modals cards ref in sync so openConfigureCard doesn't need cards as a dep
  modals._setCardsRef(cardState.cards)

  // Card visibility
  const showCardsState = useDashboardShowCards(storageKey)

  // Auto-refresh
  const refreshState = useDashboardAutoRefresh(
    onRefresh || (() => {}),
    autoRefreshInterval
  )

  return {
    ...cardState,
    ...modals,
    ...showCardsState,
    dnd,
    ...refreshState,
  }
}
