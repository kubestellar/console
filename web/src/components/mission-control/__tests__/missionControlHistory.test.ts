import { describe, expect, it } from 'vitest'

import {
  MISSION_CONTROL_STATUS_LABEL_KEYS,
  getMissionControlRunSummary,
  getMissionControlStatusClass,
  isMissionControlRun,
} from '../missionControlHistory'
import type { Mission } from '../../../hooks/useMissions'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm-1',
    status: 'running',
    context: {},
    messages: [],
    progress: null,
    ...overrides,
  } as unknown as Mission
}

describe('MISSION_CONTROL_STATUS_LABEL_KEYS', () => {
  it('covers every Mission status with a stable i18n key', () => {
    const expected: Mission['status'][] = [
      'pending', 'running', 'cancelling', 'cancelled',
      'waiting_input', 'completed', 'failed', 'blocked', 'saved',
    ]
    for (const s of expected) {
      expect(MISSION_CONTROL_STATUS_LABEL_KEYS[s]).toMatch(/^missionSidebar\.statusLabels\./)
    }
  })

  it('maps waiting_input to the camelCased waitingInput key', () => {
    expect(MISSION_CONTROL_STATUS_LABEL_KEYS.waiting_input).toBe('missionSidebar.statusLabels.waitingInput')
  })
})

describe('isMissionControlRun', () => {
  it('returns true when context.source === "mission-control"', () => {
    expect(isMissionControlRun(makeMission({ context: { source: 'mission-control' } as unknown as Mission['context'] }))).toBe(true)
  })

  it('returns false when source is missing', () => {
    expect(isMissionControlRun(makeMission({ context: {} as unknown as Mission['context'] }))).toBe(false)
  })

  it('returns false when source is a different value', () => {
    expect(isMissionControlRun(makeMission({ context: { source: 'chat' } as unknown as Mission['context'] }))).toBe(false)
  })

  it('returns false when context is undefined', () => {
    expect(isMissionControlRun(makeMission({ context: undefined as unknown as Mission['context'] }))).toBe(false)
  })
})

describe('getMissionControlRunSummary', () => {
  it('counts targetClusters and workloads when they are arrays', () => {
    const summary = getMissionControlRunSummary(makeMission({
      context: { targetClusters: ['c1', 'c2', 'c3'], workloads: ['w1'] } as unknown as Mission['context'],
    }))
    expect(summary.clusters).toBe(3)
    expect(summary.workloads).toBe(1)
  })

  it('defaults counts to 0 when targetClusters/workloads are missing or wrong type', () => {
    const summary = getMissionControlRunSummary(makeMission({
      context: { targetClusters: 'not-an-array', workloads: undefined } as unknown as Mission['context'],
    }))
    expect(summary.clusters).toBe(0)
    expect(summary.workloads).toBe(0)
  })

  it('pulls the most recent assistant message as guidance and collapses whitespace', () => {
    const summary = getMissionControlRunSummary(makeMission({
      messages: [
        { role: 'assistant', content: 'first assistant reply' },
        { role: 'user', content: 'user prompt' },
        { role: 'assistant', content: '  latest\treply\n with   whitespace  ' },
      ] as unknown as Mission['messages'],
    }))
    expect(summary.guidance).toBe('latest reply with whitespace')
  })

  it('caps guidance at 120 characters', () => {
    const long = 'x'.repeat(500)
    const summary = getMissionControlRunSummary(makeMission({
      messages: [{ role: 'assistant', content: long }] as unknown as Mission['messages'],
    }))
    expect(summary.guidance).toHaveLength(120)
  })

  it('returns an empty guidance string when there are no assistant messages', () => {
    const summary = getMissionControlRunSummary(makeMission({
      messages: [{ role: 'user', content: 'nothing from assistant' }] as unknown as Mission['messages'],
    }))
    expect(summary.guidance).toBe('')
  })

  it('ignores assistant messages whose content is not a non-empty string', () => {
    const summary = getMissionControlRunSummary(makeMission({
      messages: [
        { role: 'assistant', content: 'real reply' },
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 42 as unknown as string },
      ] as unknown as Mission['messages'],
    }))
    expect(summary.guidance).toBe('real reply')
  })

  it('rounds numeric progress and clamps to [0, 100]', () => {
    expect(getMissionControlRunSummary(makeMission({ progress: 42.6 as unknown as number })).progress).toBe(43)
    expect(getMissionControlRunSummary(makeMission({ progress: 150 as unknown as number })).progress).toBe(100)
    expect(getMissionControlRunSummary(makeMission({ progress: -5 as unknown as number })).progress).toBe(0)
  })

  it('reports 100 progress for completed missions with no numeric progress', () => {
    expect(getMissionControlRunSummary(makeMission({ status: 'completed', progress: null as unknown as number })).progress).toBe(100)
  })

  it('reports null progress for non-completed missions with no numeric progress', () => {
    expect(getMissionControlRunSummary(makeMission({ status: 'running', progress: null as unknown as number })).progress).toBeNull()
  })
})

describe('getMissionControlStatusClass', () => {
  it('returns green-400 for completed', () => {
    expect(getMissionControlStatusClass('completed')).toBe('text-green-400')
  })
  it.each(['failed' as const, 'cancelled' as const])('returns red-400 for %s', (s) => {
    expect(getMissionControlStatusClass(s)).toBe('text-red-400')
  })
  it.each(['running' as const, 'waiting_input' as const])('returns amber-400 for %s', (s) => {
    expect(getMissionControlStatusClass(s)).toBe('text-amber-400')
  })
  it.each(['pending' as const, 'cancelling' as const, 'blocked' as const, 'saved' as const])(
    'returns muted-foreground for %s (default branch)',
    (s) => {
      expect(getMissionControlStatusClass(s)).toBe('text-muted-foreground')
    },
  )
})
