import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerDynamicCard,
  getDynamicCard,
  getAllDynamicCards,
  unregisterDynamicCard,
  isDynamicCardRegistered,
  onRegistryChange,
  clearDynamicCards,
} from '../dynamicCardRegistry'

const makeDef = (id: string) => ({
  id,
  name: `Card ${id}`,
  code: 'export default function() { return null }',
  version: 1,
  createdAt: new Date().toISOString(),
})

describe('dynamicCardRegistry', () => {
  beforeEach(() => {
    clearDynamicCards()
  })

  it('registers and retrieves cards', () => {
    const def = makeDef('test-1')
    registerDynamicCard(def as Parameters<typeof registerDynamicCard>[0])
    expect(getDynamicCard('test-1')).toEqual(def)
  })

  it('isDynamicCardRegistered returns correct value', () => {
    expect(isDynamicCardRegistered('test-1')).toBe(false)
    registerDynamicCard(makeDef('test-1') as Parameters<typeof registerDynamicCard>[0])
    expect(isDynamicCardRegistered('test-1')).toBe(true)
  })

  it('getAllDynamicCards returns all', () => {
    registerDynamicCard(makeDef('a') as Parameters<typeof registerDynamicCard>[0])
    registerDynamicCard(makeDef('b') as Parameters<typeof registerDynamicCard>[0])
    expect(getAllDynamicCards()).toHaveLength(2)
  })

  it('unregisterDynamicCard removes card', () => {
    registerDynamicCard(makeDef('test-1') as Parameters<typeof registerDynamicCard>[0])
    expect(unregisterDynamicCard('test-1')).toBe(true)
    expect(getDynamicCard('test-1')).toBeUndefined()
  })

  it('unregisterDynamicCard returns false for missing', () => {
    expect(unregisterDynamicCard('nonexistent')).toBe(false)
  })

  it('clearDynamicCards empties registry', () => {
    registerDynamicCard(makeDef('a') as Parameters<typeof registerDynamicCard>[0])
    registerDynamicCard(makeDef('b') as Parameters<typeof registerDynamicCard>[0])
    clearDynamicCards()
    expect(getAllDynamicCards()).toHaveLength(0)
  })

  it('notifies listeners on register', () => {
    const listener = vi.fn()
    const unsub = onRegistryChange(listener)
    registerDynamicCard(makeDef('test-1') as Parameters<typeof registerDynamicCard>[0])
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('notifies listeners on unregister', () => {
    registerDynamicCard(makeDef('test-1') as Parameters<typeof registerDynamicCard>[0])
    const listener = vi.fn()
    const unsub = onRegistryChange(listener)
    unregisterDynamicCard('test-1')
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('notifies listeners on clear', () => {
    const listener = vi.fn()
    const unsub = onRegistryChange(listener)
    clearDynamicCards()
    expect(listener).toHaveBeenCalledOnce()
    unsub()
  })

  it('unsubscribes correctly', () => {
    const listener = vi.fn()
    const unsub = onRegistryChange(listener)
    unsub()
    registerDynamicCard(makeDef('test-1') as Parameters<typeof registerDynamicCard>[0])
    expect(listener).not.toHaveBeenCalled()
  })
})
