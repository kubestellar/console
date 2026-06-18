/**
 * api/dashboard.ts — Dashboard and card management API operations.
 * Created per issue #19013 to split api.ts by domain.
 */
import { api } from './client'

export interface DashboardData {
  id: string
  name: string
  cards?: unknown[]
}

export interface CardData {
  id?: string
  type: string
  config?: Record<string, unknown>
  title?: string
}

/**
 * Get all dashboards.
 */
export async function getDashboards(): Promise<DashboardData[]> {
  const { data } = await api.get<DashboardData[]>('/api/dashboards')
  return data
}

/**
 * Get a specific dashboard by ID.
 */
export async function getDashboard(id: string): Promise<DashboardData> {
  const { data } = await api.get<DashboardData>(`/api/dashboards/${id}`)
  return data
}

/**
 * Create a new dashboard.
 */
export async function createDashboard(dashboard: Partial<DashboardData>): Promise<DashboardData> {
  const { data } = await api.post<DashboardData>('/api/dashboards', dashboard)
  return data
}

/**
 * Update a dashboard.
 */
export async function updateDashboard(id: string, updates: Partial<DashboardData>): Promise<DashboardData> {
  const { data } = await api.put<DashboardData>(`/api/dashboards/${id}`, updates)
  return data
}

/**
 * Delete a dashboard.
 */
export async function deleteDashboard(id: string): Promise<void> {
  await api.delete(`/api/dashboards/${id}`)
}

/**
 * Add a card to a dashboard.
 */
export async function addCardToDashboard(dashboardId: string, card: CardData): Promise<unknown> {
  const { data } = await api.post(`/api/dashboards/${dashboardId}/cards`, card)
  return data
}

/**
 * Update a card.
 */
export async function updateCard(cardId: string, updates: Partial<CardData>): Promise<unknown> {
  const { data } = await api.put(`/api/cards/${cardId}`, updates)
  return data
}

/**
 * Delete a card.
 */
export async function deleteCard(cardId: string): Promise<void> {
  await api.delete(`/api/cards/${cardId}`)
}

/**
 * Move a card between dashboards or reorder within a dashboard.
 */
export async function moveCard(cardId: string, targetDashboardId: string, position?: number): Promise<unknown> {
  const { data } = await api.post(`/api/cards/${cardId}/move`, {
    target_dashboard_id: targetDashboardId,
    position,
  })
  return data
}
