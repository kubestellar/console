import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TYPE_COLOR,
  FETCH_TIMEOUT_MS,
  MAX_PREVIEW_STEPS,
  TABS,
  TYPE_COLORS,
} from '../MissionLandingPage.constants'
import type { MissionExport } from '../../../lib/missions/types'

describe('MissionLandingPage constants', () => {
  it('FETCH_TIMEOUT_MS is 10s', () => {
    expect(FETCH_TIMEOUT_MS).toBe(10_000)
  })

  it('MAX_PREVIEW_STEPS is 5', () => {
    expect(MAX_PREVIEW_STEPS).toBe(5)
  })

  it('TYPE_COLORS covers the six documented mission types', () => {
    for (const t of ['repair', 'troubleshoot', 'deploy', 'upgrade', 'analyze', 'custom']) {
      expect(TYPE_COLORS[t]).toMatch(/^bg-\w+-500\/20\b/)
    }
  })

  it('DEFAULT_TYPE_COLOR matches the "custom" style so unknown types render gracefully', () => {
    expect(DEFAULT_TYPE_COLOR).toBe(TYPE_COLORS.custom)
  })
})

describe('TABS', () => {
  it('exposes exactly the four canonical tab ids in order', () => {
    expect(TABS.map((t) => t.id)).toEqual(['install', 'uninstall', 'upgrade', 'troubleshoot'])
  })

  it('every tab has a non-empty label, an icon, and a distinct empty message', () => {
    const messages = new Set<string>()
    for (const tab of TABS) {
      expect(tab.label.length).toBeGreaterThan(0)
      expect(typeof tab.icon).toBe('string')
      expect(tab.icon.length).toBeGreaterThan(0)
      expect(tab.emptyMessage.length).toBeGreaterThan(0)
      messages.add(tab.emptyMessage)
    }
    expect(messages.size).toBe(TABS.length)
  })

  it('install tab pulls from mission.steps', () => {
    const install = TABS.find((t) => t.id === 'install')!
    const mission = { steps: [{ command: 'kubectl apply' }] } as unknown as MissionExport
    expect(install.getSteps(mission)).toEqual([{ command: 'kubectl apply' }])
  })

  it('uninstall tab pulls from mission.uninstall', () => {
    const tab = TABS.find((t) => t.id === 'uninstall')!
    const mission = { uninstall: [{ command: 'helm uninstall' }] } as unknown as MissionExport
    expect(tab.getSteps(mission)).toEqual([{ command: 'helm uninstall' }])
  })

  it('upgrade tab pulls from mission.upgrade', () => {
    const tab = TABS.find((t) => t.id === 'upgrade')!
    const mission = { upgrade: [{ command: 'helm upgrade' }] } as unknown as MissionExport
    expect(tab.getSteps(mission)).toEqual([{ command: 'helm upgrade' }])
  })

  it('troubleshoot tab pulls from mission.troubleshooting', () => {
    const tab = TABS.find((t) => t.id === 'troubleshoot')!
    const mission = { troubleshooting: [{ command: 'kubectl logs' }] } as unknown as MissionExport
    expect(tab.getSteps(mission)).toEqual([{ command: 'kubectl logs' }])
  })

  it('every getSteps returns an empty array when the mission omits the section', () => {
    const emptyMission = {} as MissionExport
    for (const tab of TABS) {
      expect(tab.getSteps(emptyMission)).toEqual([])
    }
  })
})
