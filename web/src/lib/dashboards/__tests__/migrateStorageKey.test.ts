import { describe, it, expect, beforeEach } from 'vitest'
import { migrateStorageKey, ensureCardInDashboard } from '../migrateStorageKey'

describe('migrateStorageKey', () => {
  beforeEach(() => { localStorage.clear() })

  it('migrates data from old key to new key', () => {
    localStorage.setItem('old-key', '{"cards":[]}')
    migrateStorageKey('old-key', 'new-key')
    expect(localStorage.getItem('new-key')).toBe('{"cards":[]}')
    expect(localStorage.getItem('old-key')).toBeNull()
  })

  it('does nothing when old key does not exist', () => {
    migrateStorageKey('old-key', 'new-key')
    expect(localStorage.getItem('new-key')).toBeNull()
  })

  it('does not overwrite existing new key data', () => {
    localStorage.setItem('old-key', 'old-data')
    localStorage.setItem('new-key', 'existing-data')
    migrateStorageKey('old-key', 'new-key')
    expect(localStorage.getItem('new-key')).toBe('existing-data')
    expect(localStorage.getItem('old-key')).toBeNull() // cleaned up
  })
})

describe('ensureCardInDashboard', () => {
  const testCard = {
    id: 'test-card-id',
    card_type: 'new_card',
    position: { w: 4, h: 2, x: 0, y: 0 },
  }

  beforeEach(() => { localStorage.clear() })

  it('does nothing when no saved layout (marks as done)', () => {
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    expect(localStorage.getItem('dash-key')).toBeNull()
    expect(localStorage.getItem('dash-key:migrated:new_card')).toBe('1')
  })

  it('does nothing when card already exists in layout', () => {
    const layout = [{ id: '1', card_type: 'new_card', position: { w: 4, h: 2, x: 0, y: 0 } }]
    localStorage.setItem('dash-key', JSON.stringify(layout))
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(1) // unchanged
    expect(result[0].card_type).toBe('new_card')
  })

  it('injects card at position 0 and shifts existing cards', () => {
    const layout = [
      { id: '1', card_type: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
    ]
    localStorage.setItem('dash-key', JSON.stringify(layout))
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(2)
    expect(result[0].card_type).toBe('new_card')
    expect(result[1].position.y).toBe(2) // shifted by h=2
  })

  it('is idempotent (only runs once)', () => {
    const layout = [
      { id: '1', card_type: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
    ]
    localStorage.setItem('dash-key', JSON.stringify(layout))

    ensureCardInDashboard('dash-key', 'new_card', testCard)
    ensureCardInDashboard('dash-key', 'new_card', testCard) // second call

    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(2) // not 3
  })

  it('handles corrupt data by removing it', () => {
    localStorage.setItem('dash-key', 'not-valid-json')
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    expect(localStorage.getItem('dash-key')).toBeNull()
    expect(localStorage.getItem('dash-key:migrated:new_card')).toBe('1')
  })

  // Regression test for issue #5902: stale layouts written with the legacy
  // `cardType` field (snake_case mismatch) must be normalized on read so that
  // card.card_type is populated and formatCardTitle() does not crash with
  // "can't access property 'replace', cardType is undefined".
  it('normalizes legacy cardType field to card_type in stored layout', () => {
    const staleLayout = [
      // Stored with the legacy field name — simulates a layout written by
      // an older build of ensureCardInDashboard / Compute.tsx.
      { id: '1', cardType: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
    ]
    localStorage.setItem('dash-key', JSON.stringify(staleLayout))

    ensureCardInDashboard('dash-key', 'new_card', testCard)

    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(2)
    // The newly injected card uses the canonical field name.
    expect(result[0].card_type).toBe('new_card')
    // The pre-existing stale entry got repaired to use card_type.
    const existing = result.find((c: { card_type?: string; id: string }) => c.id === '1')
    expect(existing?.card_type).toBe('existing')
  })

  it('accepts legacy cardType field on the injected card for back-compat', () => {
    // Simulates a caller that still passes `cardType` instead of `card_type`.
    const legacyCard = {
      id: 'legacy-id',
      cardType: 'new_card',
      position: { w: 4, h: 2, x: 0, y: 0 },
    }
    const layout = [
      { id: '1', card_type: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
    ]
    localStorage.setItem('dash-key', JSON.stringify(layout))

    ensureCardInDashboard('dash-key', 'new_card', legacyCard)

    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result[0].card_type).toBe('new_card')
  })
})
