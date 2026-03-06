import { describe, it, expect } from 'vitest'
import { StatsConfigModal, useStatsConfig } from './StatsConfig'

describe('StatsConfig Component', () => {
  it('exports StatsConfigModal component', () => {
    expect(StatsConfigModal).toBeDefined()
    expect(typeof StatsConfigModal).toBe('function')
  })

  it('exports useStatsConfig hook', () => {
    expect(useStatsConfig).toBeDefined()
    expect(typeof useStatsConfig).toBe('function')
  })
})
