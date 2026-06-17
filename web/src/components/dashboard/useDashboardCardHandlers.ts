import { useCallback, useMemo } from 'react'
import { api } from '../../lib/api'
import { safeRevokeObjectURL } from '../../lib/download'
import { emitCardAdded, emitCardRemoved, emitCardConfigured } from '../../lib/analytics'
import { getDefaultCardSize, mapVisualizationToCardType, isLocalOnlyCard } from './dashboardUtils'
import type { Card, DashboardData } from './dashboardUtils'
import type { StudioInitialSection } from '../../hooks/useDashboardContext'
import type { StartMissionParams } from '../../hooks/useMissionTypes'
import type { DashboardTemplate } from './templates'

export interface CardHandlersDeps {
  localCards: Card[]
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>
  snapshot: (cards: Card[]) => void
  dashboard: DashboardData | null
  recordCardAdded: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  recordCardRemoved: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  recordCardConfigured: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  openConfigureCard: () => void
  closeConfigureCard: () => void
  setSelectedCard: React.Dispatch<React.SetStateAction<Card | null>>
  insertAtIndex: number | null
  setInsertAtIndex: React.Dispatch<React.SetStateAction<number | null>>
  openAddCardModal: (section?: StudioInitialSection, widgetCardType?: string) => void
  closeAddCardModal: () => void
  openWidgetExport: () => void
  closeWidgetExport: () => void
  actionNudge: () => void
  activeNudge: string | null
  exportDashboard: (id: string) => Promise<unknown>
  startMission: (params: StartMissionParams) => string
  setAddCardSearch: React.Dispatch<React.SetStateAction<string>>
  setPendingDeploy: React.Dispatch<React.SetStateAction<{ workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[]; groupName: string } | null>>
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
  t: (key: string, fallback?: string, opts?: Record<string, unknown>) => string
}

export function useDashboardCardHandlers({
  localCards,
  setLocalCards,
  snapshot,
  dashboard,
  recordCardAdded,
  recordCardRemoved,
  recordCardConfigured,
  openConfigureCard,
  closeConfigureCard,
  setSelectedCard,
  insertAtIndex,
  setInsertAtIndex,
  openAddCardModal,
  closeAddCardModal,
  openWidgetExport,
  closeWidgetExport,
  actionNudge,
  activeNudge,
  exportDashboard,
  startMission,
  setAddCardSearch,
  setPendingDeploy,
  showToast,
  t,
}: CardHandlersDeps) {

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
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
      emitCardAdded(card.card_type, 'add_modal')
    })
    snapshot(localCards)
    if (insertAtIndex !== null) {
      setLocalCards(prev => [...prev.slice(0, insertAtIndex), ...newCards, ...prev.slice(insertAtIndex)])
      setInsertAtIndex(null)
    } else {
      setLocalCards(prev => [...newCards, ...prev])
    }

    if (dashboard?.id) {
      for (const card of newCards) {
        try {
          await api.post(`/api/dashboards/${dashboard.id}/cards`, card)
        } catch (error: unknown) {
          console.error('Failed to persist card:', error)
          showToast(t('dashboard.toast.persistFailed', 'Failed to persist card to backend'), 'error')
        }
      }
    }
  }, [dashboard?.id, dashboard?.name, insertAtIndex, localCards, recordCardAdded, showToast, snapshot, t])

  const handleRemoveCard = useCallback(async (cardId: string) => {
    const cardToRemove = localCards.find(card => card.id === cardId)
    if (cardToRemove) {
      emitCardRemoved(cardToRemove.card_type)
      recordCardRemoved(
        cardToRemove.id,
        cardToRemove.card_type,
        cardToRemove.title,
        cardToRemove.config,
        dashboard?.id,
        dashboard?.name,
      )
    }
    snapshot(localCards)
    setLocalCards(prev => prev.filter(card => card.id !== cardId))

    if (dashboard?.id) {
      try {
        await api.delete(`/api/cards/${cardId}`)
      } catch (error: unknown) {
        console.debug('Backend card deletion failed (card already removed from UI):', error)
      }
    }
  }, [dashboard?.id, dashboard?.name, localCards, recordCardRemoved, snapshot])

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

    if (dashboard?.id && !isLocalOnlyCard(cardId)) {
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
  }, [dashboard?.id, localCards, showToast, snapshot, t])

  const handleHeightChange = useCallback(async (cardId: string, newHeight: number) => {
    snapshot(localCards)
    setLocalCards(prev =>
      prev.map(card =>
        card.id === cardId
          ? { ...card, position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight } }
          : card,
      ),
    )

    if (dashboard?.id && !isLocalOnlyCard(cardId)) {
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
  }, [dashboard?.id, localCards, showToast, snapshot, t])

  const handleCardConfigured = useCallback(async (cardId: string, newConfig: Record<string, unknown>, newTitle?: string) => {
    const card = localCards.find(item => item.id === cardId)
    if (card) {
      emitCardConfigured(card.card_type)
      recordCardConfigured(
        cardId,
        card.card_type,
        newTitle || card.title,
        newConfig,
        dashboard?.id,
        dashboard?.name,
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

    if (dashboard?.id && !isLocalOnlyCard(cardId)) {
      try {
        await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle })
      } catch (error: unknown) {
        console.error('Failed to update card configuration:', error)
        showToast(t('dashboard.toast.updateConfigFailed', 'Failed to update card configuration'), 'error')
      }
    }
  }, [closeConfigureCard, dashboard?.id, dashboard?.name, localCards, recordCardConfigured, showToast, snapshot, t])

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
      recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
      return [newCard, ...prev]
    })
  }, [dashboard?.id, dashboard?.name, localCards, recordCardAdded, snapshot])

  const handleCreateCardFromAI = useCallback((cardType: string, config: Record<string, unknown>, title?: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `ai-${Date.now()}`,
      card_type: cardType,
      config: config || {},
      position: { x: 0, y: 0, ...size },
      title,
    }
    recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    snapshot(localCards)
    setLocalCards(prev => [newCard, ...prev])
    closeConfigureCard()
    setSelectedCard(null)
  }, [closeConfigureCard, dashboard?.id, dashboard?.name, localCards, recordCardAdded, snapshot])

  const handleApplyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards: Card[] = template.cards.map((templateCard, index) => ({
      id: `template-${Date.now()}-${index}`,
      card_type: templateCard.card_type,
      config: templateCard.config || {},
      position: { x: 0, y: 0, w: templateCard.position?.w || 4, h: templateCard.position?.h || 2 },
      title: templateCard.title,
    }))
    newCards.forEach(card => {
      recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
    })
    snapshot(localCards)
    setLocalCards(prev => [...newCards, ...prev])
    showToast(t('dashboard.toast.templateApplied', 'Applied "{{name}}" template with {{count}} cards', { name: template.name, count: newCards.length }), 'success')
  }, [dashboard?.id, dashboard?.name, localCards, recordCardAdded, showToast, snapshot, t])

  const handleAddSingleCard = useCallback((cardType: string) => {
    const size = getDefaultCardSize(cardType)
    const newCard: Card = {
      id: `rec-${Date.now()}`,
      card_type: cardType,
      config: {},
      position: { x: 0, y: 0, ...size },
    }
    recordCardAdded(newCard.id, cardType, undefined, {}, dashboard?.id, dashboard?.name)
    emitCardAdded(cardType, 'smart_suggestion')
    snapshot(localCards)
    setLocalCards(prev => [newCard, ...prev])
  }, [dashboard?.id, dashboard?.name, localCards, recordCardAdded, snapshot])

  const handleNudgeAction = useCallback(() => {
    if (activeNudge === 'customize') {
      openAddCardModal()
    } else if (activeNudge === 'pwa-install') {
      openWidgetExport()
    }
    actionNudge()
  }, [actionNudge, activeNudge, openAddCardModal, openWidgetExport])

  const currentCardTypes = useMemo(() => localCards.map(card => {
    if (card.card_type === 'dynamic_card' && card.config?.dynamicCardId) {
      return `dynamic_card::${card.config.dynamicCardId as string}`
    }
    return card.card_type
  }), [localCards])

  const handleInsertBefore = useCallback((index: number) => {
    setInsertAtIndex(index)
    openAddCardModal()
  }, [openAddCardModal, setInsertAtIndex])

  const handleInsertAfter = useCallback((index: number) => {
    setInsertAtIndex(index + 1)
    openAddCardModal()
  }, [openAddCardModal, setInsertAtIndex])

  const handleCloseCustomizer = useCallback(() => {
    closeAddCardModal()
    setAddCardSearch('')
    setInsertAtIndex(null)
  }, [closeAddCardModal, setAddCardSearch, setInsertAtIndex])

  const handleCloseConfigureCard = useCallback(() => {
    closeConfigureCard()
    setSelectedCard(null)
  }, [closeConfigureCard, setSelectedCard])

  const handleCloseWidgetExport = useCallback(() => {
    closeWidgetExport()
  }, [closeWidgetExport])

  const handleSetPendingDeploy = useCallback((deploy: { workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[]; groupName: string } | null) => {
    setPendingDeploy(deploy)
  }, [setPendingDeploy])

  const handleOpenDashboardCatalog = useCallback(() => {
    openAddCardModal('dashboards')
  }, [openAddCardModal])

  const handleRunHealthCheck = useCallback(() => {
    startMission({
      title: 'Cluster Health Check',
      description: 'AI-powered audit of your connected clusters',
      type: 'custom',
      initialPrompt: 'Run a comprehensive health check on all my connected clusters. Check for pod issues, resource constraints, and security concerns.',
    })
  }, [startMission])

  const handleExportDashboard = useMemo(() => {
    if (!dashboard?.id) return undefined
    return async () => {
      try {
        const data = await exportDashboard(dashboard.id)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${(dashboard.name || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
        anchor.click()
        safeRevokeObjectURL(url)
        showToast(t('dashboard.toast.exported', 'Dashboard exported'), 'success')
      } catch {
        showToast(t('dashboard.toast.exportFailed', 'Failed to export dashboard'), 'error')
      }
    }
  }, [dashboard?.id, dashboard?.name, exportDashboard, showToast, t])

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
    handleNudgeAction,
    currentCardTypes,
    handleInsertBefore,
    handleInsertAfter,
    handleCloseCustomizer,
    handleCloseConfigureCard,
    handleCloseWidgetExport,
    handleSetPendingDeploy,
    handleOpenDashboardCatalog,
    handleRunHealthCheck,
    handleExportDashboard,
  }
}
