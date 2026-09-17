/**
 * useDashboardCardStorage - localStorage-backed card state for
 * UnifiedDashboard (flat cards + per-tab cards).
 *
 * Extracted verbatim from UnifiedDashboard.tsx (#22979): initial restore,
 * persistence effects and cross-tab storage sync.
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { UnifiedDashboardConfig, DashboardCardPlacement } from '../../types'
import { TAB_SLOT_SUFFIX, tabSlotPrefix, tabCardsSlot } from '../UnifiedDashboard.utils'

export function useDashboardCardStorage(config: UnifiedDashboardConfig, hasTabs: boolean) {
  const { t } = useTranslation('common')

  const initialStorageState = (() => {
    const nextState: {
      cards: DashboardCardPlacement[]
      tabCards: Record<string, DashboardCardPlacement[]>
      error: string | null
    } = {
      cards: config.cards,
      tabCards: {},
      error: null,
    }

    if (config.storageKey) {
      try {
        const stored = localStorage.getItem(config.storageKey)
        if (stored !== null) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            nextState.cards = parsed
          }
        }
      } catch (error) {
        console.error('Failed to restore unified dashboard cards', error)
        nextState.error = t('errors.storageRestoreFailed')
      }
    }

    for (const tab of (config.tabs || [])) {
      let seeded: DashboardCardPlacement[] | null = null
      if (config.storageKey) {
        try {
          const raw = localStorage.getItem(tabCardsSlot(config.storageKey, tab.id))
          if (raw !== null) {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
              seeded = parsed
            }
          }
        } catch (error) {
          console.error('Failed to restore unified dashboard tab cards', error)
          nextState.error = t('errors.storageRestoreFailed')
        }
      }
      nextState.tabCards[tab.id] = seeded ?? tab.cards ?? []
    }

    return nextState
  })()

  // Card state - load from localStorage or use config defaults.
  //
  // #6710 — Distinguish "never persisted" (no key in storage) from
  // "explicitly empty" ([]). A user who removed every card should see an
  // empty dashboard after reload, not a restored default layout. We only
  // fall back to `config.cards` when the storage slot is missing entirely.
  const [cards, setCards] = useState<DashboardCardPlacement[]>(initialStorageState.cards)
  const [dashboardError, setDashboardError] = useState<string | null>(initialStorageState.error)

  // #6709 — Per-tab card state. Tab-mode dashboards used to read cards from
  // `config.tabs[activeTabId].cards` but mutated the separate flat `cards`
  // state, so add/remove/configure appeared to do nothing. We keep a local
  // `tabCards` map keyed by tab id, seeded from `config.tabs`, and route
  // mutations through it when `hasTabs` is true.
  //
  // #6749-A (Copilot on PR #6746) — Per-tab persistence. Previously the
  // persistence effect short-circuited entirely when `hasTabs` was true,
  // so tab-mode add/remove/reorder/configure changes were lost on reload.
  // We now persist each tab's cards to its own localStorage slot keyed as
  // `${storageKey}::tab::${tabId}::cards` and seed `tabCards` from those
  // slots on mount when they exist. Non-tab dashboards keep using the
  // original `storageKey`.
  const [tabCards, setTabCards] = useState<Record<string, DashboardCardPlacement[]>>(initialStorageState.tabCards)

  const hasInitializedFlatPersistence = useRef(false)
  const hasInitializedTabPersistence = useRef(false)

  // Persist cards to localStorage when they change.
  //
  // #6710 — Persist on EVERY change, including when `cards` is empty. The
  // previous `cards.length > 0` guard caused "remove all cards → reload"
  // to restore defaults because we never wrote `[]` to storage.
  useEffect(() => {
    // Skip flat-cards persistence for tab-mode dashboards — tab-mode uses
    // per-tab slots, handled by the effect below (#6749-A).
    if (hasTabs) return
    if (!hasInitializedFlatPersistence.current) {
      hasInitializedFlatPersistence.current = true
      return
    }
    if (config.storageKey) {
      try {
        localStorage.setItem(config.storageKey, JSON.stringify(cards))
        setDashboardError(null)
      } catch (error) {
        console.error('Failed to persist unified dashboard cards', error)
        setDashboardError(t('errors.storagePersistFailed'))
      }
    }
  }, [cards, config.storageKey, hasTabs, t])

  // #6749-A — Persist per-tab cards to their own storage slots so tab-mode
  // mutations survive a reload. Without this, the add/remove/reorder
  // handlers wired through `mutateActiveCards` would update in-memory
  // `tabCards` only, and the next mount would re-seed from `config.tabs`
  // and erase the user's customization.
  useEffect(() => {
    if (!hasTabs) return
    if (!config.storageKey) return
    if (!hasInitializedTabPersistence.current) {
      hasInitializedTabPersistence.current = true
      return
    }
    for (const [tabId, placements] of Object.entries(tabCards)) {
      try {
        localStorage.setItem(tabCardsSlot(config.storageKey, tabId), JSON.stringify(placements))
        setDashboardError(null)
      } catch (error) {
        console.error('Failed to persist unified dashboard tab cards', error)
        setDashboardError(t('errors.storagePersistFailed'))
      }
    }
  }, [tabCards, config.storageKey, hasTabs, t])

  // #9384 — Cross-tab sync: listen for storage events so that when another
  // browser tab persists layout changes to the same localStorage keys, this
  // tab picks them up instead of silently overwriting on its next write.
  useEffect(() => {
    const storageKey = config.storageKey
    if (!storageKey) return

    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return

      // Flat-cards key (non-tab dashboards)
      if (e.key === storageKey && !hasTabs) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) {
            setCards(parsed)
            setDashboardError(null)
          }
        } catch (error) {
          console.error('Failed to sync unified dashboard cards from storage event', error)
          setDashboardError(t('errors.storageRestoreFailed'))
        }
        return
      }

      // Per-tab card slots (tab-mode dashboards)
      const prefix = tabSlotPrefix(storageKey)
      if (hasTabs && e.key.startsWith(prefix) && e.key.endsWith(TAB_SLOT_SUFFIX)) {
        const tabId = e.key.slice(prefix.length, -TAB_SLOT_SUFFIX.length)
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) {
            setTabCards((prev) => ({ ...prev, [tabId]: parsed }))
            setDashboardError(null)
          }
        } catch (error) {
          console.error('Failed to sync unified dashboard tab cards from storage event', error)
          setDashboardError(t('errors.storageRestoreFailed'))
        }
      }
    }

    window.addEventListener('storage', handleStorageEvent)
    return () => window.removeEventListener('storage', handleStorageEvent)
  }, [config.storageKey, hasTabs, t])

  return {
    cards,
    setCards,
    tabCards,
    setTabCards,
    dashboardError,
    setDashboardError,
  }
}
