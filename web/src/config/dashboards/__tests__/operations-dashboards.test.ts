/**
 * Individual Dashboard Config Tests - Operations & Observability
 *
 * Tests operations and observability dashboard configurations.
 */
import { describe, it, expect } from 'vitest'
import { alertsDashboardConfig } from '../alerts'
import { eventsDashboardConfig } from '../events'
import { logsDashboardConfig } from '../logs'
import { incidentResponseDashboardConfig } from '../incident-response'
import { insightsDashboardConfig } from '../insights'
import { karmadaOpsDashboardConfig } from '../karmada-ops'
import { nodesDashboardConfig } from '../nodes'
import { podsDashboardConfig } from '../pods'
import { servicesDashboardConfig } from '../services'

const operationsDashboards = [
  { name: 'alerts', config: alertsDashboardConfig },
  { name: 'events', config: eventsDashboardConfig },
  { name: 'logs', config: logsDashboardConfig },
  { name: 'incidentResponse', config: incidentResponseDashboardConfig },
  { name: 'insights', config: insightsDashboardConfig },
  { name: 'karmadaOps', config: karmadaOpsDashboardConfig },
  { name: 'nodes', config: nodesDashboardConfig },
  { name: 'pods', config: podsDashboardConfig },
  { name: 'services', config: servicesDashboardConfig },
]

describe('Operations & Observability dashboard configs', () => {
  it.each(operationsDashboards)('$name has required fields', ({ config }) => {
    expect(config.id).toBeTruthy()
    expect(typeof config.id).toBe('string')
    expect(config.name).toBeTruthy()
    expect(typeof config.name).toBe('string')
    expect(config.route).toBeTruthy()
    expect(config.route.startsWith('/')).toBe(true)
  })

  it.each(operationsDashboards)('$name has valid cards array', ({ config }) => {
    expect(Array.isArray(config.cards)).toBe(true)
    expect(config.cards.length).toBeGreaterThan(0)
  })

  it.each(operationsDashboards)('$name cards have valid positions', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.position).toBeDefined()
      expect(typeof card.position.w).toBe('number')
      expect(typeof card.position.h).toBe('number')
      expect(card.position.w).toBeGreaterThan(0)
      expect(card.position.h).toBeGreaterThan(0)
    })
  })

  it.each(operationsDashboards)('$name has storageKey', ({ config }) => {
    expect(config.storageKey).toBeTruthy()
    expect(typeof config.storageKey).toBe('string')
  })

  it.each(operationsDashboards)('$name cards have cardType', ({ config }) => {
    config.cards.forEach(card => {
      expect(card.cardType).toBeTruthy()
    })
  })
})
