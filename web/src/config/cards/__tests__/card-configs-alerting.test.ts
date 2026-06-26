/**
 * Alerting Card Config Tests
 *
 * Tests alert-related card configurations.
 */
import { describe, it, expect } from 'vitest'
import { activeAlertsConfig } from '../active-alerts'
import { alertRulesConfig } from '../alert-rules'
import { falcoAlertsConfig } from '../falco-alerts'
import { warningEventsConfig } from '../warning-events'
import { recentEventsConfig } from '../recent-events'

const alertCards = [
  { name: 'activeAlerts', config: activeAlertsConfig },
  { name: 'alertRules', config: alertRulesConfig },
  { name: 'falcoAlerts', config: falcoAlertsConfig },
  { name: 'warningEvents', config: warningEventsConfig },
  { name: 'recentEvents', config: recentEventsConfig },
]

describe('Alerting card configs', () => {
  it.each(alertCards)('$name has valid type, title, and category', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
  })

  it.each(alertCards)('$name has content config', ({ config }) => {
    expect(config.content).toBeDefined()
    expect(config.content.type).toBeTruthy()
  })

  it('activeAlerts has stats for severity levels', () => {
    expect(activeAlertsConfig.stats).toBeDefined()
    expect((activeAlertsConfig.stats || []).length).toBeGreaterThan(0)
  })

  it('activeAlerts has empty state config', () => {
    expect(activeAlertsConfig.emptyState).toBeDefined()
    expect(activeAlertsConfig.emptyState?.title).toBeTruthy()
  })

  it('activeAlerts has footer config', () => {
    expect(activeAlertsConfig.footer).toBeDefined()
    expect(activeAlertsConfig.footer?.showTotal).toBe(true)
  })
})
