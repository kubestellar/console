import { describe, expect, it } from 'vitest'
import type { Mission } from '../../../../hooks/useMissions'
import {
  ATTENTION_MISSION_STATUSES,
  BACKGROUND_EXECUTION_STATUSES,
  BACKGROUND_MISSION_PREVIEW_LIMIT,
  getMissionAttentionCount,
  matchesMissionSearch,
  MISSIONS_PAGE_SIZE,
} from '../missionSidebarConstants'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'test-1',
    title: 'Test mission',
    description: 'A test mission',
    type: 'custom',
    status: 'running',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  } as Mission
}

describe('missionSidebarConstants', () => {
  describe('exported constants', () => {
    it('ATTENTION_MISSION_STATUSES contains waiting_input and blocked', () => {
      expect(ATTENTION_MISSION_STATUSES.has('waiting_input')).toBe(true)
      expect(ATTENTION_MISSION_STATUSES.has('blocked')).toBe(true)
      expect(ATTENTION_MISSION_STATUSES.has('running')).toBe(false)
      expect(ATTENTION_MISSION_STATUSES.has('saved')).toBe(false)
    })

    it('BACKGROUND_EXECUTION_STATUSES contains pending, running, cancelling', () => {
      expect(BACKGROUND_EXECUTION_STATUSES.has('pending')).toBe(true)
      expect(BACKGROUND_EXECUTION_STATUSES.has('running')).toBe(true)
      expect(BACKGROUND_EXECUTION_STATUSES.has('cancelling')).toBe(true)
      expect(BACKGROUND_EXECUTION_STATUSES.has('saved')).toBe(false)
    })

    it('BACKGROUND_MISSION_PREVIEW_LIMIT is a positive number', () => {
      expect(BACKGROUND_MISSION_PREVIEW_LIMIT).toBeGreaterThan(0)
    })

    it('MISSIONS_PAGE_SIZE is a positive number', () => {
      expect(MISSIONS_PAGE_SIZE).toBeGreaterThan(0)
    })
  })

  describe('getMissionAttentionCount', () => {
    it('returns 0 for an empty array', () => {
      expect(getMissionAttentionCount([])).toBe(0)
    })

    it('returns 0 when no missions need attention', () => {
      const missions = [
        makeMission({ status: 'running' }),
        makeMission({ status: 'saved' }),
        makeMission({ status: 'completed' as Mission['status'] }),
      ]
      expect(getMissionAttentionCount(missions)).toBe(0)
    })

    it('counts waiting_input missions', () => {
      const missions = [
        makeMission({ status: 'waiting_input' }),
        makeMission({ status: 'running' }),
      ]
      expect(getMissionAttentionCount(missions)).toBe(1)
    })

    it('counts blocked missions', () => {
      const missions = [
        makeMission({ status: 'blocked' }),
        makeMission({ status: 'running' }),
      ]
      expect(getMissionAttentionCount(missions)).toBe(1)
    })

    it('counts multiple attention missions', () => {
      const missions = [
        makeMission({ status: 'waiting_input' }),
        makeMission({ status: 'blocked' }),
        makeMission({ status: 'waiting_input' }),
        makeMission({ status: 'running' }),
      ]
      expect(getMissionAttentionCount(missions)).toBe(3)
    })
  })

  describe('matchesMissionSearch', () => {
    const mission = makeMission({
      title: 'Deploy Istio Service Mesh',
      description: 'Install and configure Istio on the production cluster',
    })

    it('returns true for empty query', () => {
      expect(matchesMissionSearch(mission, '')).toBe(true)
    })

    it('matches title case-insensitively', () => {
      expect(matchesMissionSearch(mission, 'istio')).toBe(true)
      expect(matchesMissionSearch(mission, 'deploy')).toBe(true)
      expect(matchesMissionSearch(mission, 'ISTIO')).toBe(true)
    })

    it('matches description case-insensitively', () => {
      expect(matchesMissionSearch(mission, 'production')).toBe(true)
      expect(matchesMissionSearch(mission, 'configure')).toBe(true)
    })

    it('returns false for non-matching query', () => {
      expect(matchesMissionSearch(mission, 'kubernetes')).toBe(false)
      expect(matchesMissionSearch(mission, 'zzzzz')).toBe(false)
    })

    it('matches partial substrings', () => {
      expect(matchesMissionSearch(mission, 'ist')).toBe(true)
      expect(matchesMissionSearch(mission, 'mesh')).toBe(true)
    })
  })
})
