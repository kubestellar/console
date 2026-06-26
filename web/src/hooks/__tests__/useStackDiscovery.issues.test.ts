import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'

import {
  EMPTY_RESPONSE,
  flush,
  k8sResponse,
  makeEPPService,
  makePod,
  mockExec,
  nsResponse,
  registerUseStackDiscoveryTestHooks,
  setupMockExec,
} from './useStackDiscovery.shared'

const { useStackDiscovery } = await import('../useStackDiscovery')

describe('useStackDiscovery', () => {
  registerUseStackDiscoveryTestHooks()

  // ── 7. Error handling ──────────────────────────────────────────────────────

  it('skips unreachable clusters without setting error state', async () => {
    setupMockExec({ clusterError: true })

    const { result, unmount } = renderHook(() => useStackDiscovery(['bad-cluster']))
    await flush()

    // After processing an unreachable cluster, stacks remain empty and no error is set
    expect(result.current.stacks).toEqual([])
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('handles JSON parse errors in service response gracefully', async () => {
    mockExec.mockImplementation((args: string[]) => {
      const cmd = args.join(' ')
      if (cmd.includes('pods') && cmd.includes('llm-d.ai/role')) return Promise.resolve(k8sResponse([makePod('p-0', 'ns1', 'both')]))
      if (cmd.includes('services')) return Promise.resolve({ output: 'NOT-JSON', exitCode: 0 })
      if (cmd.includes('namespaces')) return Promise.resolve(nsResponse([]))
      return Promise.resolve(EMPTY_RESPONSE)
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).toBeNull()
    expect(result.current.error).toBeNull()
    unmount()
  })

  it('handles per-cluster errors without crashing (continues to next cluster)', async () => {
    // First cluster throws; we expect no crash and stacks to be empty
    mockExec.mockRejectedValue(new Error('network failure'))

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    // The hook should not crash on rejected promises — stacks remain empty
    expect(result.current.stacks).toEqual([])
    unmount()
  })

  // ── 11. Stack status computation ───────────────────────────────────────────

  it('computes status=healthy when all components are running', async () => {
    setupMockExec({
      pods: [
        makePod('prefill-0', 'ns1', 'prefill', 'Running', true),
        makePod('decode-0', 'ns1', 'decode', 'Running', true),
      ],
      services: [makeEPPService('ns1-epp', 'ns1')],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].status).toBe('healthy')
    unmount()
  })

  it('computes status=unhealthy when no components are running', async () => {
    setupMockExec({
      pods: [
        makePod('prefill-0', 'ns1', 'prefill', 'Pending', false),
        makePod('decode-0', 'ns1', 'decode', 'Pending', false),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].status).toBe('unhealthy')
    unmount()
  })

  it('maps pod phase and container readiness to component status', async () => {
    setupMockExec({
      pods: [
        makePod('running-pod', 'ns1', 'both', 'Running', true),
        makePod('error-pod', 'ns1', 'both', 'Failed', false, { 'pod-template-hash': 'err-hash' }),
      ],
      namespaces: [],
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const components = result.current.stacks[0].components.both
    const runningComp = components.find(c => c.readyReplicas > 0)
    const errorComp = components.find(c => c.readyReplicas === 0)

    expect(runningComp?.status).toBe('running')
    expect(errorComp?.status).toBe('error')
    unmount()
  })
})
