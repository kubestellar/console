import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock authFetch and constants
vi.mock('../../api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../../constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 30000,
}))

import { executeRunbook } from '../executor'
import { authFetch } from '../../api'
import type { Runbook, RunbookContext } from '../types'

const mockAuthFetch = vi.mocked(authFetch)

describe('executeRunbook', () => {
  const baseRunbook: Runbook = {
    id: 'test-runbook',
    title: 'Test Runbook',
    description: 'A test runbook',
    triggers: [{ conditionType: 'pod_crash' }],
    evidenceSteps: [
      {
        id: 'step-1',
        label: 'Get events',
        source: 'mcp',
        tool: 'get_events',
        args: { cluster: '{{cluster}}', namespace: '{{namespace}}' },
      },
    ],
    analysisPrompt: 'Analyze: {{evidence}} for {{cluster}} in {{namespace}}',
  }

  const baseContext: RunbookContext = {
    cluster: 'prod-cluster',
    namespace: 'default',
    resource: 'my-pod',
    resourceKind: 'Pod',
    alertMessage: 'CrashLoopBackOff',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes a single MCP step successfully', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ events: ['event1'] }),
    } as Response)

    const result = await executeRunbook(baseRunbook, baseContext)

    expect(result.runbookId).toBe('test-runbook')
    expect(result.runbookTitle).toBe('Test Runbook')
    expect(result.stepResults).toHaveLength(1)
    expect(result.stepResults[0].status).toBe('success')
    expect(result.stepResults[0].data).toEqual({ events: ['event1'] })
    expect(result.stepResults[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(result.startedAt).toBeTruthy()
    expect(result.completedAt).toBeTruthy()
  })

  it('resolves template variables in args', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response)

    await executeRunbook(baseRunbook, baseContext)

    // #7286 — MCP payload uses { name, arguments } not { tool, args }
    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.arguments.cluster).toBe('prod-cluster')
    expect(callBody.arguments.namespace).toBe('default')
  })

  it('resolves template variables in analysis prompt', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    } as Response)

    const result = await executeRunbook(baseRunbook, baseContext)

    expect(result.enrichedPrompt).toContain('prod-cluster')
    expect(result.enrichedPrompt).toContain('default')
  })

  it('handles step failure for required steps', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const result = await executeRunbook(baseRunbook, baseContext)

    expect(result.stepResults[0].status).toBe('failed')
    expect(result.stepResults[0].error).toContain('500')
  })

  it('marks optional steps as skipped on failure', async () => {
    const runbook: Runbook = {
      ...baseRunbook,
      evidenceSteps: [
        {
          id: 'optional-step',
          label: 'Optional trace',
          source: 'gadget',
          tool: 'trace_exec',
          args: { cluster: '{{cluster}}' },
          optional: true,
        },
      ],
    }

    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await executeRunbook(runbook, baseContext)
    expect(result.stepResults[0].status).toBe('skipped')
    expect(result.stepResults[0].error).toBeTruthy()
  })

  it('executes gadget steps via gadget API', async () => {
    const runbook: Runbook = {
      ...baseRunbook,
      evidenceSteps: [
        {
          id: 'gadget-step',
          label: 'Trace processes',
          source: 'gadget',
          tool: 'trace_exec',
          args: { cluster: '{{cluster}}' },
        },
      ],
    }

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ isError: false, result: { traces: [] } }),
    } as Response)

    const result = await executeRunbook(runbook, baseContext)

    expect(result.stepResults[0].status).toBe('success')
    // Should call gadget endpoint
    expect(mockAuthFetch.mock.calls[0][0]).toContain('/api/gadget/trace')
  })

  it('handles gadget tool errors', async () => {
    const runbook: Runbook = {
      ...baseRunbook,
      evidenceSteps: [
        {
          id: 'gadget-step',
          label: 'Trace processes',
          source: 'gadget',
          tool: 'trace_exec',
          args: { cluster: '{{cluster}}' },
        },
      ],
    }

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ isError: true }),
    } as Response)

    const result = await executeRunbook(runbook, baseContext)
    expect(result.stepResults[0].status).toBe('failed')
    expect(result.stepResults[0].error).toContain('Gadget tool error')
  })

  it('calls onProgress callback with step updates', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ events: [] }),
    } as Response)

    const onProgress = vi.fn()
    await executeRunbook(baseRunbook, baseContext, onProgress)

    // Initial state (pending), running state, completed state
    expect(onProgress).toHaveBeenCalledTimes(3)

    // First call passes stepResults by reference (mutated later), so check
    // the spread-copied calls (2nd and 3rd) which preserve their snapshot.
    // Second call: running state
    expect(onProgress.mock.calls[1][0][0].status).toBe('running')
    // Third call: success state
    expect(onProgress.mock.calls[2][0][0].status).toBe('success')
  })

  it('executes multiple steps sequentially', async () => {
    const runbook: Runbook = {
      ...baseRunbook,
      evidenceSteps: [
        { id: 'step-1', label: 'Step 1', source: 'mcp', tool: 'get_events', args: {} },
        { id: 'step-2', label: 'Step 2', source: 'mcp', tool: 'get_pods', args: {} },
      ],
    }

    mockAuthFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pods: [] }),
      } as Response)

    const result = await executeRunbook(runbook, baseContext)
    expect(result.stepResults).toHaveLength(2)
    expect(result.stepResults[0].status).toBe('success')
    expect(result.stepResults[1].status).toBe('success')
  })

  it('includes evidence in enriched prompt', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ events: ['critical event'] }),
    } as Response)

    const result = await executeRunbook(baseRunbook, baseContext)
    expect(result.enrichedPrompt).toContain('Get events')
    expect(result.enrichedPrompt).toContain('critical event')
  })

  it('handles no evidence gathered', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('network error'))

    const result = await executeRunbook(baseRunbook, baseContext)
    expect(result.enrichedPrompt).toContain('No evidence could be gathered')
  })

  it('uses default context values when not provided', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response)

    const minimalContext: RunbookContext = {}
    await executeRunbook(baseRunbook, minimalContext)

    // #7286 — MCP payload uses { name, arguments } not { tool, args }
    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.arguments.cluster).toBe('unknown')
    expect(callBody.arguments.namespace).toBe('default')
  })

  it('converts numeric string args to numbers', async () => {
    const runbook: Runbook = {
      ...baseRunbook,
      evidenceSteps: [
        { id: 'step-1', label: 'Step', source: 'mcp', tool: 'get_events', args: { limit: '20' } },
      ],
    }

    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as Response)

    await executeRunbook(runbook, baseContext)

    // #7286 — MCP payload uses { name, arguments } not { tool, args }
    const callBody = JSON.parse(mockAuthFetch.mock.calls[0][1]?.body as string)
    expect(callBody.arguments.limit).toBe(20)
    expect(typeof callBody.arguments.limit).toBe('number')
  })
})
