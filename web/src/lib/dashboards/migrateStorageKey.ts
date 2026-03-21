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

/**
 * Ensure a specific card type exists in a saved dashboard layout.
 *
 * If the user has a saved layout that's missing the given card type,
 * inject it at position 0 (first card) and shift existing cards down.
 * Uses a one-time migration flag so it only runs once per card type.
 *
 * Idempotent — no-op if card already exists, no saved layout, or migration
 * already ran.
 */
export function ensureCardInDashboard(
  storageKey: string,
  cardType: string,
  card: { id: string; cardType: string; position: { w: number; h: number; x: number; y: number } },
): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return

  const migrationFlag = `${storageKey}:migrated:${cardType}`
  if (localStorage.getItem(migrationFlag)) return

  const stored = localStorage.getItem(storageKey)
  if (!stored) {
    // No saved layout — defaults will include the card. Mark as done.
    localStorage.setItem(migrationFlag, '1')
    return
  }

  try {
    const cards = JSON.parse(stored) as Array<{ id: string; cardType: string; position: { w: number; h: number; x: number; y: number } }>
    if (!Array.isArray(cards)) return

    // Already has the card — nothing to do
    if (cards.some(c => c.cardType === cardType)) {
      localStorage.setItem(migrationFlag, '1')
      return
    }

    // Shift existing cards down by the height of the new card
    const shiftY = card.position.h
    const migrated = [
      card,
      ...cards.map(c => ({
        ...c,
        position: { ...c.position, y: c.position.y + shiftY },
      })),
    ]

    localStorage.setItem(storageKey, JSON.stringify(migrated))
    localStorage.setItem(migrationFlag, '1')
  } catch {
    // Corrupt data — let defaults take over
    localStorage.removeItem(storageKey)
    localStorage.setItem(migrationFlag, '1')
  }
}
