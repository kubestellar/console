/**
 * useUnifiedDashboardState - modal state, card mutation handlers and tab
 * state for UnifiedDashboard.
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979). Card persistence
 * lives in useDashboardCardStorage; pure helpers in UnifiedDashboard.utils.
 */

import { useState, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  UnifiedDashboardConfig,
  DashboardCardPlacement } from '../../types'
import { prefetchCardChunks } from '../../../../components/cards/cardRegistry'
import { SHORT_DELAY_MS } from '../../../constants/network'
import { useModalState } from '../../../modals'
import { useToast } from '../../../../components/ui/Toast'
import { moveFocusByKey } from '../../../a11y/rovingFocus'
import type { CardSuggestion, ConfigurableCard } from '../UnifiedDashboard.types'
import {
  TAB_SLOT_SUFFIX,
  tabSlotPrefix,
  computeIsCustomized } from '../UnifiedDashboard.utils'
import { useDashboardCardStorage } from './useDashboardCardStorage'

export function useUnifiedDashboardState(config: UnifiedDashboardConfig) {
  const { t } = useTranslation('common')
  const { showToast } = useToast()
  // Tab state (for dashboards with tabs) — needed by the cards initializer
  // to route persistence differently in tab-mode dashboards.
  const hasTabs = (config.tabs?.length ?? 0) > 0

  const {
    cards,
    setCards,
    tabCards,
    setTabCards,
    dashboardError,
    setDashboardError } = useDashboardCardStorage(config, hasTabs)

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (!config.tabs || config.tabs.length === 0) return ''
    // Default to first non-disabled tab
    const firstEnabled = config.tabs.find(tab => !tab.disabled)
    return firstEnabled?.id ?? config.tabs[0].id
  })

  // Prefetch card chunks for this dashboard so React.lazy() resolves instantly
  useEffect(() => {
    // Prefetch cards for all tabs (not just active) so tab switching is instant
    const allCards = hasTabs
      ? Object.values(tabCards).flat()
      : cards
    prefetchCardChunks(allCards.map(c => c.cardType))
  }, [cards, hasTabs, tabCards])

  // Get cards for the active tab (or all cards if no tabs)
  const activeCards = hasTabs ? (tabCards[activeTabId] ?? []) : cards

  // Loading state
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Modal state
  const addCardModal = useModalState()
  const configureCardModal = useModalState()
  const [cardToEdit, setCardToEdit] = useState<ConfigurableCard | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showRemoveCardConfirm, setShowRemoveCardConfirm] = useState(false)
  const [cardToRemove, setCardToRemove] = useState<{ id: string; title?: string } | null>(null)

  // #6709 — Helper that mutates either the active tab's cards or the flat
  // `cards` state, depending on dashboard mode. All card mutators go
  // through this so tab-mode dashboards stay in sync.
  const mutateActiveCards = (
    updater: (prev: DashboardCardPlacement[]) => DashboardCardPlacement[]
  ) => {
    if (hasTabs) {
      setTabCards((prev) => ({
        ...prev,
        [activeTabId]: updater(prev[activeTabId] ?? []) }))
    } else {
      setCards(updater)
    }
  }

  // Handle card reorder
  const handleReorder = (newCards: DashboardCardPlacement[]) => {
    mutateActiveCards(() => newCards)
  }

  // Handle tab keyboard navigation — arrow keys move focus and activate tab
  const handleTabListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nextEl = moveFocusByKey(event, { selector: '[role="tab"]:not([disabled])', orientation: 'horizontal' })
    if (nextEl instanceof HTMLElement) {
      const tabId = nextEl.dataset.tabId
      if (tabId) setActiveTabId(tabId)
    }
  }

  // Handle card removal - show confirmation first
  const handleRemoveCard = (cardId: string) => {
    const card = activeCards.find((c) => c.id === cardId)
    setCardToRemove({ id: cardId, title: card?.title })
    setShowRemoveCardConfirm(true)
  }

  // Handle confirmed card removal
  const handleRemoveCardConfirmed = () => {
    if (cardToRemove) {
      mutateActiveCards((prev) => prev.filter((c) => c.id !== cardToRemove.id))
    }
    setShowRemoveCardConfirm(false)
    setCardToRemove(null)
  }

  // Handle card configuration
  const handleConfigureCard = (cardId: string) => {
    const card = activeCards.find((c) => c.id === cardId)
    if (card) {
      setCardToEdit({
        id: card.id,
        card_type: card.cardType,
        config: card.config || {},
        title: card.title })
      configureCardModal.open()
    }
  }

  // Handle refresh
  const handleRefresh = async () => {
    setIsLoading(true)
    // Simulate refresh - in real implementation this would trigger data refetch
    await new Promise((resolve) => setTimeout(resolve, SHORT_DELAY_MS))
    setLastUpdated(new Date())
    setIsLoading(false)
  }

  // Handle add card
  const handleAddCard = () => {
    addCardModal.open()
  }

  // Handle adding cards from AddCardModal
  const handleAddCards = (newCards: CardSuggestion[]) => {
    mutateActiveCards((prev) => {
      const additions: DashboardCardPlacement[] = newCards.map((card, index) => ({
        id: `${card.type}-${Date.now()}-${index}`,
        cardType: card.type,
        title: card.title,
        config: card.config,
        position: {
          x: (prev.length + index) % 12, // Simple grid placement
          y: Math.floor((prev.length + index) / 2) * 3, // Stack rows
          w: 6, // Default width
          h: 3, // Default height
        } }))
      return [...prev, ...additions]
    })
    addCardModal.close()
  }

  // Handle saving card configuration
  const handleSaveCardConfig = (cardId: string, newConfig: Record<string, unknown>, title?: string) => {
    mutateActiveCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              config: { ...card.config, ...newConfig },
              title: title || card.title }
          : card
      )
    )
    setCardToEdit(null)
    configureCardModal.close()
  }

  // Handle reset to defaults
  const handleResetRequest = () => {
    setShowResetConfirm(true)
  }

  const handleResetConfirmed = () => {
    setCards(config.cards)
    if (config.storageKey) {
      try {
        localStorage.removeItem(config.storageKey)
        // #6758 — Also clear per-tab card slots written by the
        // persistence effect in useDashboardCardStorage. Without this,
        // Reset would restore the flat `cards` state but leave stale
        // tab-mode placements in localStorage, which would reseed on the
        // next mount and silently undo the reset for tab-mode dashboards.
        const prefix = tabSlotPrefix(config.storageKey)
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix) && k.endsWith(TAB_SLOT_SUFFIX)) {
            keysToRemove.push(k)
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k)
        }
        // Also clear the in-memory tabCards so the reset is visible
        // immediately without a reload.
        if (hasTabs) {
          const seeded: Record<string, DashboardCardPlacement[]> = {}
          for (const tab of (config.tabs ?? [])) {
            seeded[tab.id] = tab.cards ?? []
          }
          setTabCards(seeded)
        }
        setDashboardError(null)
        showToast(t('dashboard.resetSuccess', 'Dashboard layout reset to defaults'), 'success')
      } catch (error) {
        console.error('Failed to reset unified dashboard layout', error)
        setDashboardError(t('errors.storagePersistFailed'))
      }
    }
    setShowResetConfirm(false)
  }

  const isCustomized = computeIsCustomized(config, hasTabs, cards, tabCards)

  return {
    hasTabs,
    cards,
    activeCards,
    activeTabId,
    setActiveTabId,
    dashboardError,
    isLoading,
    lastUpdated,
    isCustomized,
    addCardModal,
    configureCardModal,
    cardToEdit,
    setCardToEdit,
    showResetConfirm,
    setShowResetConfirm,
    showRemoveCardConfirm,
    setShowRemoveCardConfirm,
    cardToRemove,
    setCardToRemove,
    handleReorder,
    handleTabListKeyDown,
    handleRemoveCard,
    handleRemoveCardConfirmed,
    handleConfigureCard,
    handleRefresh,
    handleAddCard,
    handleAddCards,
    handleSaveCardConfig,
    handleResetRequest,
    handleResetConfirmed,
  }
}
