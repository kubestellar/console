/**
 * Individual Dashboard Config Tests - Governance & Risk
 *
 * Tests governance and risk management dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { baaDashboardConfig } from '../baa'
import { changeControlDashboardConfig } from '../change-control'
import { rbacAuditDashboardConfig } from '../rbac-audit'
import { riskAppetiteDashboardConfig } from '../risk-appetite'
import { riskMatrixDashboardConfig } from '../risk-matrix'
import { riskRegisterDashboardConfig } from '../risk-register'
import { sbomDashboardConfig } from '../sbom'
import { segregationOfDutiesDashboardConfig } from '../segregation-of-duties'
import { sessionManagementDashboardConfig } from '../session-management'
import { siemDashboardConfig } from '../siem'
import { sigstoreDashboardConfig } from '../sigstore'
import { threatIntelDashboardConfig } from '../threat-intel'

const governanceDashboards = [
  { name: 'baa', config: baaDashboardConfig },
  { name: 'changeControl', config: changeControlDashboardConfig },
  { name: 'rbacAudit', config: rbacAuditDashboardConfig },
  { name: 'riskAppetite', config: riskAppetiteDashboardConfig },
  { name: 'riskMatrix', config: riskMatrixDashboardConfig },
  { name: 'riskRegister', config: riskRegisterDashboardConfig },
  { name: 'sbom', config: sbomDashboardConfig },
  { name: 'segregationOfDuties', config: segregationOfDutiesDashboardConfig },
  { name: 'sessionManagement', config: sessionManagementDashboardConfig },
  { name: 'siem', config: siemDashboardConfig },
  { name: 'sigstore', config: sigstoreDashboardConfig },
  { name: 'threatIntel', config: threatIntelDashboardConfig },
]

describe('Governance & Risk dashboard configs', () => {
  it.each(governanceDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(governanceDashboards)('$name has valid cards array', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    expect(config.cards.length).toBeGreaterThan(0)
  })

  it.each(governanceDashboards)('$name cards have unique IDs', ({ config }) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(governanceDashboards)('$name cards have valid cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(governanceDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })

  it.each(governanceDashboards)('$name cards have valid positions', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })
})
