import { api, BackendUnavailableError, UnauthenticatedError } from '../api'
import { DashboardCard } from './types'

// ============================================================================
// Dashboard Sync Service - Syncs dashboard layouts with backend
// ============================================================================

export interface BackendDashboard {
  id: string
  user_id: string
  name: string
  layout?: string
  is_default: boolean
  created_at: string
  updated_at?: string
}

export interface BackendCard {
  id: string
  dashboard_id: string
  card_type: string
  config?: string
  position: string
  created_at: string
}

export interface DashboardWithCards {
  dashboard: BackendDashboard
  cards: BackendCard[]
}

// Convert backend card to frontend format
function toFrontendCard(card: BackendCard): DashboardCard {
  let config = {}
  let position = { w: 4, h: 2 }

  try {
    config = card.config ? JSON.parse(card.config) : {}
  } catch { /* use default */ }

  try {
    const pos = card.position ? JSON.parse(card.position) : {}
    position = { w: pos.w || 4, h: pos.h || 2 }
  } catch { /* use default */ }

  return {
    id: card.id,
    card_type: card.card_type,
    config,
    position,
  }
}

// Debounce helper
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debounce(key: string, fn: () => void, delay: number) {
  if (debounceTimers[key]) {
    clearTimeout(debounceTimers[key])
  }
  debounceTimers[key] = setTimeout(fn, delay)
}

/**
 * Dashboard Sync Service
 * Handles syncing dashboard layouts between localStorage (cache) and backend (source of truth)
 */
class DashboardSyncService {
  private dashboardCache: Map<string, BackendDashboard> = new Map()
  private syncInProgress: Set<string> = new Set()

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('token')
  }

  /**
   * Get or create a dashboard by name (storageKey maps to dashboard name)
   */
  async getOrCreateDashboard(name: string): Promise<BackendDashboard | null> {
    if (!this.isAuthenticated()) return null

    // Check cache first
    const cached = this.dashboardCache.get(name)
    if (cached) return cached

    try {
      // Fetch all dashboards
      const { data: dashboards } = await api.get<BackendDashboard[]>('/api/dashboards')

      // Find by name
      let dashboard = dashboards.find(d => d.name === name)

      if (!dashboard) {
        // Create new dashboard
        const { data: newDashboard } = await api.post<BackendDashboard>('/api/dashboards', {
          name,
          is_default: false,
        })
        dashboard = newDashboard
      }

      // Cache it
      this.dashboardCache.set(name, dashboard)
      return dashboard
    } catch (err) {
      if (err instanceof UnauthenticatedError || err instanceof BackendUnavailableError) {
        return null
      }
      console.error('[DashboardSync] Failed to get/create dashboard:', err)
      return null
    }
  }

  /**
   * Fetch cards for a dashboard from the backend
   */
  async fetchCards(storageKey: string): Promise<DashboardCard[] | null> {
    if (!this.isAuthenticated()) return null

    try {
      const dashboard = await this.getOrCreateDashboard(storageKey)
      if (!dashboard) return null

      const { data } = await api.get<DashboardWithCards>(`/api/dashboards/${dashboard.id}`)
      return data.cards.map(toFrontendCard)
    } catch (err) {
      if (err instanceof UnauthenticatedError || err instanceof BackendUnavailableError) {
        return null
      }
      console.error('[DashboardSync] Failed to fetch cards:', err)
      return null
    }
  }

  /**
   * Save cards to the backend (debounced to avoid excessive API calls)
   */
  saveCards(storageKey: string, cards: DashboardCard[]): void {
    if (!this.isAuthenticated()) return

    // Debounce saves - wait 1 second after last change before syncing
    debounce(`save-${storageKey}`, () => {
      this.syncCardsToBackend(storageKey, cards)
    }, 1000)
  }

  /**
   * Actually sync cards to backend
   */
  private async syncCardsToBackend(storageKey: string, cards: DashboardCard[]): Promise<void> {
    if (this.syncInProgress.has(storageKey)) return
    this.syncInProgress.add(storageKey)

    try {
      const dashboard = await this.getOrCreateDashboard(storageKey)
      if (!dashboard) {
        this.syncInProgress.delete(storageKey)
        return
      }

      // Get current backend cards
      const { data: currentData } = await api.get<DashboardWithCards>(`/api/dashboards/${dashboard.id}`)
      const currentCards = currentData.cards

      // Build a map of current backend cards by ID
      const currentCardMap = new Map(currentCards.map(c => [c.id, c]))

      // Build a map of frontend cards by ID
      const frontendCardMap = new Map(cards.map(c => [c.id, c]))

      // Delete cards that are in backend but not in frontend
      for (const backendCard of currentCards) {
        if (!frontendCardMap.has(backendCard.id)) {
          try {
            await api.delete(`/api/cards/${backendCard.id}`)
          } catch (err) {
            console.error('[DashboardSync] Failed to delete card:', err)
          }
        }
      }

      // Create or update cards
      for (const card of cards) {
        const existingCard = currentCardMap.get(card.id)

        if (existingCard) {
          // Update existing card
          try {
            await api.put(`/api/cards/${card.id}`, {
              card_type: card.card_type,
              position: card.position ? { ...card.position, x: 0, y: 0 } : { w: 4, h: 2, x: 0, y: 0 },
            })
          } catch (err) {
            console.error('[DashboardSync] Failed to update card:', err)
          }
        } else {
          // Create new card - but only if ID doesn't start with "default-"
          // Default cards use localStorage-generated IDs, backend will assign new UUIDs
          if (!card.id.startsWith('default-')) {
            try {
              await api.post(`/api/dashboards/${dashboard.id}/cards`, {
                card_type: card.card_type,
                config: card.config || {},
                position: card.position ? { ...card.position, x: 0, y: 0 } : { w: 4, h: 2, x: 0, y: 0 },
              })
            } catch (err) {
              console.error('[DashboardSync] Failed to create card:', err)
            }
          }
        }
      }
    } catch (err) {
      console.error('[DashboardSync] Sync failed:', err)
    } finally {
      this.syncInProgress.delete(storageKey)
    }
  }

  /**
   * Full sync - downloads backend state and updates localStorage
   * Called on login or when user explicitly requests sync
   */
  async fullSync(storageKey: string): Promise<DashboardCard[] | null> {
    const cards = await this.fetchCards(storageKey)
    if (cards && cards.length > 0) {
      // Update localStorage with backend data
      localStorage.setItem(storageKey, JSON.stringify(cards))
      return cards
    }
    return null
  }

  /**
   * Clear cache (call on logout)
   */
  clearCache(): void {
    this.dashboardCache.clear()
    this.syncInProgress.clear()
    // Clear any pending debounce timers
    for (const key of Object.keys(debounceTimers)) {
      clearTimeout(debounceTimers[key])
      delete debounceTimers[key]
    }
  }
}

export const dashboardSync = new DashboardSyncService()
