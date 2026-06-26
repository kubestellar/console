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
 *
 * NOTE: Saved dashboards use the `card_type` field (snake_case) to match the
 * `DashboardCard` interface. Callers may pass the injected card using either
 * `card_type` or the legacy `cardType` field — both are normalized so any
 * previously-written stale entries also get repaired on the next read. See
 * issue #5902 where the wrong field name caused `card_type` to be undefined,
 * crashing formatCardTitle() on /compute.
 */
interface StoredDashboardCard {
  id: string
  card_type?: string
  /** Legacy field name kept for back-compat with previously-persisted layouts. */
  cardType?: string
  position?: { w: number; h: number; x: number; y: number }
}

export function ensureCardInDashboard(
  storageKey: string,
  cardType: string,
  card: {
    id: string
    /** Preferred field name. */
    card_type?: string
    /** Legacy field name — still accepted for back-compat. */
    cardType?: string
    position: { w: number; h: number; x: number; y: number }
  },
): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return

  const migrationFlag = `${storageKey}:migrated:${cardType}`
  if (localStorage.getItem(migrationFlag)) return

  // Normalize the injected card to use `card_type` (the canonical field name).
  const injectedCardType = card.card_type || card.cardType
  const normalizedInjected: StoredDashboardCard = {
    id: card.id,
    card_type: injectedCardType,
    position: card.position,
  }

  const stored = localStorage.getItem(storageKey)
  if (!stored) {
    // No saved layout — defaults will include the card. Mark as done.
    localStorage.setItem(migrationFlag, '1')
    return
  }

  try {
    const cards = JSON.parse(stored) as StoredDashboardCard[]
    if (!Array.isArray(cards)) return

    // Normalize any pre-existing stale entries that used the legacy
    // `cardType` field (or had neither field). This repairs broken layouts
    // written before the #5902 fix without requiring users to clear storage.
    const normalizedCards: StoredDashboardCard[] = cards.map(c => {
      const type = c.card_type || c.cardType
      return {
        ...c,
        card_type: type,
        // Strip the legacy field to keep storage clean going forward.
        cardType: undefined,
      }
    })

    // Already has the card — nothing to do, but still persist any
    // repairs we made above so stale keys don't bite us later.
    if (normalizedCards.some(c => c.card_type === cardType)) {
      localStorage.setItem(storageKey, JSON.stringify(normalizedCards))
      localStorage.setItem(migrationFlag, '1')
      return
    }

    // Shift existing cards down by the height of the new card
    const shiftY = card.position?.h || 2
    const migrated = [
      normalizedInjected,
      ...normalizedCards.map(c => ({
        ...c,
        position: { ...(c.position || { w: 4, h: 2, x: 0, y: 0 }), y: (c.position?.y || 0) + shiftY },
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
