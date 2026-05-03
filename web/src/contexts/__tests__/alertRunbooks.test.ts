/**
 * Tests for contexts/alertRunbooks.ts
 *
 * Covers: findAndExecuteRunbook, buildDiagnosisPrompt
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock runbook dependencies
vi.mock('../../lib/runbooks/builtins', () => ({
  findRunbookForCondition: vi.fn(),
}))
vi.mock('../../lib/runbooks/executor', () => ({
  executeRunbook: vi.fn(),
}))

import { findAndExecuteRunbook, buildDiagnosisPrompt } from '../alertRunbooks'
import { findRunbookForCondition } from '../../lib/runbooks/builtins'
import { executeRunbook } from '../../lib/runbooks/executor'
import type { Alert } from '../../types/alerts'

const mockFindRunbook = findRunbookForCondition as ReturnType<typeof vi.fn>
const mockExecuteRunbook = executeRunbook as ReturnType<typeof vi.fn>

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'alert-1',
    ruleName: 'test-rule',
    severity: 'warning',
    message: 'Pod crash detected',
    status: 'firing',
    firedAt: new Date().toISOString(),
    cluster: 'test-cluster',
    namespace: 'default',
    resource: 'my-pod',
    resourceKind: 'Pod',
    details: { restarts: 5 },
    ...overrides,
  } as Alert
}

beforeEach(() => {
  vi.clearAllMocks()
})

// =============================================================================
// findAndExecuteRunbook
// =============================================================================

describe('findAndExecuteRunbook', () => {
  it('returns null when conditionType is undefined', async () => {
    const result = await findAndExecuteRunbook(undefined, makeAlert())
    expect(result).toBeNull()
    expect(mockFindRunbook).not.toHaveBeenCalled()
  })

  it('returns null when conditionType is empty string', async () => {
    const result = await findAndExecuteRunbook('', makeAlert())
    expect(result).toBeNull()
  })

  it('returns null when no runbook is found for condition', async () => {
    mockFindRunbook.mockReturnValue(null)
    const result = await findAndExecuteRunbook('unknown_condition', makeAlert())
    expect(result).toBeNull()
    expect(mockFindRunbook).toHaveBeenCalledWith('unknown_condition')
  })

  it('executes runbook and returns enriched result', async () => {
    const runbook = { title: 'Pod CrashLoop Runbook', steps: [] }
    mockFindRunbook.mockReturnValue(runbook)
    mockExecuteRunbook.mockResolvedValue({
      enrichedPrompt: 'Gathered logs from pod',
      stepResults: [{ step: 'get-logs', output: 'OOMKilled' }],
    })

    const alert = makeAlert()
    const result = await findAndExecuteRunbook('pod_crash_loop', alert)

    expect(result).not.toBeNull()
    expect(result!.enrichedPrompt).toContain('Runbook Evidence')
    expect(result!.enrichedPrompt).toContain('Pod CrashLoop Runbook')
    expect(result!.stepResults).toHaveLength(1)
    expect(mockExecuteRunbook).toHaveBeenCalledWith(runbook, {
      cluster: 'test-cluster',
      namespace: 'default',
      resource: 'my-pod',
      resourceKind: 'Pod',
      alertMessage: 'Pod crash detected',
    })
  })

  it('returns null when runbook result has no enrichedPrompt', async () => {
    mockFindRunbook.mockReturnValue({ title: 'Empty Runbook', steps: [] })
    mockExecuteRunbook.mockResolvedValue({
      enrichedPrompt: '',
      stepResults: [],
    })

    const result = await findAndExecuteRunbook('some_condition', makeAlert())
    expect(result).toBeNull()
  })

  it('returns null on execution error (silent failure)', async () => {
    mockFindRunbook.mockReturnValue({ title: 'Failing Runbook', steps: [] })
    mockExecuteRunbook.mockRejectedValue(new Error('Connection refused'))

    const result = await findAndExecuteRunbook('some_condition', makeAlert())
    expect(result).toBeNull()
  })
})

// =============================================================================
// buildDiagnosisPrompt
// =============================================================================

describe('buildDiagnosisPrompt', () => {
  it('includes alert details in the prompt', () => {
    const alert = makeAlert({
      ruleName: 'HighMemory',
      severity: 'critical',
      message: 'Memory usage exceeds 90%',
      cluster: 'prod-cluster',
      resource: 'worker-pod-1',
      details: { usage: '92%' },
    })
    const prompt = buildDiagnosisPrompt(alert, '')

    expect(prompt).toContain('HighMemory')
    expect(prompt).toContain('critical')
    expect(prompt).toContain('Memory usage exceeds 90%')
    expect(prompt).toContain('prod-cluster')
    expect(prompt).toContain('worker-pod-1')
    expect(prompt).toContain('92%')
  })

  it('appends runbook evidence when provided', () => {
    const alert = makeAlert()
    const evidence = '\n\n--- Runbook Evidence (Test) ---\nLogs show OOMKilled'
    const prompt = buildDiagnosisPrompt(alert, evidence)

    expect(prompt).toContain('Runbook Evidence')
    expect(prompt).toContain('OOMKilled')
  })

  it('handles missing cluster and resource gracefully', () => {
    const alert = makeAlert({ cluster: undefined, resource: undefined })
    const prompt = buildDiagnosisPrompt(alert, '')

    expect(prompt).toContain('N/A')
  })

  it('includes diagnosis request sections', () => {
    const prompt = buildDiagnosisPrompt(makeAlert(), '')

    expect(prompt).toContain('summary of the issue')
    expect(prompt).toContain('root cause')
    expect(prompt).toContain('Suggested actions')
  })
})
