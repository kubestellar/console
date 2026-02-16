import { describe, it, expect } from 'vitest'
import * as StatsConfigModule from './StatsConfig'

describe('StatsConfig Component', () => {
  it('exports StatsConfigModal component', () => {
    expect(StatsConfigModule.StatsConfigModal).toBeDefined()
    expect(typeof StatsConfigModule.StatsConfigModal).toBe('function')
  })

  it('exports useStatsConfig hook', () => {
    expect(StatsConfigModule.useStatsConfig).toBeDefined()
    expect(typeof StatsConfigModule.useStatsConfig).toBe('function')
  })
})
