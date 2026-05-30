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
  { name: 'chaosMeshStatus', config: chaosMeshStatusConfig },
  { name: 'containerdStatus', config: containerdStatusConfig },
  { name: 'volcanoStatus', config: volcanoStatusConfig },
  { name: 'daprStatus', config: daprStatusConfig },
  { name: 'kubevirtStatus', config: kubevirtStatusConfig },
  { name: 'wasmcloudStatus', config: wasmcloudStatusConfig },
]

describe('Chaos & Runtime card configs', () => {
  it.each(chaosRuntimeCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(chaosRuntimeCards)('$name has category runtime', ({ config }) => {
    expect(config.category).toBe('runtime')
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
