/**
 * Individual Dashboard Config Tests - Compliance & Security
 *
 * Tests compliance and security dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { airgapDashboardConfig } from '../airgap'
import { complianceDashboardConfig } from '../compliance'
import { complianceFrameworksDashboardConfig } from '../compliance-frameworks'
import { complianceReportsDashboardConfig } from '../compliance-reports'
import { dataComplianceDashboardConfig } from '../data-compliance'
import { dataResidencyDashboardConfig } from '../data-residency'
import { fedrampDashboardConfig } from '../fedramp'
import { gxpDashboardConfig } from '../gxp'
import { hipaaDashboardConfig } from '../hipaa'
import { nistDashboardConfig } from '../nist'
import { stigDashboardConfig } from '../stig'
import { slsaDashboardConfig } from '../slsa'

const complianceDashboards = [
  { name: 'airgap', config: airgapDashboardConfig },
  { name: 'compliance', config: complianceDashboardConfig },
  { name: 'complianceFrameworks', config: complianceFrameworksDashboardConfig },
  { name: 'complianceReports', config: complianceReportsDashboardConfig },
  { name: 'dataCompliance', config: dataComplianceDashboardConfig },
  { name: 'dataResidency', config: dataResidencyDashboardConfig },
  { name: 'fedramp', config: fedrampDashboardConfig },
  { name: 'gxp', config: gxpDashboardConfig },
  { name: 'hipaa', config: hipaaDashboardConfig },
  { name: 'nist', config: nistDashboardConfig },
  { name: 'stig', config: stigDashboardConfig },
  { name: 'slsa', config: slsaDashboardConfig },
]

describe('Compliance & Security dashboard configs', () => {
  it.each(complianceDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(complianceDashboards)('$name has valid cards array', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    expect(config.cards.length).toBeGreaterThan(0)
  })

  it.each(complianceDashboards)('$name cards have unique IDs', ({ config }) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(complianceDashboards)('$name cards have valid cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(complianceDashboards)('$name cards have valid positions', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })

  it.each(complianceDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })

  it.each(complianceDashboards)('$name features object is valid when present', ({ config }) => {
    if (config.features) {
      expect(typeof config.features).toBe('object')
      if (config.features.autoRefreshInterval !== undefined) {
        expect(typeof config.features.autoRefreshInterval).toBe('number')
        expect(config.features.autoRefreshInterval).toBeGreaterThan(0)
      }
    }
  })
})
