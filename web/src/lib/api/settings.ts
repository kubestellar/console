/**
 * settings.ts
 *
 * Settings and preferences API helpers.
 */

import { api } from './core'

export function getSettings<T = unknown>(): Promise<{ data: T }> {
  return api.get<T>('/api/settings')
}

export function saveSettings<T = unknown>(settings: unknown): Promise<{ data: T }> {
  return api.put<T>('/api/settings', settings)
}

export function exportSettings<T = unknown>(): Promise<{ data: T }> {
  return api.post<T>('/api/settings/export')
}

export function importSettings<T = unknown>(settingsBlob: unknown): Promise<{ data: T }> {
  return api.post<T>('/api/settings/import', settingsBlob)
}
