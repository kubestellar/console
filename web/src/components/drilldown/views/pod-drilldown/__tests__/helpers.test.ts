import { describe, expect, it } from 'vitest'
import { getPodDiagnosis } from '../helpers'

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

  it('returns null when there is no failure signal', () => {
    expect(getPodDiagnosis({ status: 'Running', issues: [] })).toBeNull()
  })
})
