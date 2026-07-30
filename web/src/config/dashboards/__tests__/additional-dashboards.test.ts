/**
 * Individual Dashboard Config Tests - Additional Dashboards
 *
 * Tests remaining dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { acmmDashboardConfig } from '../acmm'
import { arcadeDashboardConfig } from '../arcade'
import { clusterAdminDashboardConfig } from '../cluster-admin'
import { clustersDashboardConfig } from '../clusters'
import { computeDashboardConfig } from '../compute'
import { costDashboardConfig } from '../cost'
import { drasiDashboardConfig } from '../drasi'
import { mainDashboardConfig } from '../main'
import { multiTenancyDashboardConfig } from '../multi-tenancy'
import { networkDashboardConfig } from '../network'
import { oidcDashboardConfig } from '../oidc'
import { securityDashboardConfig } from '../security'
import { storageDashboardConfig } from '../storage'
import { workloadsDashboardConfig } from '../workloads'

const additionalDashboards = [
  { name: 'acmm', config: acmmDashboardConfig },
  { name: 'arcade', config: arcadeDashboardConfig },
  { name: 'clusterAdmin', config: clusterAdminDashboardConfig },
  { name: 'clusters', config: clustersDashboardConfig },
  { name: 'compute', config: computeDashboardConfig },
  { name: 'cost', config: costDashboardConfig },
  { name: 'drasi', config: drasiDashboardConfig },
  { name: 'main', config: mainDashboardConfig },
  { name: 'multiTenancy', config: multiTenancyDashboardConfig },
  { name: 'network', config: networkDashboardConfig },
  { name: 'oidc', config: oidcDashboardConfig },
  { name: 'security', config: securityDashboardConfig },
  { name: 'storage', config: storageDashboardConfig },
  { name: 'workloads', config: workloadsDashboardConfig },
]

describe('Additional dashboard configs', () => {
  it.each(additionalDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(additionalDashboards)('$name has valid cards array or tabs', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    const hasTabs = !!(config as Record<string, unknown>).tabs
    if (!hasTabs) {
      expect(config.cards.length).toBeGreaterThan(0)
    }
  })

  it.each(additionalDashboards)('$name cards have unique IDs', ({ config }) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(additionalDashboards)('$name cards have valid cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(additionalDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })

  it.each(additionalDashboards)('$name cards have valid positions', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })

  it.each(additionalDashboards)('$name features object is valid when present', ({ config }) => {
    if (config.features) {
      expect(typeof config.features).toBe('object')
      if (config.features.autoRefreshInterval !== undefined) {
        expect(typeof config.features.autoRefreshInterval).toBe('number')
        expect(config.features.autoRefreshInterval).toBeGreaterThan(0)
      }
    }
  })
})
