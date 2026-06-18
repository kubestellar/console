import { api } from './client'

export function getSettings<T = unknown>() {
  return api.get<T>('/api/settings')
}

export function updateSettings<T = unknown>(updates: unknown) {
  return api.patch<T>('/api/settings', updates)
}

export const settingsApi = {
  getSettings,
  updateSettings,
}
