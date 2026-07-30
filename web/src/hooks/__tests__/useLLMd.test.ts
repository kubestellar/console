/**
 * Tests for useLLMd pure helper functions via __testables.
 * Covers: detectServerType, detectComponentType, detectGatewayType,
 * getServerStatus, extractGPUInfo
 */
import { describe, it, expect } from 'vitest'
import { __testables } from '../useLLMd'

const {
  detectServerType,
  detectComponentType,
  detectGatewayType,
  getServerStatus,
  extractGPUInfo,
} = __testables

// ─── detectServerType ─────────────────────────────────────────────────────────

describe('detectServerType', () => {
  it('returns tgi when label app.kubernetes.io/name is tgi', () => {
    expect(detectServerType('my-server', { 'app.kubernetes.io/name': 'tgi' })).toBe('tgi')
  })

  it('returns tgi when name includes tgi', () => {
    expect(detectServerType('my-tgi-server')).toBe('tgi')
  })

  it('returns triton when label app.kubernetes.io/name is triton', () => {
    expect(detectServerType('my-server', { 'app.kubernetes.io/name': 'triton' })).toBe('triton')
  })

  it('returns triton when name includes triton', () => {
    expect(detectServerType('triton-inference')).toBe('triton')
  })

  it('returns vllm when name includes vllm', () => {
    expect(detectServerType('vllm-deployment')).toBe('vllm')
  })

  it('returns llm-d when label llmd.org/inferenceServing is true', () => {
    expect(detectServerType('my-server', { 'llmd.org/inferenceServing': 'true' })).toBe('llm-d')
  })

  it('returns llm-d when name includes llm-d', () => {
    expect(detectServerType('llm-d-server')).toBe('llm-d')
  })

  it('returns unknown for unrecognized name and no labels', () => {
    expect(detectServerType('random-deployment')).toBe('unknown')
  })

  it('returns unknown when no labels match', () => {
    expect(detectServerType('my-server', { 'app': 'something-else' })).toBe('unknown')
  })
})

// ─── detectComponentType ──────────────────────────────────────────────────────

describe('detectComponentType', () => {
  it('returns epp when name includes -epp', () => {
    expect(detectComponentType('my-server-epp')).toBe('epp')
  })

  it('returns epp when name ends with epp', () => {
    expect(detectComponentType('serverepp')).toBe('epp')
  })

  it('returns gateway when name includes gateway', () => {
    expect(detectComponentType('my-gateway')).toBe('gateway')
  })

  it('returns gateway when name includes ingress', () => {
    expect(detectComponentType('nginx-ingress')).toBe('gateway')
  })

  it('returns prometheus when name is prometheus', () => {
    expect(detectComponentType('prometheus')).toBe('prometheus')
  })

  it('returns prometheus when name includes prometheus-', () => {
    expect(detectComponentType('prometheus-server')).toBe('prometheus')
  })

  it('returns model when label llmd.org/inferenceServing is true', () => {
    expect(detectComponentType('my-server', { 'llmd.org/inferenceServing': 'true' })).toBe('model')
  })

  it('returns model when label llmd.org/model is set', () => {
    expect(detectComponentType('my-server', { 'llmd.org/model': 'llama3' })).toBe('model')
  })

  it('returns model when name includes vllm', () => {
    expect(detectComponentType('vllm-server')).toBe('model')
  })

  it('returns model when name includes llama', () => {
    expect(detectComponentType('llama-deployment')).toBe('model')
  })

  it('returns model when name includes granite', () => {
    expect(detectComponentType('granite-model')).toBe('model')
  })

  it('returns model when name includes mistral', () => {
    expect(detectComponentType('mistral-7b')).toBe('model')
  })

  it('returns other for unrecognized name', () => {
    expect(detectComponentType('random-service')).toBe('other')
  })
})

// ─── detectGatewayType ────────────────────────────────────────────────────────

describe('detectGatewayType', () => {
  it('returns istio when name includes istio', () => {
    expect(detectGatewayType('istio-gateway')).toBe('istio')
  })

  it('returns kgateway when name includes kgateway', () => {
    expect(detectGatewayType('kgateway-proxy')).toBe('kgateway')
  })

  it('returns kgateway when name includes envoy', () => {
    expect(detectGatewayType('envoy-proxy')).toBe('kgateway')
  })

  it('returns envoy as default for unrecognized name', () => {
    expect(detectGatewayType('my-gateway')).toBe('envoy')
  })
})

// ─── getServerStatus ──────────────────────────────────────────────────────────

describe('getServerStatus', () => {
  it('returns stopped when replicas is 0', () => {
    expect(getServerStatus(0, 0)).toBe('stopped')
  })

  it('returns running when readyReplicas equals replicas', () => {
    expect(getServerStatus(3, 3)).toBe('running')
  })

  it('returns scaling when some replicas are ready but not all', () => {
    expect(getServerStatus(3, 1)).toBe('scaling')
  })

  it('returns error when replicas > 0 but readyReplicas is 0', () => {
    expect(getServerStatus(3, 0)).toBe('error')
  })

  it('returns running when single replica is ready', () => {
    expect(getServerStatus(1, 1)).toBe('running')
  })
})

// ─── extractGPUInfo ───────────────────────────────────────────────────────────

describe('extractGPUInfo', () => {
  it('returns empty object when no containers defined', () => {
    const deployment = {
      metadata: { name: 'test', namespace: 'default', labels: {} },
      spec: { replicas: 1, template: {} },
      status: {},
    }
    expect(extractGPUInfo(deployment as never)).toEqual({})
  })

  it('returns empty object when no GPU limits set', () => {
    const deployment = {
      metadata: { name: 'test', namespace: 'default' },
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [{ resources: { limits: { cpu: '4', memory: '8Gi' } } }],
          },
        },
      },
      status: {},
    }
    expect(extractGPUInfo(deployment as never)).toEqual({})
  })

  it('detects NVIDIA GPU and count', () => {
    const deployment = {
      metadata: { name: 'vllm', namespace: 'default' },
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [{ resources: { limits: { 'nvidia.com/gpu': '2' } } }],
          },
        },
      },
      status: {},
    }
    expect(extractGPUInfo(deployment as never)).toEqual({ gpu: 'NVIDIA', gpuCount: 2 })
  })

  it('detects AMD GPU and count', () => {
    const deployment = {
      metadata: { name: 'amd-server', namespace: 'default' },
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [{ resources: { limits: { 'amd.com/gpu': '1' } } }],
          },
        },
      },
      status: {},
    }
    expect(extractGPUInfo(deployment as never)).toEqual({ gpu: 'AMD', gpuCount: 1 })
  })

  it('detects generic GPU label', () => {
    const deployment = {
      metadata: { name: 'gpu-server', namespace: 'default' },
      spec: {
        replicas: 1,
        template: {
          spec: {
            containers: [{ resources: { limits: { 'gpu': '4' } } }],
          },
        },
      },
      status: {},
    }
    const result = extractGPUInfo(deployment as never)
    expect(result.gpuCount).toBe(4)
    expect(result.gpu).toBeDefined()
  })
})