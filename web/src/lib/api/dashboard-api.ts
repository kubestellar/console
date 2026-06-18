import { api } from './client'

export function listDashboards<T = unknown>() {
  return api.get<T[]>('/api/dashboards')
}

export function createDashboard<T = unknown>(name: string, isDefault?: boolean) {
  return api.post<T>('/api/dashboards', { name, is_default: isDefault })
}

export function updateDashboard<T = unknown>(id: string, updates: unknown) {
  return api.put<T>(`/api/dashboards/${id}`, updates)
}

export function deleteDashboard(id: string) {
  return api.delete(`/api/dashboards/${id}`)
}

export function moveCardToDashboard<T = unknown>(cardId: string, targetDashboardId: string) {
  return api.post<T>(`/api/cards/${cardId}/move`, {
    target_dashboard_id: targetDashboardId,
  })
}

export function getDashboard<T = unknown>(dashboardId: string) {
  return api.get<T>(`/api/dashboards/${dashboardId}`)
}

export function exportDashboard<T = unknown>(dashboardId: string) {
  return api.get<T>(`/api/dashboards/${dashboardId}/export`)
}

export function importDashboard<T = unknown>(exportJson: unknown) {
  return api.post<T>('/api/dashboards/import', exportJson)
}

export function addDashboardCard<T = unknown>(dashboardId: string, card: unknown) {
  return api.post<T>(`/api/dashboards/${dashboardId}/cards`, card)
}

export function updateDashboardCard<T = unknown>(cardId: string, updates: unknown) {
  return api.put<T>(`/api/cards/${cardId}`, updates)
}

export function deleteDashboardCard(cardId: string) {
  return api.delete(`/api/cards/${cardId}`)
}

export const dashboardApi = {
  listDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  moveCardToDashboard,
  getDashboard,
  exportDashboard,
  importDashboard,
  addDashboardCard,
  updateDashboardCard,
  deleteDashboardCard,
}
