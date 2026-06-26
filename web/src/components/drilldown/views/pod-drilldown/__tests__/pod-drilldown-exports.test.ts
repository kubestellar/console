/**
 * Pod DrillDown Sub-module Export Tests
 */
import { describe, it, expect } from 'vitest'

describe('pod-drilldown module exports', () => {
  it('exports from index', async () => {
    const mod = await import('../index')
    expect(mod).toBeDefined()
  })

  it('exports types', async () => {
    const mod = await import('../types')
    expect(mod).toBeDefined()
  })

  it('exports helpers', async () => {
    const mod = await import('../helpers')
    expect(mod).toBeDefined()
  })

  it('exports podCache', async () => {
    const mod = await import('../podCache')
    expect(mod).toBeDefined()
  })

  it('exports PodAiAnalysis', async () => {
    const mod = await import('../PodAiAnalysis')
    expect(mod).toBeDefined()
  })

  it('exports PodDeleteSection', async () => {
    const mod = await import('../PodDeleteSection')
    expect(mod).toBeDefined()
  })

  it('exports PodLabelsTab', async () => {
    const mod = await import('../PodLabelsTab')
    expect(mod).toBeDefined()
  })

  it('exports PodOutputTab', async () => {
    const mod = await import('../PodOutputTab')
    expect(mod).toBeDefined()
  })

  it('exports PodRelatedTab', async () => {
    const mod = await import('../PodRelatedTab')
    expect(mod).toBeDefined()
  })
})
