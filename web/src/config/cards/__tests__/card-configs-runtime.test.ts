/**
 * Runtime Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { chaosMeshStatusConfig } from '../chaos-mesh-status'

const runtimeCards = [
  { name: 'chaosMeshStatus', config: chaosMeshStatusConfig },
]

describe('Runtime card configs', () => {
  it.each(runtimeCards)('$name has valid type, title, category', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.category).toBe('runtime')
  })

  it.each(runtimeCards)('$name has valid content.items array', ({ config }) => {
    expect(config.content).toBeTruthy()
    expect(config.content?.type).toBe('status-grid')
    expect(Array.isArray(config.content?.items)).toBe(true)
    expect(config.content?.items?.length).toBeGreaterThan(0)
    config.content?.items?.forEach((item: { id: string; label: string }) => {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
    })
  })
})
