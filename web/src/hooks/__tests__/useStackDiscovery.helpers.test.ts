import { describe, it, expect, beforeEach } from 'vitest'
import {
  safeJsonParse,
  isLlmdNamespace,
  isLlmdDeployment,
  sortStacks,
  buildComponentsFromDeployments,
  mergeStackWithCached,
  getStackStatus,
  loadCachedStacks,
  saveCachedStacks,
  CACHE_KEY,
} from '../useStackDiscovery.helpers'
import type { LLMdStack, LLMdStackComponent, DeploymentResource } from '../useStackDiscovery.helpers'

function makeStack(overrides: Partial<LLMdStack> = {}): LLMdStack {
  return {
    id: 'ns@cluster',
    name: 'ns',
    namespace: 'ns',
    cluster: 'cluster',
    components: { prefill: [], decode: [], both: [], epp: null, gateway: null },
    status: 'unknown',
    hasDisaggregation: false,
    totalReplicas: 0,
    readyReplicas: 0,
    ...overrides,
  }
}

function makeComponent(name: string, type: LLMdStackComponent['type'], status: LLMdStackComponent['status'] = 'running'): LLMdStackComponent {
  return { name, namespace: 'ns', cluster: 'cl', type, status, replicas: 1, readyReplicas: status === 'running' ? 1 : 0 }
}

function makeDeployment(name: string, namespace = 'ns', labels: Record<string, string> = {}): DeploymentResource {
  return {
    metadata: { name, namespace, labels: {} },
    spec: { replicas: 2, template: { metadata: { labels } } },
    status: { replicas: 2, readyReplicas: 2 },
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('safeJsonParse', () => {
  it('returns parsed value for valid JSON', () => {
    expect(safeJsonParse('{"key":"val"}', null, 'test')).toEqual({ key: 'val' })
  })

  it('returns fallback for invalid JSON and does not throw', () => {
    expect(() => safeJsonParse('not-json', 'fallback', 'test')).not.toThrow()
    expect(safeJsonParse('not-json', 'fallback', 'test')).toBe('fallback')
  })
})

describe('isLlmdNamespace', () => {
  it('returns true for a namespace containing "llm-d"', () => {
    expect(isLlmdNamespace('llm-d-test')).toBe(true)
  })

  it('returns true for a namespace containing "inference"', () => {
    expect(isLlmdNamespace('inference-system')).toBe(true)
  })

  it('returns true for exact match "b2"', () => {
    expect(isLlmdNamespace('b2')).toBe(true)
  })

  it('returns false for a generic namespace', () => {
    expect(isLlmdNamespace('kube-system')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isLlmdNamespace('LLM-D-Prod')).toBe(true)
  })
})

describe('isLlmdDeployment', () => {
  it('returns true for a deployment with "vllm" in name', () => {
    expect(isLlmdDeployment(makeDeployment('vllm-server'))).toBe(true)
  })

  it('returns true for a deployment with llm-d.ai/role label', () => {
    expect(isLlmdDeployment(makeDeployment('my-server', 'ns', { 'llm-d.ai/role': 'prefill' }))).toBe(true)
  })

  it('returns true for a deployment ending in "-epp"', () => {
    expect(isLlmdDeployment(makeDeployment('model-epp'))).toBe(true)
  })

  it('returns false for a generic deployment in a non-llmd namespace', () => {
    expect(isLlmdDeployment(makeDeployment('nginx', 'default'))).toBe(false)
  })
})

describe('sortStacks', () => {
  it('sorts healthy stacks before non-healthy', () => {
    const a = makeStack({ status: 'degraded', name: 'a' })
    const b = makeStack({ status: 'healthy', name: 'b' })
    expect([a, b].sort(sortStacks)[0].name).toBe('b')
  })

  it('sorts alphabetically by name when statuses are equal', () => {
    const a = makeStack({ status: 'healthy', name: 'alpha' })
    const b = makeStack({ status: 'healthy', name: 'beta' })
    expect([b, a].sort(sortStacks)[0].name).toBe('alpha')
  })
})

describe('getStackStatus', () => {
  it('returns unknown when all component lists are empty', () => {
    expect(getStackStatus({ prefill: [], decode: [], both: [], epp: null, gateway: null })).toBe('unknown')
  })

  it('returns healthy when all components are running', () => {
    const c = makeComponent('c', 'both', 'running')
    expect(getStackStatus({ prefill: [], decode: [], both: [c], epp: null, gateway: null })).toBe('healthy')
  })

  it('returns unhealthy when no components are running', () => {
    const c = makeComponent('c', 'both', 'error')
    expect(getStackStatus({ prefill: [], decode: [], both: [c], epp: null, gateway: null })).toBe('unhealthy')
  })

  it('returns degraded when some but not all components are running', () => {
    const run = makeComponent('r', 'both', 'running')
    const err = makeComponent('e', 'decode', 'error')
    expect(getStackStatus({ prefill: [], decode: [err], both: [run], epp: null, gateway: null })).toBe('degraded')
  })
})

describe('buildComponentsFromDeployments', () => {
  it('classifies a deployment with "prefill" in name as prefill', () => {
    const result = buildComponentsFromDeployments([makeDeployment('model-prefill')], 'ns', 'cl')
    expect(result.prefill).toHaveLength(1)
    expect(result.decode).toHaveLength(0)
  })

  it('classifies a deployment with "decode" in name as decode', () => {
    const result = buildComponentsFromDeployments([makeDeployment('model-decode')], 'ns', 'cl')
    expect(result.decode).toHaveLength(1)
  })

  it('classifies a deployment with "-epp" in name as epp', () => {
    const result = buildComponentsFromDeployments([makeDeployment('model-epp')], 'ns', 'cl')
    expect(result.epp).not.toBeNull()
    expect(result.epp!.type).toBe('epp')
  })

  it('classifies unrecognized deployments as "both"', () => {
    const result = buildComponentsFromDeployments([makeDeployment('my-server')], 'ns', 'cl')
    expect(result.both).toHaveLength(1)
  })

  it('picks up model from deployment labels', () => {
    const dep = makeDeployment('vllm-serve', 'ns', { 'llmd.org/model': 'llama-3' })
    const result = buildComponentsFromDeployments([dep], 'ns', 'cl')
    expect(result.model).toBe('llama-3')
  })
})

describe('mergeStackWithCached', () => {
  it('preserves cached prefill components when fresh data has none', () => {
    const cached = makeStack({
      components: {
        prefill: [makeComponent('old-prefill', 'prefill')],
        decode: [], both: [], epp: null, gateway: null,
      },
    })
    const fresh = makeStack()
    const merged = mergeStackWithCached(fresh, cached)
    expect(merged.components.prefill).toHaveLength(1)
    expect(merged.components.prefill[0].name).toBe('old-prefill')
  })

  it('does not replace fresh prefill components with cached ones', () => {
    const fresh = makeStack({
      components: {
        prefill: [makeComponent('new-prefill', 'prefill')],
        decode: [], both: [], epp: null, gateway: null,
      },
    })
    const cached = makeStack({
      components: {
        prefill: [makeComponent('old-prefill', 'prefill')],
        decode: [], both: [], epp: null, gateway: null,
      },
    })
    const merged = mergeStackWithCached(fresh, cached)
    expect(merged.components.prefill[0].name).toBe('new-prefill')
  })

  it('preserves cached model name when fresh has none', () => {
    const cached = makeStack({ model: 'llama-3' })
    const fresh = makeStack()
    expect(mergeStackWithCached(fresh, cached).model).toBe('llama-3')
  })
})

describe('loadCachedStacks / saveCachedStacks', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadCachedStacks()).toBeNull()
  })

  it('round-trips: saveCachedStacks then loadCachedStacks', () => {
    const stacks: LLMdStack[] = [makeStack({ id: 's1', name: 'stack1' })]
    saveCachedStacks(stacks)
    const result = loadCachedStacks()
    expect(result).not.toBeNull()
    expect(result!.stacks).toHaveLength(1)
    expect(result!.stacks[0].id).toBe('s1')
  })

  it('returns null for malformed JSON in cache', () => {
    localStorage.setItem(CACHE_KEY, 'not-json')
    expect(loadCachedStacks()).toBeNull()
  })

  it('returns null when cached data has no timestamp', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ stacks: [] }))
    expect(loadCachedStacks()).toBeNull()
  })
})
