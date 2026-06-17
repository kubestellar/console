import { describe, it, expect } from 'vitest'

const mod = await import('../storage')
const { getDemoPVCs } = mod.__storageTestables

describe('storage pvcs advanced', () => {
  it('demo PVCs include access modes', () => {
    const pvcs = getDemoPVCs()
    expect(pvcs.length).toBeGreaterThan(0)
    expect(Array.isArray(pvcs[0].accessModes)).toBe(true)
  })
})
