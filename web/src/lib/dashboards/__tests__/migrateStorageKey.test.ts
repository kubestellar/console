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
    cardType: 'new_card',
    position: { w: 4, h: 2, x: 0, y: 0 },
  }

  beforeEach(() => { localStorage.clear() })

  it('does nothing when no saved layout (marks as done)', () => {
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    expect(localStorage.getItem('dash-key')).toBeNull()
    expect(localStorage.getItem('dash-key:migrated:new_card')).toBe('1')
  })

  it('does nothing when card already exists in layout', () => {
    const layout = [{ id: '1', cardType: 'new_card', position: { w: 4, h: 2, x: 0, y: 0 } }]
    localStorage.setItem('dash-key', JSON.stringify(layout))
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(1) // unchanged
  })

  it('injects card at position 0 and shifts existing cards', () => {
    const layout = [
      { id: '1', cardType: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
    ]
    localStorage.setItem('dash-key', JSON.stringify(layout))
    ensureCardInDashboard('dash-key', 'new_card', testCard)
    const result = JSON.parse(localStorage.getItem('dash-key')!)
    expect(result).toHaveLength(2)
    expect(result[0].cardType).toBe('new_card')
    expect(result[1].position.y).toBe(2) // shifted by h=2
  })

  it('is idempotent (only runs once)', () => {
    const layout = [
      { id: '1', cardType: 'existing', position: { w: 4, h: 2, x: 0, y: 0 } },
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
})
