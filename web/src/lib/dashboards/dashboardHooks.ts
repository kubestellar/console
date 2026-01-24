import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { DashboardCard, DashboardCardPlacement, NewCardInput } from './types'

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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

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
  /** Whether layout has been customized */
  isCustomized: boolean
  /** Mark as customized */
  setCustomized: (value: boolean) => void
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

  // Load cards from localStorage or use defaults
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

  const [isCustomized, setCustomized] = useState(false)

  // Save cards to localStorage when they change
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cards))
    setCustomized(true)
  }, [cards, storageKey])

  // Generate unique ID for new cards
  const generateId = useCallback(() =>
    `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    []
  )

  const addCards = useCallback((newCards: NewCardInput[]) => {
    const cardsToAdd: DashboardCard[] = newCards.map(card => ({
      id: generateId(),
      card_type: card.type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(prev => [...prev, ...cardsToAdd])
  }, [generateId])

  const removeCard = useCallback((id: string) => {
    setCards(prev => prev.filter(c => c.id !== id))
  }, [])

  const configureCard = useCallback((id: string, config: Record<string, unknown>) => {
    setCards(prev => prev.map(c =>
      c.id === id ? { ...c, config } : c
    ))
  }, [])

  const updateCardWidth = useCallback((id: string, width: number) => {
    setCards(prev => prev.map(c =>
      c.id === id
        ? { ...c, position: { ...(c.position || { w: 4, h: 2 }), w: width } }
        : c
    ))
  }, [])

  const reset = useCallback(() => {
    setCards(defaultCardInstances)
    setCustomized(false)
  }, [defaultCardInstances])

  return {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    setCustomized,
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
  /** Open configure modal for a card */
  openConfigureCard: (cardId: string, cards: DashboardCard[]) => void
  /** Close configure modal and optionally save */
  closeConfigureCard: () => void
}

export function useDashboardModals(): UseDashboardModalsResult {
  const [showAddCard, setShowAddCard] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [configuringCard, setConfiguringCard] = useState<DashboardCard | null>(null)

  const openConfigureCard = useCallback((cardId: string, cards: DashboardCard[]) => {
    const card = cards.find(c => c.id === cardId)
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
}

export function useDashboard(options: UseDashboardOptions): UseDashboardResult {
  const { storageKey, defaultCards, onRefresh, autoRefreshInterval = 30000 } = options

  // Card management
  const cardState = useDashboardCards(storageKey, defaultCards)

  // DnD
  const dnd = useDashboardDnD(cardState.cards, cardState.setCards)

  // Modals
  const modals = useDashboardModals()

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
