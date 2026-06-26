/**
 * Individual Dashboard Config Tests - AI/ML & Infrastructure
 *
 * Tests AI/ML and infrastructure dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { aiAgentsDashboardConfig } from '../ai-agents'
import { aiMlDashboardConfig } from '../ai-ml'
import { gpuDashboardConfig } from '../gpu'
import { llmdBenchmarksDashboardConfig } from '../llmd-benchmarks'
import { quantumDashboardConfig } from '../quantum'

const aiInfrastructureDashboards = [
  { name: 'aiAgents', config: aiAgentsDashboardConfig },
  { name: 'aiMl', config: aiMlDashboardConfig },
  { name: 'gpu', config: gpuDashboardConfig },
  { name: 'llmdBenchmarks', config: llmdBenchmarksDashboardConfig },
  { name: 'quantum', config: quantumDashboardConfig },
]

describe('AI/ML & Infrastructure dashboard configs', () => {
  it.each(aiInfrastructureDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(aiInfrastructureDashboards)('$name has valid cards array or tabs', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    const hasTabs = !!(config as Record<string, unknown>).tabs
    if (!hasTabs) {
      expect(config.cards.length).toBeGreaterThan(0)
    }
  })

  it.each(aiInfrastructureDashboards)('$name cards have unique IDs', ({ config }) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(aiInfrastructureDashboards)('$name cards have valid cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(aiInfrastructureDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })
})
