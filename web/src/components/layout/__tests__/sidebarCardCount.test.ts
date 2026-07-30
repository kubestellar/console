import { describe, expect, it } from 'vitest'
import { getSidebarCardCount } from '../sidebarCardCount'
import { aiAgentsDashboardConfig } from '../../../config/dashboards/ai-agents'
import { mainDashboardConfig } from '../../../config/dashboards/main'

describe('getSidebarCardCount', () => {
  it('uses direct dashboard cards when present', () => {
    expect(getSidebarCardCount(mainDashboardConfig)).toBe(mainDashboardConfig.cards.length)
  })

  it('falls back to the first tab card count for tabbed dashboards', () => {
    expect(getSidebarCardCount(aiAgentsDashboardConfig)).toBe(aiAgentsDashboardConfig.tabs?.[0]?.cards.length)
  })

  it('returns null when the dashboard config is missing', () => {
    expect(getSidebarCardCount(undefined)).toBeNull()
  })
})
