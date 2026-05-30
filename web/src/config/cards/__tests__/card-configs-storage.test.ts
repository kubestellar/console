/**
 * Storage Card Config Tests
 *
 * Tests storage-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { storageOverviewConfig } from '../storage-overview'
import { rookStatusConfig } from '../rook-status'
import { longhornStatusConfig } from '../longhorn-status'
import { cubefsStatusConfig } from '../cubefs-status'
import { vitessStatusConfig } from '../vitess-status'
import { tikvStatusConfig } from '../tikv-status'
import { pvStatusConfig } from '../pv-status'
import { pvcStatusConfig } from '../pvc-status'

const storageCards = [
  { name: 'storageOverview', config: storageOverviewConfig },
  { name: 'rookStatus', config: rookStatusConfig },
  { name: 'longhornStatus', config: longhornStatusConfig },
  { name: 'cubefsStatus', config: cubefsStatusConfig },
  { name: 'vitessStatus', config: vitessStatusConfig },
  { name: 'tikvStatus', config: tikvStatusConfig },
  { name: 'pvStatus', config: pvStatusConfig },
  { name: 'pvcStatus', config: pvcStatusConfig },
]

describe('Storage card configs', () => {
  it.each(storageCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(storageCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(storageCards)('$name type contains storage keyword', ({ config }) => {
    const lowerType = config.type.toLowerCase()
    const lowerTitle = config.title.toLowerCase()
    const hasKeyword =
      lowerType.includes('storage') ||
      lowerType.includes('pv') ||
      lowerType.includes('pvc') ||
      lowerType.includes('rook') ||
      lowerType.includes('longhorn') ||
      lowerType.includes('volume') ||
      lowerTitle.includes('storage') ||
      lowerTitle.includes('volume')
    expect(hasKeyword).toBe(true)
  })

  it.each(storageCards)('$name has icon configuration', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })
})
