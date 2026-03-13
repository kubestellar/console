/**
 * One-time migration helper for dashboard localStorage keys.
 *
 * When a dashboard's storageKey is renamed, any layout the user previously
 * saved under the old key needs to be copied to the new key so their
 * customization is preserved. The old key is removed after migration.
 *
 * This function is idempotent — if the old key doesn't exist or the new key
 * already has data, it's a no-op.
 */
export function migrateStorageKey(oldKey: string, newKey: string): void {
  // Skip if running on the server (SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  // Nothing to migrate if old key doesn't exist
  const oldData = localStorage.getItem(oldKey)
  if (!oldData) return
  // Don't overwrite if the user already has data under the new key
  if (localStorage.getItem(newKey) !== null) {
    // Clean up the stale old key since new key already has data
    localStorage.removeItem(oldKey)
    return
  }
  // Migrate: copy old data to new key, then remove old key
  localStorage.setItem(newKey, oldData)
  localStorage.removeItem(oldKey)
}
