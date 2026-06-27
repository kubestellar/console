// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hardwareHealthConfig } from '../hardware-health'
import * as moduleExports from '../hardware-health'
import { registerCardConfigTest } from './card-config-test-helpers'

registerCardConfigTest('hardware-health', moduleExports)

describe('hardware-health configuration coverage', () => {
  it('validates all required fields', () => {
    expect(hardwareHealthConfig.type).toBe('hardware_health')
    expect(hardwareHealthConfig.title).toBe('Hardware Health')
    expect(hardwareHealthConfig.category).toBe('cluster-health')
    expect(hardwareHealthConfig.description).toBe('Track hardware device disappearances on SuperMicro/HGX nodes')
  })

  it('validates appearance fields', () => {
    expect(hardwareHealthConfig.icon).toBe('Cpu')
    expect(hardwareHealthConfig.iconColor).toBe('text-red-400')
    expect(hardwareHealthConfig.defaultWidth).toBe(6)
    expect(hardwareHealthConfig.defaultHeight).toBe(3)
  })

  it('validates data source configuration', () => {
    expect(hardwareHealthConfig.dataSource.type).toBe('hook')
    expect(hardwareHealthConfig.dataSource.hook).toBe('useHardwareHealth')
  })

  it('validates content configuration', () => {
    expect(hardwareHealthConfig.content.type).toBe('list')
    expect(hardwareHealthConfig.content.pageSize).toBe(5)
    expect(hardwareHealthConfig.content.columns).toBeDefined()
    expect(hardwareHealthConfig.content.columns).toHaveLength(5)
    expect(hardwareHealthConfig.content.columns?.[0].field).toBe('nodeName')
    expect(hardwareHealthConfig.content.columns?.[0].primary).toBe(true)
    expect(hardwareHealthConfig.content.columns?.[4].render).toBe('severity-badge')
  })

  it('validates empty state configuration', () => {
    expect(hardwareHealthConfig.emptyState?.icon).toBe('CheckCircle')
    expect(hardwareHealthConfig.emptyState?.title).toBe('All Healthy')
    expect(hardwareHealthConfig.emptyState?.variant).toBe('success')
  })

  it('validates loading state configuration', () => {
    expect(hardwareHealthConfig.loadingState?.type).toBe('list')
    expect(hardwareHealthConfig.loadingState?.rows).toBe(3)
  })

  it('validates metadata fields', () => {
    expect(hardwareHealthConfig.isDemoData).toBe(false)
    expect(hardwareHealthConfig.isLive).toBe(true)
  })
})
