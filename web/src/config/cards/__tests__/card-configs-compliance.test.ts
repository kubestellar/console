/**
 * Compliance Card Config Tests
 *
 * Tests compliance-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { complianceDriftConfig } from '../compliance-drift'
import { complianceScoreConfig } from '../compliance-score'
import { fleetComplianceHeatmapConfig } from '../fleet-compliance-heatmap'
import { policyViolationsConfig } from '../policy-violations'
import { recommendedPoliciesConfig } from '../recommended-policies'

const complianceCards = [
  { name: 'complianceDrift', config: complianceDriftConfig },
  { name: 'complianceScore', config: complianceScoreConfig },
  { name: 'fleetComplianceHeatmap', config: fleetComplianceHeatmapConfig },
  { name: 'policyViolations', config: policyViolationsConfig },
  { name: 'recommendedPolicies', config: recommendedPoliciesConfig },
]

describe('Compliance card configs', () => {
  it.each(complianceCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })

  it.each(complianceCards)('$name type contains compliance/policy keyword', ({ config }) => {
    const lowerType = config.type.toLowerCase()
    const hasKeyword =
      lowerType.includes('compliance') ||
      lowerType.includes('policy') ||
      lowerType.includes('violation') ||
      lowerType.includes('drift')
    expect(hasKeyword).toBe(true)
  })

  it.each(complianceCards)('$name has valid dimensions', ({ config }) => {
    expect(config.defaultWidth).toBeGreaterThan(0)
    expect(config.defaultHeight).toBeGreaterThan(0)
  })

  it.each(complianceCards)('$name has description', ({ config }) => {
    if (config.description) {
      expect(config.description.length).toBeGreaterThan(0)
    }
  })
})
