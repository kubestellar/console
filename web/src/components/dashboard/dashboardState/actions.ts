import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { TFunction } from 'i18next'
import { api } from '../../../lib/api'
import { emitCardAdded, emitCardRemoved, emitCardConfigured } from '../../../lib/analytics'
import type { Card } from '../dashboardUtils'
import { isLocalOnlyCard, mapVisualizationToCardType, getDefaultCardSize } from '../dashboardUtils'
import type { DashboardTemplate } from '../templates'

interface DashboardCardActionsParams {
  dashboardId?: string
  dashboardName?: string
  localCards: Card[]
  insertAtIndex: number | null
  setInsertAtIndex: (index: number | null) => void
  setLocalCards: Dispatch<SetStateAction<Card[]>>
  setSelectedCard: Dispatch<SetStateAction<Card | null>>
  openConfigureCard: () => void
  closeConfigureCard: () => void
  snapshot: (state: Card[]) => void
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void
  t: TFunction
  recordCardRemoved: (id: string, type: string, title: string | undefined, config: Record<string, unknown>, dashboardId?: string, dashboardName?: string) => void
  recordCardAdded: (id: string, type: string, title: string | undefined, config: Record<string, unknown>, dashboardId?: string, dashboardName?: string) => void
  recordCardConfigured: (id: string, type: string, title: string | undefined, config: Record<string, unknown>, dashboardId?: string, dashboardName?: string) => void
}

export function useDashboardCardActions({
  dashboardId,
  dashboardName,
  localCards,
  insertAtIndex,
  setInsertAtIndex,
  setLocalCards,
  setSelectedCard,
  openConfigureCard,
  closeConfigureCard,
  snapshot,
  showToast,
  t,
  recordCardRemoved,
  recordCardAdded,
  recordCardConfigured,
}: DashboardCardActionsParams) {
  const handleAddCards = useCallback(async (suggestions: Array<{
    type: string
    title: string
    visualization: string
    config: Record<string, unknown>
  }>) => {
    const newCards: Card[] = suggestions.map((suggestion, index) => {
      const cardType = mapVisualizationToCardType(suggestion.visualization, suggestion.type)
      const size = getDefaultCardSize(cardType)
      return {
        id: `new-${Date.now()}-${index}`,
        card_type: cardType,
        config: suggestion.config,
        position: { x: 0, y: 0, ...size },
        title: suggestion.title,
      }
    })

    newCards.forEach(card => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboardId, dashboardName)
      emitCardAdded(card.card_type, 'add_modal')
    })

    snapshot(localCards)
    if (insertAtIndex !== null) {
      setLocalCards(prev => [...prev.slice(0, insertAtIndex), ...newCards, ...prev.slice(insertAtIndex)])
      setInsertAtIndex(null)
    } else {
      setLocalCards(prev => [...newCards, ...prev])
    }

    if (dashboardId) {
      for (const card of newCards) {
        try {
          await api.post(`/api/dashboards/${dashboardId}/cards`, card)
        } catch (error: unknown) {
          console.error('Failed to persist card:', error)
          showToast(t('dashboard.toast.persistFailed', 'Failed to persist card to backend'), 'error')
        }
      }
    }
  }, [dashboardId, dashboardName, insertAtIndex, localCards, recordCardAdded, setInsertAtIndex, setLocalCards, showToast, snapshot, t])

  const handleRemoveCard = useCallback(async (cardId: string) => {
    const cardToRemove = localCards.find(card => card.id === cardId)
    if (cardToRemove) {
      emitCardRemoved(cardToRemove.card_type)
      recordCardRemoved(
        cardToRemove.id,
        cardToRemove.card_type,
        cardToRemove.title,
        cardToRemove.config,
        dashboardId,
        dashboardName,
      )
    }

    snapshot(localCards)
    setLocalCards(prev => prev.filter(card => card.id !== cardId))

    if (dashboardId) {
      try {
        await api.delete(`/api/cards/${cardId}`)
      } catch (error: unknown) {
        console.debug('Backend card deletion failed (card already removed from UI):', error)
      }
    }
  }, [dashboardId, dashboardName, localCards, recordCardRemoved, setLocalCards, snapshot])

  const handleConfigureCard = useCallback((card: Card) => {
    setSelectedCard(card)
    openConfigureCard()
  }, [openConfigureCard, setSelectedCard])

  const handleWidthChange = useCallback(async (cardId: string, newWidth: number) => {
    snapshot(localCards)
    setLocalCards(prev =>
      prev.map(card =>
        card.id === cardId
          ? { ...card, position: { ...(card.position || { w: 4, h: 2 }), w: newWidth } }
          : card,
      ),
    )

    if (dashboardId && !isLocalOnlyCard(cardId)) {
      try {
        const card = localCards.find(item => item.id === cardId)
        if (card) {
          await api.put(`/api/cards/${cardId}`, {
            position: { ...(card.position || { w: 4, h: 2 }), w: newWidth },
          })
        }
      } catch (error: unknown) {
        console.error('Failed to update card width:', error)
        showToast(t('dashboard.toast.updateWidthFailed', 'Failed to update card width'), 'error')
      }
    }
  }, [dashboardId, localCards, setLocalCards, showToast, snapshot, t])

  const handleHeightChange = useCallback(async (cardId: string, newHeight: number) => {
    snapshot(localCards)
    setLocalCards(prev =>
      prev.map(card =>
        card.id === cardId
          ? { ...card, position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight } }
          : card,
      ),
    )

    if (dashboardId && !isLocalOnlyCard(cardId)) {
      try {
        const card = localCards.find(item => item.id === cardId)
        if (card) {
          await api.put(`/api/cards/${cardId}`, {
            position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight },
          })
        }
      } catch (error: unknown) {
        console.error('Failed to update card height:', error)
        showToast(t('dashboard.toast.updateHeightFailed', 'Failed to update card height'), 'error')
      }
    }
  }, [dashboardId, localCards, setLocalCards, showToast, snapshot, t])

  const handleCardConfigured = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    const card = localCards.find(item => item.id === cardId)
    if (card) {
      emitCardConfigured(card.card_type)
      recordCardConfigured(
        cardId,
        card.card_type,
        newTitle || card.title,
        newConfig,
        dashboardId,
        dashboardName,
      )
    }

    snapshot(localCards)
    setLocalCards(prev =>
      prev.map(item =>
        item.id === cardId
          ? { ...item, config: newConfig, title: newTitle || item.title }
          : item,
      ),
    )
    closeConfigureCard()
    setSelectedCard(null)

    if (dashboardId && !isLocalOnlyCard(cardId)) {
      try {
        await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle })
      } catch (error: unknown) {
        console.error('Failed to update card configuration:', error)
        showToast(t('dashboard.toast.updateConfigFailed', 'Failed to update card configuration'), 'error')
      }
    }
  }, [closeConfigureCard, dashboardId, dashboardName, localCards, recordCardConfigured, setLocalCards, setSelectedCard, showToast, snapshot, t])

  const handleAddRecommendedCard = useCallback((cardType: string, config?: Record<string, unknown>, title?: string) => {
    snapshot(localCards)
    setLocalCards(prev => {
      const existingIndex = prev.findIndex(card => card.card_type === cardType)
      if (existingIndex !== -1) {
        const existingCard = prev[existingIndex]
        const remaining = prev.filter((_, index) => index !== existingIndex)
        return [existingCard, ...remaining]
      }
      const size = getDefaultCardSize(cardType)
      const newCard: Card = {
        id: `rec-${Date.now()}`,
        card_type: cardType,
        config: config || {},
        position: { x: 0, y: 0, ...size },
        title,
      }
      recordCardAdded(newCard.id, cardType, title, config || {}, dashboardId, dashboardName)
      return [newCard, ...prev]
    })
  }, [dashboardId, dashboardName, localCards, recordCardAdded, setLocalCards, snapshot])

  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `ai-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, ...size },
      title,
    }
    recordCardAdded(newCard.id, cardType, title, config, dashboardId, dashboardName)
    snapshot(localCards)
    setLocalCards(prev => [newCard, ...prev])
    closeConfigureCard()
    setSelectedCard(null)
  }, [closeConfigureCard, dashboardId, dashboardName, localCards, recordCardAdded, setLocalCards, setSelectedCard, snapshot])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: Card[] = template.cards.map((templateCard, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: templateCard.card_type,
      config: templateCard.config || {},
      position: { x: 0, y: 0, w: templateCard.position?.w || 4, h: templateCard.position?.h || 2 },
      title: templateCard.title,
    }))

    newCards.forEach(card => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboardId, dashboardName)
    })

    snapshot(localCards)
    setLocalCards(prev => [...newCards, ...prev])
    showToast(t('dashboard.toast.templateApplied', 'Applied "{{name}}" template with {{count}} cards', { name: template.name, count: newCards.length }), 'success')
  }, [dashboardId, dashboardName, localCards, recordCardAdded, setLocalCards, showToast, snapshot, t])

  const handleAddSingleCard = useCallback((cardType: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `rec-${Date.now()}`,
      card_type: cardType,
      config: {},
      position: { x: 0, y: 0, ...size },
    }
    recordCardAdded(newCard.id, cardType, undefined, {}, dashboardId, dashboardName)
    emitCardAdded(cardType, 'smart_suggestion')
    snapshot(localCards)
    setLocalCards(prev => [newCard, ...prev])
  }, [dashboardId, dashboardName, localCards, recordCardAdded, setLocalCards, snapshot])

  return {
    handleAddCards,
    handleRemoveCard,
    handleConfigureCard,
    handleWidthChange,
    handleHeightChange,
    handleCardConfigured,
    handleAddRecommendedCard,
    handleCreateCardFromAI,
    handleApplyTemplate,
    handleAddSingleCard,
  }
}
