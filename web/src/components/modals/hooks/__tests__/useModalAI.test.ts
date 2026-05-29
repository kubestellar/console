import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIAction, ResourceContext } from '../../types/modal.types'

const mockStartMission = vi.fn()
const mockUseMissions = vi.fn()

vi.mock('../../../../hooks/useMissions', () => ({
  useMissions: () => mockUseMissions(),
}))

import { useModalAI } from '../useModalAI'

const RESOURCE: ResourceContext = {
  kind: 'Pod',
  name: 'api-server',
  namespace: 'default',
  cluster: 'cluster-a',
  status: 'CrashLoopBackOff',
  labels: {
    app: 'api-server',
    tier: 'backend',
  },
}

const ISSUES = [
  { name: 'CrashLoopBackOff', message: 'Container keeps restarting' },
  { name: 'ImagePullBackOff', message: 'Registry credentials are missing' },
]

const ADDITIONAL_CONTEXT = {
  source: 'resource-modal',
}

function findAction(actions: AIAction[], id: AIAction['id']) {
  const action = actions.find(candidate => candidate.id === id)
  expect(action).toBeDefined()
  return action as AIAction
}

describe('useModalAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMissions.mockReturnValue({
      startMission: mockStartMission,
      agents: [{ id: 'agent-1' }],
    })
  })

  it('keeps defaultAIActions stable across rerenders when dependencies are unchanged', () => {
    const initialProps = {
      resource: RESOURCE,
      issues: ISSUES,
      additionalContext: ADDITIONAL_CONTEXT,
    }

    const { result, rerender } = renderHook(props => useModalAI(props), {
      initialProps,
    })

    const firstActions = result.current.defaultAIActions

    rerender(initialProps)

    expect(result.current.defaultAIActions).toBe(firstActions)
  })

  it('generates diagnose, repair, and ask prompts with resource details', () => {
    const { result } = renderHook(() => useModalAI({ resource: RESOURCE, issues: ISSUES }))

    const diagnoseAction = findAction(result.current.defaultAIActions, 'diagnose')
    const repairAction = findAction(result.current.defaultAIActions, 'repair')
    const askAction = findAction(result.current.defaultAIActions, 'ask')

    expect(diagnoseAction.promptTemplate).toContain('Analyze the health of Pod "api-server" in namespace "default" on cluster "cluster-a".')
    expect(diagnoseAction.promptTemplate).toContain('- Status: CrashLoopBackOff')
    expect(diagnoseAction.promptTemplate).toContain('Labels: app=api-server, tier=backend')
    expect(diagnoseAction.promptTemplate).toContain('- CrashLoopBackOff: Container keeps restarting')

    expect(repairAction.promptTemplate).toContain('I need help repairing issues with Pod "api-server" in namespace "default" on cluster "cluster-a".')
    expect(repairAction.promptTemplate).toContain('- ImagePullBackOff: Registry credentials are missing')
    expect(repairAction.promptTemplate).toContain('Suggest a fix with the exact kubectl commands needed')

    expect(askAction.promptTemplate).toBe('I have a question about Pod "api-server" in namespace "default" on cluster "cluster-a".')
  })

  it('disables actions when no AI agent is connected', () => {
    mockUseMissions.mockReturnValue({
      startMission: mockStartMission,
      agents: [],
    })

    const { result } = renderHook(() => useModalAI({ resource: RESOURCE, issues: ISSUES }))

    expect(result.current.isAgentConnected).toBe(false)

    for (const action of result.current.defaultAIActions) {
      expect(action.disabled).toBe(true)
      expect(action.disabledReason).toBe('AI agent not connected')
    }
  })

  it('starts a mission with the selected AI action prompt and context', () => {
    const { result } = renderHook(() => useModalAI({
      resource: RESOURCE,
      issues: ISSUES,
      additionalContext: ADDITIONAL_CONTEXT,
    }))

    const diagnoseAction = findAction(result.current.defaultAIActions, 'diagnose')

    act(() => {
      result.current.handleAIAction(diagnoseAction)
    })

    expect(mockStartMission).toHaveBeenCalledTimes(1)
    expect(mockStartMission).toHaveBeenCalledWith({
      title: 'Diagnose api-server',
      description: 'Analyze Pod health and identify issues',
      type: 'troubleshoot',
      cluster: 'cluster-a',
      skipReview: true,
      initialPrompt: diagnoseAction.promptTemplate,
      context: {
        kind: 'Pod',
        name: 'api-server',
        namespace: 'default',
        cluster: 'cluster-a',
        source: 'resource-modal',
      },
    })
  })
})
