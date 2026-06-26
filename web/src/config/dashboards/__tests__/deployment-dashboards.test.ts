/**
 * Individual Dashboard Config Tests - Deployments & GitOps
 *
 * Tests deployment and GitOps dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { deployDashboardConfig } from '../deploy'
import { deploymentsDashboardConfig } from '../deployments'
import { gitopsDashboardConfig } from '../gitops'
import { helmDashboardConfig } from '../helm'
import { operatorsDashboardConfig } from '../operators'
import { ciCdDashboardConfig } from '../ci-cd'

const deploymentDashboards = [
  { name: 'deploy', config: deployDashboardConfig },
  { name: 'deployments', config: deploymentsDashboardConfig },
  { name: 'gitops', config: gitopsDashboardConfig },
  { name: 'helm', config: helmDashboardConfig },
  { name: 'operators', config: operatorsDashboardConfig },
  { name: 'ciCd', config: ciCdDashboardConfig },
]

describe('Deployments & GitOps dashboard configs', () => {
  it.each(deploymentDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(deploymentDashboards)('$name has valid cards array', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    expect(config.cards.length).toBeGreaterThan(0)
  })

  it.each(deploymentDashboards)('$name cards have unique IDs', ({ config }) => {
    const ids = config.cards.map(c => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it.each(deploymentDashboards)('$name cards have valid cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
      expect(typeof card.cardType).toBe('string')
    })
  })

  it.each(deploymentDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })

  it.each(deploymentDashboards)('$name cards have valid positions', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })
})
