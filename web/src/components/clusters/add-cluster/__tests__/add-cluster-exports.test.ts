/**
 * Add Cluster Component Export Tests
 */
import { describe, it, expect } from 'vitest'

describe('Add Cluster module exports', () => {
  it('exports from index', async () => {
    const mod = await import('../index')
    expect(mod).toBeDefined()
  })

  it('exports CommandLineTab', async () => {
    const mod = await import('../CommandLineTab')
    expect(mod.CommandLineTab).toBeDefined()
  })

  it('exports ConnectTab', async () => {
    const mod = await import('../ConnectTab')
    expect(mod.ConnectTab).toBeDefined()
  })

  it('exports CopyButton', async () => {
    const mod = await import('../CopyButton')
    expect(mod.CopyButton).toBeDefined()
  })

  it('exports ImportTab', async () => {
    const mod = await import('../ImportTab')
    expect(mod.ImportTab).toBeDefined()
  })

  it('exports types', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })
})
