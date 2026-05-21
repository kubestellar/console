/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { archiveToHistory, loadHistoryEntry, makeInitialState } from '../useMissionControl.state'

const FIRST_PHASE = 1
const TEST_PROJECT = {
  name: 'falco',
  displayName: 'Falco',
  reason: 'Runtime security',
  category: 'Security',
  priority: 'required' as const,
  dependencies: [],
}

describe('useMissionControl.state history', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads archived history by launched mission id', () => {
    const state = {
      ...makeInitialState(),
      title: 'Secure clusters',
      projects: [TEST_PROJECT],
      launchProgress: [
        {
          phase: FIRST_PHASE,
          status: 'completed' as const,
          projects: [
            {
              name: 'falco',
              missionId: 'deploy-mission-1',
              status: 'completed' as const,
            },
          ],
        },
      ],
    }

    archiveToHistory(state, 'planning-mission-1')

    expect(loadHistoryEntry('deploy-mission-1')).toMatchObject({
      title: 'Secure clusters',
      launchProgress: state.launchProgress,
    })
  })
})
