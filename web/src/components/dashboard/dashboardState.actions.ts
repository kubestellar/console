/**
 * Dashboard action helpers.
 *
 * Extracted from DashboardState.ts as part of the selector/action split
 * (tracked by #15790). Each function here encapsulates a single piece of
 * business logic and accepts all its dependencies explicitly — no React hooks,
 * no closures over external state. The useDashboardState hook wraps these in
 * useCallback for memoisation and wires up the deps.
 */
import { api, BackendUnavailableError, UnauthenticatedError } from '../../lib/api'
import { emitCardAdded, emitCardRemoved, emitCardConfigured } from '../../lib/analytics'
import { safeRevokeObjectURL } from '../../lib/download'
import type { Card, DashboardData } from './dashboardUtils'
import { isLocalOnlyCard, mapVisualizationToCardType, getDefaultCardSize, getDemoCards } from './dashboardUtils'
import { setDashboardCache, patchDashboardCache } from './persistence'
import { saveDashboardCardsToStorage } from '../../lib/dashboards/dashboardCardStorage'
import type { DashboardTemplate } from './templates'
import type { DeployResultPayload, CardEvent } from '../../lib/cardEvents'
import type { TFunction } from 'i18next'
import type { Dispatch, SetStateAction } from 'react'

// ─── Types for dependency injection ─────────────────────────────────────────

export interface LoadDashboardDeps {
  setIsLoading: (v: boolean) => void
  setDashboard: (d: DashboardData | null) => void
  setLocalCards: (fn: (prev: Card[]) => Card[]) => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  t: TFunction
}

export interface CardMutationDeps {
  localCards: Card[]
  dashboard: DashboardData | null
  snapshot: (cards: Card[]) => void
  setLocalCards: Dispatch<SetStateAction<Card[]>>
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  t: TFunction
  recordCardAdded?: (
    id: string,
    cardType: string,
    title: string | undefined,
    config: Record<string, unknown> | undefined,
    dashboardId?: string,
    dashboardName?: string,
  ) => void
  recordCardRemoved?: (
    id: string,
    cardType: string,
    title: string | undefined,
    config: Record<string, unknown> | undefined,
    dashboardId?: string,
    dashboardName?: string,
  ) => void
  recordCardConfigured?: (
    id: string,
    cardType: string,
    title: string | undefined,
    config: Record<string, unknown>,
    dashboardId?: string,
    dashboardName?: string,
  ) => void
  closeConfigureCard?: () => void
}

// ─── Action helpers ──────────────────────────────────────────────────────────

/**
 * Load the default dashboard from the API.
 * Falls back to demo cards when the API returns no dashboards or on error.
 */
export async function loadDashboardData(
  isBackground: boolean,
  _storageKey: string,
  deps: LoadDashboardDeps,
): Promise<void> {
  const { setIsLoading, setDashboard, setLocalCards, showToast, t } = deps
  if (!isBackground) {
    setIsLoading(true)
  }
  try {
    const { data: dashboardsData } = await api.get<DashboardData[]>('/api/dashboards')
    if (dashboardsData && dashboardsData.length > 0) {
      const defaultDashboard = dashboardsData.find(d => d.is_default) || dashboardsData[0]
      const { data } = await api.get<DashboardData>(`/api/dashboards/${defaultDashboard.id}`)
      const apiCards = (data.cards && data.cards.length > 0) ? data.cards : getDemoCards()
      setDashboard(data)

      setLocalCards(prevCards => {
        const apiCardIds = new Set(apiCards.map(card => card.id))
        const localOnlyCards = prevCards.filter(card => isLocalOnlyCard(card.id) && !apiCardIds.has(card.id))
        if (localOnlyCards.length > 0) {
          return [...localOnlyCards, ...apiCards]
        }
        return apiCards
      })
      setDashboardCache({ dashboard: data, cards: apiCards, timestamp: Date.now() })
    } else {
      if (isBackground) {
        return
      }
      const cards = getDemoCards()
      setLocalCards(() => cards)
      setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
    }
  } catch (error: unknown) {
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
      if (!isBackground) {
        showToast(t('dashboard.toast.loadFailed', 'Failed to load dashboard'), 'error')
      }
    }
    if (!isBackground) {
      setLocalCards(prevCards => {
        if (prevCards.length > 0) return prevCards
        const cards = getDemoCards()
        setDashboardCache({ dashboard: null, cards, timestamp: Date.now() })
        return cards
      })
    }
  } finally {
    setIsLoading(false)
  }
}

/**
 * Sync the current local cards to storage whenever they change.
 */
export function persistLocalCards(storageKey: string, localCards: Card[]): void {
  if (localCards.length > 0) {
    patchDashboardCache({ cards: localCards, timestamp: Date.now() })
    saveDashboardCardsToStorage(storageKey, localCards)
  }
}

/**
 * Build the new card objects for an "add cards" operation and persist them
 * to the API.
 */
export async function addCardsToBoard(
  suggestions: Array<{ type: string; title: string; visualization: string; config: Record<string, unknown> }>,
  insertAtIndex: number | null,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardAdded'>,
): Promise<void> {
  const { localCards, dashboard, snapshot, setLocalCards, showToast, t, recordCardAdded } = deps
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
    recordCardAdded?.(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
    emitCardAdded(card.card_type, 'add_modal')
  })
  snapshot(localCards)
  if (insertAtIndex !== null) {
    setLocalCards(prev => [...prev.slice(0, insertAtIndex), ...newCards, ...prev.slice(insertAtIndex)])
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

/**
 * Remove a card from the board and delete it from the API.
 */
export async function removeCardFromBoard(
  cardId: string,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'recordCardRemoved'>,
): Promise<void> {
  const { localCards, dashboard, snapshot, setLocalCards, recordCardRemoved } = deps
  const cardToRemove = localCards.find(card => card.id === cardId)
  if (cardToRemove) {
    emitCardRemoved(cardToRemove.card_type)
    recordCardRemoved?.(
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
}

/**
 * Update a card's grid width locally and persist the change to the API.
 */
export async function updateCardWidth(
  cardId: string,
  newWidth: number,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'showToast' | 't'>,
): Promise<void> {
  const { localCards, dashboard, snapshot, setLocalCards, showToast, t } = deps
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
}

/**
 * Update a card's grid height locally and persist the change to the API.
 */
export async function updateCardHeight(
  cardId: string,
  newHeight: number,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'showToast' | 't'>,
): Promise<void> {
  const { localCards, dashboard, snapshot, setLocalCards, showToast, t } = deps
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
}

/**
 * Persist a card's configuration update to local state and the API.
 */
export async function updateCardConfig(
  cardId: string,
  newConfig: Record<string, unknown>,
  newTitle: string | undefined,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardConfigured' | 'closeConfigureCard'>,
): Promise<void> {
  const { localCards, dashboard, snapshot, setLocalCards, showToast, t, recordCardConfigured, closeConfigureCard } = deps
  const card = localCards.find(item => item.id === cardId)
  if (card) {
    emitCardConfigured(card.card_type)
    recordCardConfigured?.(
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
  closeConfigureCard?.()

  if (dashboard?.id && !isLocalOnlyCard(cardId)) {
    try {
      await api.put(`/api/cards/${cardId}`, { config: newConfig, title: newTitle })
    } catch (error: unknown) {
      console.error('Failed to update card configuration:', error)
      showToast(t('dashboard.toast.updateConfigFailed', 'Failed to update card configuration'), 'error')
    }
  }
}

/**
 * Add a recommended card to the front of the board (or bring an existing one
 * to the front if it already exists).
 */
export function addRecommendedCard(
  cardType: string,
  config: Record<string, unknown> | undefined,
  title: string | undefined,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'recordCardAdded'>,
): void {
  const { localCards, dashboard, snapshot, setLocalCards, recordCardAdded } = deps
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
    recordCardAdded?.(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
    return [newCard, ...prev]
  })
}

/**
 * Create a new card from an AI suggestion and add it to the front of the board.
 */
export function addCardFromAI(
  cardType: string,
  config: Record<string, unknown>,
  title: string | undefined,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'recordCardAdded' | 'closeConfigureCard'>,
): void {
  const { localCards, dashboard, snapshot, setLocalCards, recordCardAdded, closeConfigureCard } = deps
  const size = getDefaultCardSize(cardType)
  const newCard: Card = {
    id: `ai-${Date.now()}`,
    card_type: cardType,
    config: config || {},
    position: { x: 0, y: 0, ...size },
    title,
  }
  recordCardAdded?.(newCard.id, cardType, title, config, dashboard?.id, dashboard?.name)
  snapshot(localCards)
  setLocalCards(prev => [newCard, ...prev])
  closeConfigureCard?.()
}

/**
 * Apply a dashboard template, prepending all template cards to the current board.
 */
export function applyDashboardTemplate(
  template: DashboardTemplate,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'showToast' | 't' | 'recordCardAdded'>,
): void {
  const { localCards, dashboard, snapshot, setLocalCards, showToast, t, recordCardAdded } = deps
  const newCards: Card[] = template.cards.map((templateCard, index) => ({
    id: `template-${Date.now()}-${index}`,
    card_type: templateCard.card_type,
    config: templateCard.config || {},
    position: { x: 0, y: 0, w: templateCard.position?.w || 4, h: templateCard.position?.h || 2 },
    title: templateCard.title,
  }))
  newCards.forEach(card => {
    recordCardAdded?.(card.id, card.card_type, card.title, card.config, dashboard?.id, dashboard?.name)
  })
  snapshot(localCards)
  setLocalCards(prev => [...newCards, ...prev])
  showToast(t('dashboard.toast.templateApplied', 'Applied "{{name}}" template with {{count}} cards', { name: template.name, count: newCards.length }), 'success')
}

/**
 * Add a single card to the front of the board (used by smart suggestions).
 */
export function addSingleCard(
  cardType: string,
  deps: Pick<CardMutationDeps, 'localCards' | 'dashboard' | 'snapshot' | 'setLocalCards' | 'recordCardAdded'>,
): void {
  const { localCards, dashboard, snapshot, setLocalCards, recordCardAdded } = deps
  const size = getDefaultCardSize(cardType)
  const newCard: Card = {
    id: `rec-${Date.now()}`,
    card_type: cardType,
    config: {},
    position: { x: 0, y: 0, ...size },
  }
  recordCardAdded?.(newCard.id, cardType, undefined, {}, dashboard?.id, dashboard?.name)
  emitCardAdded(cardType, 'smart_suggestion')
  snapshot(localCards)
  setLocalCards(prev => [newCard, ...prev])
}

/**
 * Handle a workload-deploy drag-and-drop event: fire deploy:started, call the
 * deploy API, then publish the result event.
 */
export interface ConfirmDeployDeps {
  pendingDeploy: {
    workloadName: string
    namespace: string
    sourceCluster: string
    targetClusters: string[]
    groupName: string
  }
  deployWorkload: (
    args: { workloadName: string; namespace: string; sourceCluster: string; targetClusters: string[] },
    callbacks: { onSuccess: (result: unknown) => void }
  ) => Promise<void>
  publishCardEvent: (event: CardEvent) => void
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  t: TFunction
}

export async function confirmDeployAction(deps: ConfirmDeployDeps): Promise<void> {
  const { pendingDeploy, deployWorkload, publishCardEvent, showToast, t } = deps
  const { workloadName, namespace, sourceCluster, targetClusters, groupName } = pendingDeploy

  const deployId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  publishCardEvent({
    type: 'deploy:started',
    payload: {
      id: deployId,
      workload: workloadName,
      namespace,
      sourceCluster,
      targetClusters,
      groupName,
      timestamp: Date.now(),
    },
  })

  showToast(
    t('dashboard.toast.deploying', 'Deploying {{workload}} to {{count}} cluster(s) in "{{group}}"', { workload: workloadName, count: targetClusters.length, group: groupName }),
    'success',
  )

  try {
    await deployWorkload(
      { workloadName, namespace, sourceCluster, targetClusters },
      {
        onSuccess: (result) => {
          const resp = result as unknown as {
            success?: boolean
            message?: string
            deployedTo?: string[]
            failedClusters?: string[]
            dependencies?: { kind: string; name: string; action: string }[]
            warnings?: string[]
          }
          if (resp && typeof resp === 'object') {
            publishCardEvent({
              type: 'deploy:result',
              payload: {
                id: deployId,
                success: resp.success ?? true,
                message: resp.message ?? '',
                deployedTo: resp.deployedTo,
                failedClusters: resp.failedClusters,
                dependencies: resp.dependencies as DeployResultPayload['dependencies'],
                warnings: resp.warnings,
              },
            })
          }
        },
      },
    )
  } catch (error: unknown) {
    console.error('Deploy failed:', error)
    showToast(
      t('dashboard.toast.deployFailed', 'Deploy failed: {{detail}}', { detail: error instanceof Error ? error.message : t('dashboard.toast.unknownError', 'Unknown error') }),
      'error',
    )
  }
}

/**
 * Export a dashboard as a JSON file download.
 */
export async function exportDashboardAsFile(
  dashboardId: string,
  dashboardName: string,
  exportDashboard: (id: string) => Promise<unknown>,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  t: TFunction,
): Promise<void> {
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

// ─── Drag helpers ────────────────────────────────────────────────────────────

export interface MoveToDashboardDeps {
  moveCardToDashboard: (cardId: string, dashboardId: string) => Promise<unknown>
  createDashboard: (name: string) => Promise<{ id: string; name?: string } | undefined>
  snapshot: (cards: Card[]) => void
  localCards: Card[]
  setLocalCards: Dispatch<SetStateAction<Card[]>>
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
  t: TFunction
}

export async function moveCardToDashboardAction(
  cardId: string,
  targetDashboardId: string,
  targetDashboardName: string,
  deps: MoveToDashboardDeps,
): Promise<void> {
  const { moveCardToDashboard, snapshot, localCards, setLocalCards, showToast, t } = deps
  try {
    await moveCardToDashboard(cardId, targetDashboardId)
    snapshot(localCards)
    setLocalCards(items => items.filter(item => item.id !== cardId))
    showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: targetDashboardName }), 'success')
  } catch (error: unknown) {
    console.error('Failed to move card:', error)
    showToast(t('dashboard.toast.moveCardFailed', 'Failed to move card'), 'error')
  }
}

export async function moveCardToNewDashboardAction(
  cardId: string,
  deps: MoveToDashboardDeps,
): Promise<void> {
  const { createDashboard, moveCardToDashboard, snapshot, localCards, setLocalCards, showToast, t } = deps
  try {
    const newDash = await createDashboard('New Dashboard')
    if (newDash?.id) {
      await moveCardToDashboard(cardId, newDash.id)
      snapshot(localCards)
      setLocalCards(items => items.filter(item => item.id !== cardId))
      showToast(t('dashboard.toast.cardMoved', 'Card moved to "{{name}}"', { name: newDash.name || t('dashboard.toast.newDashboard', 'New Dashboard') }), 'success')
    }
  } catch (error: unknown) {
    console.error('Failed to create dashboard and move card:', error)
    showToast(t('dashboard.toast.createDashboardFailed', 'Failed to create dashboard'), 'error')
  }
}
