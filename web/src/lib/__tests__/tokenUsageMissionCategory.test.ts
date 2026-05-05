import { describe, expect, it } from 'vitest'
import { getTokenCategoryForMissionType } from '../tokenUsageMissionCategory'

describe('getTokenCategoryForMissionType', () => {
  it('routes troubleshoot missions to diagnose usage', () => {
    expect(getTokenCategoryForMissionType('troubleshoot')).toBe('diagnose')
  })

  it('routes analyze missions to insights usage', () => {
    expect(getTokenCategoryForMissionType('analyze')).toBe('insights')
  })

  it('keeps repair-style missions in AI Missions', () => {
    expect(getTokenCategoryForMissionType('repair')).toBe('missions')
    expect(getTokenCategoryForMissionType('deploy')).toBe('missions')
    expect(getTokenCategoryForMissionType('custom')).toBe('missions')
  })
})
