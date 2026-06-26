/**
 * Chaos Engineering & Runtime Card Config Tests
 *
 * Tests chaos engineering and runtime-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { chaosMeshStatusConfig } from '../chaos-mesh-status'
import { containerdStatusConfig } from '../containerd-status'
import { volcanoStatusConfig } from '../volcano-status'
import { daprStatusConfig } from '../dapr-status'
import { kubevirtStatusConfig } from '../kubevirt-status'
import { wasmcloudStatusConfig } from '../wasmcloud-status'

const chaosRuntimeCards = [
  { name: 'chaosMeshStatus', config: chaosMeshStatusConfig, expectedCategory: 'runtime' },
  { name: 'containerdStatus', config: containerdStatusConfig, expectedCategory: 'compute' },
  { name: 'volcanoStatus', config: volcanoStatusConfig, expectedCategory: 'workloads' },
  { name: 'daprStatus', config: daprStatusConfig, expectedCategory: 'workloads' },
  { name: 'kubevirtStatus', config: kubevirtStatusConfig, expectedCategory: 'operators' },
  { name: 'wasmcloudStatus', config: wasmcloudStatusConfig, expectedCategory: 'workloads' },
]

describe('Chaos & Runtime card configs', () => {
  it.each(chaosRuntimeCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(chaosRuntimeCards)('$name has the expected category', ({ config, expectedCategory }) => {
    expect(config.category).toBe(expectedCategory)
  })

  it.each(chaosRuntimeCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(chaosRuntimeCards)('$name has emptyState', ({ config }) => {
    expect(config.emptyState).toBeDefined()
    expect(config.emptyState?.title).toBeTruthy()
  })

  it.each(chaosRuntimeCards)('$name has icon', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })
})
