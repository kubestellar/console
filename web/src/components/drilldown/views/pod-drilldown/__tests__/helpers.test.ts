import { describe, expect, it } from 'vitest'
import { filterPodIssuesForDiagnosis, getPodDiagnosis } from '../helpers'

describe('getPodDiagnosis', () => {
  it('detects crash loops and surfaces exit details', () => {
    const diagnosis = getPodDiagnosis({
      status: 'CrashLoopBackOff',
      describeOutput: `State:          Waiting
  Reason:       CrashLoopBackOff
Last State:     Terminated
  Reason:       Error
  Exit Code:    1`,
      eventsOutput: 'Warning  BackOff  Back-off restarting failed container',
      logsOutput: 'application failed to start',
    })

    expect(diagnosis).toMatchObject({
      kind: 'crash-loop',
      currentStateReason: 'CrashLoopBackOff',
      lastExitReason: 'Error',
      exitCode: '1',
    })
  })

  it('detects OOMKilled pods from describe output', () => {
    const diagnosis = getPodDiagnosis({
      issues: ['OOMKilled'],
      describeOutput: `Last State:     Terminated
  Reason:       OOMKilled
  Exit Code:    137`,
    })

    expect(diagnosis).toMatchObject({
      kind: 'oom-killed',
      lastExitReason: 'OOMKilled',
      exitCode: '137',
    })
  })

  it('prioritizes OOMKilled over unrelated image pull warnings', () => {
    const diagnosis = getPodDiagnosis({
      status: 'Running',
      issues: ['OOMKilled', 'Warning: ErrImagePull — failed to pull image'],
      describeOutput: `State:          Waiting
  Reason:       CrashLoopBackOff
Last State:     Terminated
  Reason:       OOMKilled
  Exit Code:    137`,
      eventsOutput: 'Warning  Failed  ErrImagePull: image pull failed',
    })

    expect(diagnosis?.kind).toBe('oom-killed')
  })

  it('filters unrelated issues once the diagnosis is known', () => {
    expect(filterPodIssuesForDiagnosis([
      'OOMKilled',
      'CrashLoopBackOff',
      'Warning: ErrImagePull — failed to pull image',
    ], 'oom-killed')).toEqual(['OOMKilled', 'CrashLoopBackOff'])
  })

  it('returns null when there is no failure signal', () => {
    expect(getPodDiagnosis({ status: 'Running', issues: [] })).toBeNull()
  })
})
