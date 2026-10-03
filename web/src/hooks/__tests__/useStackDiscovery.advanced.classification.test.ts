import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  flush,
  makeDeployment,
  makeEPPService,
  makePod,
  setupMockExec,
  useStackDiscovery,
} from './useStackDiscovery.advanced.setup'

describe('useStackDiscovery', () => {
  it('skips namespaces already discovered in Phase 1 during Phase 2', async () => {
    setupMockExec({
      pods: [makePod('pod-0', 'llm-d-ns', 'both')],
      namespaces: ['llm-d-ns', 'inference-new'],
      deploymentsByNs: {
        'inference-new': [
          makeDeployment('granite-server', 'inference-new', 1, 1, { 'llmd.org/model': 'granite' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(2)
    // Phase 2 should NOT re-query llm-d-ns (already in Phase 1)
    const depCalls = mockExec.mock.calls.filter(
      (c: unknown[]) => (c[0] as string[]).includes('deployments'),
    )
    const nsQueried = depCalls.map((c: unknown[]) => {
      const args = c[0] as string[]
      return args[args.indexOf('-n') + 1]
    })
    expect(nsQueried).not.toContain('llm-d-ns')
    expect(nsQueried).toContain('inference-new')
    unmount()
  })

  // ── 10. Deployment classification (EPP, prefill, decode, both) ─────────────

  it('classifies deployment as EPP when name contains -epp', async () => {
    setupMockExec({
      pods: [],
      namespaces: ['serving-ns'],
      deploymentsByNs: {
        'serving-ns': [
          makeDeployment('model-epp', 'serving-ns', 1, 1),
          makeDeployment('vllm-model', 'serving-ns', 2, 2, { 'app.kubernetes.io/name': 'vllm' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    expect(result.current.stacks[0].components.epp).not.toBeNull()
    expect(result.current.stacks[0].components.epp!.name).toBe('model-epp')
    unmount()
  })

  it('classifies deployments with prefill/decode in the name', async () => {
    setupMockExec({
      pods: [],
      namespaces: ['llm-d-pd'],
      deploymentsByNs: {
        'llm-d-pd': [
          makeDeployment('granite-prefill', 'llm-d-pd', 3, 3, { 'llmd.org/model': 'granite-3b' }),
          makeDeployment('granite-decode', 'llm-d-pd', 2, 2, { 'llmd.org/model': 'granite-3b' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    expect(result.current.stacks.length).toBe(1)
    const stack = result.current.stacks[0]
    expect(stack.components.prefill.length).toBe(1)
    expect(stack.components.decode.length).toBe(1)
    expect(stack.hasDisaggregation).toBe(true)
    expect(stack.model).toBe('granite-3b')
    unmount()
  })

  it('role label takes precedence over deployment name (fix #13716)', async () => {
    // Deployment named 'prefill-server' but explicitly labelled role=decode.
    // Before the fix this landed in prefill because depName.includes('prefill')
    // fired before role === 'decode' was checked.
    setupMockExec({
      pods: [],
      namespaces: ['llm-d-pd'],
      deploymentsByNs: {
        'llm-d-pd': [
          makeDeployment('prefill-server', 'llm-d-pd', 2, 2, { 'llm-d.ai/role': 'decode' }),
        ],
      },
    })

    const { result, unmount } = renderHook(() => useStackDiscovery(['c1']))
    await flush()

    const stack = result.current.stacks[0]
    expect(stack.components.decode.length).toBe(1)
    expect(stack.components.prefill.length).toBe(0)
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
})
