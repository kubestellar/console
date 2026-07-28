/**
 * DashboardState action helper factories.
 *
 * Extracted from DashboardState.ts — see issue #15790 / #21653.
 * Each factory accepts the shared hook dependencies and returns the action function,
 * keeping the closures explicit and the hook body concise.
 */
import { api } from '../../lib/api'
import { safeRevokeObjectURL } from '../../lib/download'
import { emitCardAdded, emitCardRemoved, emitCardDragged, emitCardConfigured } from '../../lib/analytics'
import type { Card, DashboardData } from './dashboardUtils'
import { isLocalOnlyCard, mapVisualizationToCardType, getDefaultCardSize, getDemoCards } from './dashboardUtils'
import type { DashboardTemplate } from './templates'
import { saveDashboardCardsToStorage } from '../../lib/dashboards/dashboardCardStorage'
import { setDashboardCache, patchDashboardCache, initLocalCardsState } from './persistence'
import type { PendingDeploy } from './persistence'
import type { DeployResultPayload } from '../../lib/cardEvents'

export type {
  Card,
  DashboardData,
  DashboardTemplate,
  PendingDeploy,
}

// ---------------------------------------------------------------------------
// Shared action dependency types
// ---------------------------------------------------------------------------

export interface CardActionDeps {
  localCards: Card[]
  dashboard: DashboardData | null
  snapshot: (cards: Card[]) => void
  setLocalCards: React.Dispatch<React.SetStateAction<Card[]>>
  showToast: (message: string, type: 'success' | 'error') => void
  t: (key: string, fallback?: string, opts?: Record<string, unknown>) => string
  recordCardAdded: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  recordCardRemoved: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  recordCardConfigured: (id: string, type: string, title?: string, config?: Record<string, unknown>, dashId?: string, dashName?: string) => void
  closeConfigureCard: () => void
  setSelectedCard: (card: Card | null) => void
  insertAtIndex: number | null
  setInsertAtIndex: (idx: number | null) => void
  openAddCardModal: (section?: string) => void
  moveCardToDashboard: (cardId: string, targetDashboardId: string) => Promise<void>
  createDashboard: (name: string) => Promise<DashboardData | null>
  publishCardEvent: (event: { type: string; payload: unknown }) => void
  deployWorkload: (params: { workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[] }, opts?: { onSuccess?: (result: unknown) => void }) => Promise<void>
  setPendingDeploy: (deploy: PendingDeploy | null) => void
  exportDashboard: (id: string) => Promise<unknown>
  startMission: (params: { title: string; description: string; type: string; initialPrompt: string }) => void
  storageKey: string
}

// ---------------------------------------------------------------------------
// Exported action factories (pure functions, no hooks)
// ---------------------------------------------------------------------------

export async function addCardsAction(
  suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardAdded' | 'insertAtIndex' | 'setInsertAtIndex'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardAdded, insertAtIndex, setInsertAtIndex } = deps
  const newCards: Card[] = suggestions.map((suggestion, index) => {
    const cardType = mapVisualizationToCardType(suggestion.visualization, suggestion.type)
    const size = getDefaultCardSize(cardType)
    return { id: `new-${Date.now()}-${index}`, card_type: cardType, config: suggestion.config, position: { x: 0, y: 0, ...size }, title: suggestion.title }
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
}

export async function removeCardAction(
  cardId: string,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'recordCardRemoved'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, recordCardRemoved } = deps
  const cardToRemove = localCards.find(card => card.id === cardId)
  if (cardToRemove) {
    emitCardRemoved(cardToRemove.card_type)
    recordCardRemoved(cardToRemove.id, cardToRemove.card_type, cardToRemove.title, cardToRemove.config, dashboard?.id, dashboard?.name)
  }
  snapshot(localCards)
  setLocalCards(prev => prev.filter(card => card.id !== cardId))
  if (dashboard?.id) {
    try { await api.delete(`/api/cards/${cardId}`) } catch (error: unknown) {
      console.debug('Backend card deletion failed (card already removed from UI):', error)
    }
  }
}

export async function updateCardWidthAction(
  cardId: string,
  newWidth: number,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'showToast' | 't'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, showToast, t } = deps
  snapshot(localCards)
  setLocalCards(prev => prev.map(card => card.id === cardId ? { ...card, position: { ...(card.position || { w: 4, h: 2 }), w: newWidth } } : card))
  if (dashboard?.id && !isLocalOnlyCard(cardId)) {
    try {
      const card = localCards.find(item => item.id === cardId)
      if (card) await api.put(`/api/cards/${cardId}`, { position: { ...(card.position || { w: 4, h: 2 }), w: newWidth } })
    } catch (error: unknown) {
      console.error('Failed to update card width:', error)
      showToast(t('dashboard.toast.updateWidthFailed', 'Failed to update card width'), 'error')
    }
  }
}

export async function updateCardHeightAction(
  cardId: string,
  newHeight: number,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'showToast' | 't'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, showToast, t } = deps
  snapshot(localCards)
  setLocalCards(prev => prev.map(card => card.id === cardId ? { ...card, position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight } } : card))
  if (dashboard?.id && !isLocalOnlyCard(cardId)) {
    try {
      const card = localCards.find(item => item.id === cardId)
      if (card) await api.put(`/api/cards/${cardId}`, { position: { ...(card.position || { x: 0, y: 0, w: 4, h: 2 }), h: newHeight } })
    } catch (error: unknown) {
      console.error('Failed to update card height:', error)
      showToast(t('dashboard.toast.updateHeightFailed', 'Failed to update card height'), 'error')
    }
  }
}

export async function configureCardAction(
  cardId: string,
  newConfig: Record<string, unknown>,
  newTitle: string | undefined,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardConfigured' | 'closeConfigureCard' | 'setSelectedCard'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardConfigured, closeConfigureCard, setSelectedCard } = deps
  const card = localCards.find(item => item.id === cardId)
  if (card) {
    emitCardConfigured(card.card_type)
    recordCardConfigured(cardId, card.card_type, newTitle || card.title, newConfig, dashboard?.id, dashboard?.name)
  }
  snapshot(localCards)
  setLocalCards(prev => prev.map(item => item.id === cardId ? { ...item, config: newConfig, title: newTitle || item.title } : item))
  closeConfigureCard()
  setSelectedCard(null)
  if (dashboard?.id && !isLocalOnlyCard(cardId)) {
    try { await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle }) } catch (error: unknown) {
      console.error('Failed to update card configuration:', error)
      showToast(t('dashboard.toast.updateConfigFailed', 'Failed to update card configuration'), 'error')
    }
  }
}

export function addRecommendedCardAction(
  cardType: string,
  config: Record<string, unknown> | undefined,
  title: string | undefined,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'recordCardAdded'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, recordCardAdded } = deps
  snapshot(localCards)
  setLocalCards(prev => {
    const existingIndex = prev.findIndex(card => card.card_type === cardType)
    if (existingIndex !== -1) {
      const existingCard = prev[existingIndex]
      return [existingCard, ...prev.filter((_, i) => i !== existingIndex)]
    }
    const size = getDefaultCardSize(cardType)
    const newCard: Card = { id: `rec-${Date.now()}`, card_type: cardType, config: config || {}, position: { x: 0, y: 0, ...size }, title }
    recordCardAdded(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    return [newCard, ...prev]
  })
}

export function applyTemplateAction(
  template: DashboardTemplate,
  deps: Pick<CardActionDeps, 'dashboard' | 'localCards' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardAdded'>,
) {
  const { dashboard, localCards, snapshot, setLocalCards, showToast, t, recordCardAdded } = deps
  const newCards: Card[] = template.cards.map((templateCard, index) => ({
    id: `template-${Date.now()}-${index}`,
    card_type: templateCard.card_type,
    config: templateCard.config || {},
    position: { x: 0, y: 0, w: templateCard.position?.w || 4, h: templateCard.position?.h || 2 },
    title: templateCard.title,
  }))
  newCards.forEach(card => { recordCardAdded(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name) })
  snapshot(localCards)
  setLocalCards(prev => [...newCards, ...prev])
  showToast(t('dashboard.toast.templateApplied', 'Applied "{{name}}" template with {{count}} cards', { name: template.name, count: newCards.length }), 'success')
}

export async function exportDashboardAction(
  dashboardId: string,
  dashboardName: string | undefined,
  deps: Pick<CardActionDeps, 'showToast' | 't' | 'exportDashboard'>,
) {
  const { showToast, t, exportDashboard } = deps
  try {
    const data = await exportDashboard(dashboardId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${(dashboardName || 'dashboard').replace(/\s+/g, '-').toLowerCase()}.json`
    anchor.click()
    safeRevokeObjectURL(url)
    showToast(t('dashboard.toast.exported', 'Dashboard exported'), 'success')
  } catch {
    showToast(t('dashboard.toast.exportFailed', 'Failed to export dashboard'), 'error')
  }
}

// Re-export persistence helpers consumers may need
export { initLocalCardsState, getDemoCards, setDashboardCache, patchDashboardCache, saveDashboardCardsToStorage }
