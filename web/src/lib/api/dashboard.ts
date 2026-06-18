/**
 * dashboard.ts
 *
 * Dashboard and card persistence API helpers.
 */

import { api } from './core'

export function listDashboards<T = unknown>(): Promise<{ data: T[] }> {
  return api.get<T[]>('/api/dashboards')
}

export function getDashboard<T = unknown>(dashboardId: string): Promise<{ data: T }> {
  return api.get<T>(`/api/dashboards/${dashboardId}`)
}

export function createDashboard<T = unknown>(payload: unknown): Promise<{ data: T }> {
  return api.post<T>('/api/dashboards', payload)
}

export function updateDashboard<T = unknown>(dashboardId: string, payload: unknown): Promise<{ data: T }> {
  return api.put<T>(`/api/dashboards/${dashboardId}`, payload)
}

export function deleteDashboard(dashboardId: string): Promise<void> {
  return api.delete(`/api/dashboards/${dashboardId}`)
}

export function addDashboardCard<T = unknown>(dashboardId: string, payload: unknown): Promise<{ data: T }> {
  return api.post<T>(`/api/dashboards/${dashboardId}/cards`, payload)
}

export function updateDashboardCard<T = unknown>(cardId: string, payload: unknown): Promise<{ data: T }> {
  return api.put<T>(`/api/cards/${cardId}`, payload)
}

export function deleteDashboardCard(cardId: string): Promise<void> {
  return api.delete(`/api/cards/${cardId}`)
}

export function moveDashboardCard<T = unknown>(cardId: string, targetDashboardId: string): Promise<{ data: T }> {
  return api.post<T>(`/api/cards/${cardId}/move`, { target_dashboard_id: targetDashboardId })
}

export function exportDashboard<T = unknown>(dashboardId: string): Promise<{ data: T }> {
  return api.get<T>(`/api/dashboards/${dashboardId}/export`)
}

export function importDashboard<T = unknown>(payload: unknown): Promise<{ data: T }> {
  return api.post<T>('/api/dashboards/import', payload)
}
