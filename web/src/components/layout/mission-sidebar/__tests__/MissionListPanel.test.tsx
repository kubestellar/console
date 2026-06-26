import { describe, expect, it } from 'vitest'
import type { Mission } from '../../../../hooks/useMissions'
import {
  getMissionControlRunSummary,
  getMissionControlStatusClass,
  isMissionControlRun,
} from '../../../mission-control/missionControlHistory'

const missionControlRun: Mission = {
  id: 'mc-1',
  title: 'Secure clusters',
  description: 'Deploy Falco and Kyverno',
  type: 'deploy',
  status: 'completed',
  progress: 100,
  messages: [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Use the new tooling to verify policies and review runtime alerts.',
      timestamp: new Date('2026-01-01T00:00:00Z'),
    },
  ],
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T01:00:00Z'),
  context: {
    source: 'mission-control',
    workloads: ['falco', 'kyverno'],
    targetClusters: ['cluster-a', 'cluster-b'],
  },
}

describe('missionControlHistory', () => {
  it('surfaces mission control history with progress and guidance', () => {
    expect(isMissionControlRun(missionControlRun)).toBe(true)
    expect(getMissionControlStatusClass(missionControlRun.status)).toBe('text-green-400')
    expect(getMissionControlRunSummary(missionControlRun)).toEqual({
      clusters: 2,
      workloads: 2,
      guidance: 'Use the new tooling to verify policies and review runtime alerts.',
      progress: 100,
    })
  })
})
