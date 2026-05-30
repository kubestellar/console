/**
 * Operators & Extensions Card Config Tests
 *
 * Tests operator and extension-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { operatorStatusConfig } from '../operator-status'
import { operatorSubscriptionStatusConfig } from '../operator-subscription-status'
import { kedaStatusConfig } from '../keda-status'
import { kubevelaStatusConfig } from '../kubevela-status'
import { strimziStatusConfig } from '../strimzi-status'
import { cloudCustodianStatusConfig } from '../cloud-custodian-status'
import { backstageStatusConfig } from '../backstage-status'
import { dragonflyStatusConfig } from '../dragonfly-status'

const operatorCards = [
  { name: 'operatorStatus', config: operatorStatusConfig },
  { name: 'operatorSubscriptionStatus', config: operatorSubscriptionStatusConfig },
  { name: 'kedaStatus', config: kedaStatusConfig },
  { name: 'kubevelaStatus', config: kubevelaStatusConfig },
  { name: 'strimziStatus', config: strimziStatusConfig },
  { name: 'cloudCustodianStatus', config: cloudCustodianStatusConfig },
  { name: 'backstageStatus', config: backstageStatusConfig },
  { name: 'dragonflyStatus', config: dragonflyStatusConfig },
]

describe('Operators & Extensions card configs', () => {
  it.each(operatorCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(operatorCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(operatorCards)('$name has icon configuration', ({ config }) => {
    expect(config.icon).toBeTruthy()
  })

  it.each(operatorCards)('$name category is defined', ({ config }) => {
    expect(config.category).toBeTruthy()
    expect(typeof config.category).toBe('string')
  })
})
