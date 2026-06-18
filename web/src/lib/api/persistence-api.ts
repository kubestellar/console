import { authFetch } from './client'

export function getPersistenceConfig(init?: RequestInit) {
  return authFetch('/api/persistence/config', init)
}

export function getPersistenceStatus(init?: RequestInit) {
  return authFetch('/api/persistence/status', init)
}

export function updatePersistenceConfig(config: unknown, init?: RequestInit) {
  return authFetch('/api/persistence/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    ...init,
  })
}

export function testPersistenceConnection(cluster: string, init?: RequestInit) {
  return authFetch('/api/persistence/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ cluster }),
    ...init,
  })
}

export function syncPersistenceNow(init?: RequestInit) {
  return authFetch('/api/persistence/sync', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
    ...init,
  })
}

export const persistenceApi = {
  getPersistenceConfig,
  getPersistenceStatus,
  updatePersistenceConfig,
  testPersistenceConnection,
  syncPersistenceNow,
}
