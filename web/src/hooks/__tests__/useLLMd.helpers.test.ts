/**
 * Unit tests for the pure helper functions in hooks/useLLMd.ts.
 *
 * All five functions are deterministic string/number transforms — zero mocks needed.
 * Exported via __testables so the hook's public API is unchanged.
 */

import { describe, it, expect } from 'vitest'
import { __testables } from '../useLLMd'

const { detectServerType, detectComponentType, detectGatewayType, getServerStatus, extractGPUInfo } = __testables

// ---------------------------------------------------------------------------
// Minimal deployment builder for extractGPUInfo tests
// ---------------------------------------------------------------------------

type DeploymentArg = Parameters<typeof extractGPUInfo>[0]

function makeDeployment(limits?: Record<string, string>): DeploymentArg {
  return {
    metadata: { name: 'test-deploy', namespace: 'default' },
    spec: {
      replicas: 1,
      template: {
        spec: {
          containers: [{ resources: { limits: limits ?? {} } }],
        },
      },
    },
    status: { readyReplicas: 1 },
  }
}

// ---------------------------------------------------------------------------
// Numeric test constants
// ---------------------------------------------------------------------------

const REPLICAS_ZERO = 0
const REPLICAS_ONE = 1
const REPLICAS_THREE = 3
const GPU_COUNT_ONE = 1
const GPU_COUNT_TWO = 2
const GPU_COUNT_FOUR = 4
const GPU_COUNT_ZERO = 0

// ---------------------------------------------------------------------------
// detectServerType
// ---------------------------------------------------------------------------

describe('detectServerType', () => {
  describe('detected by name (case-insensitive)', () => {
    it('returns tgi when name includes "tgi"', () => {
      expect(detectServerType('my-tgi-server')).toBe('tgi')
    })

    it('returns triton when name includes "triton"', () => {
      expect(detectServerType('triton-inference')).toBe('triton')
    })

    it('returns llm-d when name includes "llm-d"', () => {
      expect(detectServerType('llm-d-frontend')).toBe('llm-d')
    })

    it('returns vllm when name includes "vllm" (without "llm-d" substring)', () => {
      // 'vllm-server' contains 'vllm' but not 'llm-d' (llm-d check has higher priority)
      expect(detectServerType('vllm-server')).toBe('vllm')
    })

    it('returns unknown when name matches nothing', () => {
      expect(detectServerType('random-workload')).toBe('unknown')
    })
  })

  describe('detected by label', () => {
    it('returns tgi when app.kubernetes.io/name label is "tgi"', () => {
      expect(detectServerType('server', { 'app.kubernetes.io/name': 'tgi' })).toBe('tgi')
    })

    it('returns triton when app.kubernetes.io/name label is "triton"', () => {
      expect(detectServerType('server', { 'app.kubernetes.io/name': 'triton' })).toBe('triton')
    })

    it('returns llm-d when llmd.org/inferenceServing label is "true"', () => {
      expect(detectServerType('server', { 'llmd.org/inferenceServing': 'true' })).toBe('llm-d')
    })
  })

  describe('priority ordering', () => {
    it('prefers tgi over vllm when both appear in the name', () => {
      expect(detectServerType('vllm-tgi-hybrid')).toBe('tgi')
    })

    it('prefers triton over vllm when both appear in the name', () => {
      expect(detectServerType('vllm-triton-server')).toBe('triton')
    })

    it('returns vllm for "vllm-deployment" instead of matching the "llm-d" substring first', () => {
      expect(detectServerType('vllm-deployment')).toBe('vllm')
    })

    it('returns unknown when labels are present but unrecognised', () => {
      expect(detectServerType('server', { 'app.kubernetes.io/name': 'other' })).toBe('unknown')
    })
  })
})

// ---------------------------------------------------------------------------
// detectComponentType
// ---------------------------------------------------------------------------

describe('detectComponentType', () => {
  describe('epp detection', () => {
    it('returns epp when name contains "-epp"', () => {
      expect(detectComponentType('scheduler-epp')).toBe('epp')
    })

    it('returns epp when name ends with "epp" (no hyphen)', () => {
      expect(detectComponentType('myepp')).toBe('epp')
    })
  })

  describe('gateway detection', () => {
    it('returns gateway when name contains "gateway"', () => {
      expect(detectComponentType('istio-gateway')).toBe('gateway')
    })

    it('returns gateway when name contains "ingress"', () => {
      expect(detectComponentType('nginx-ingress')).toBe('gateway')
    })
  })

  describe('prometheus detection', () => {
    it('returns prometheus for exact name "prometheus"', () => {
      expect(detectComponentType('prometheus')).toBe('prometheus')
    })

    it('returns prometheus when name starts with "prometheus-"', () => {
      expect(detectComponentType('prometheus-server')).toBe('prometheus')
    })
  })

  describe('model detection via name', () => {
    const MODEL_NAMES = ['vllm-server', 'tgi-deployment', 'triton-service',
      'llama-3', 'granite-3b', 'qwen-server', 'mistral-7b', 'mixtral-8x7b']

    for (const name of MODEL_NAMES) {
      it(`returns model for name "${name}"`, () => {
        expect(detectComponentType(name)).toBe('model')
      })
    }
  })

  describe('model detection via label', () => {
    it('returns model when llmd.org/inferenceServing label is "true"', () => {
      expect(detectComponentType('server', { 'llmd.org/inferenceServing': 'true' })).toBe('model')
    })

    it('returns model when llmd.org/model label is present', () => {
      expect(detectComponentType('server', { 'llmd.org/model': 'llama-3-8b' })).toBe('model')
    })
  })

  describe('other / fallback', () => {
    it('returns other when name matches none of the known patterns', () => {
      expect(detectComponentType('random-workload')).toBe('other')
    })

    it('returns other when labels are present but unrecognised', () => {
      expect(detectComponentType('server', { 'app': 'postgres' })).toBe('other')
    })
  })

  describe('priority ordering', () => {
    it('prefers epp over model when name contains both "-epp" and "vllm"', () => {
      expect(detectComponentType('vllm-epp')).toBe('epp')
    })

    it('prefers gateway over model when name contains both "gateway" and "vllm"', () => {
      expect(detectComponentType('vllm-gateway')).toBe('gateway')
    })

    it('prefers prometheus over model when name starts with "prometheus-"', () => {
      expect(detectComponentType('prometheus-tgi')).toBe('prometheus')
    })
  })
})

// ---------------------------------------------------------------------------
// detectGatewayType
// ---------------------------------------------------------------------------

describe('detectGatewayType', () => {
  it('returns istio when name contains "istio"', () => {
    expect(detectGatewayType('istio-ingressgateway')).toBe('istio')
  })

  it('returns kgateway when name contains "kgateway"', () => {
    expect(detectGatewayType('kgateway-controller')).toBe('kgateway')
  })

  it('returns kgateway when name contains "envoy"', () => {
    expect(detectGatewayType('envoy-proxy')).toBe('kgateway')
  })

  it('returns envoy (default) when name matches nothing', () => {
    expect(detectGatewayType('nginx-gateway')).toBe('envoy')
  })

  it('returns envoy (default) for a generic gateway name', () => {
    expect(detectGatewayType('api-gateway')).toBe('envoy')
  })
})

// ---------------------------------------------------------------------------
// getServerStatus
// ---------------------------------------------------------------------------

describe('getServerStatus', () => {
  it('returns stopped when replicas is 0', () => {
    expect(getServerStatus(REPLICAS_ZERO, REPLICAS_ZERO)).toBe('stopped')
  })

  it('returns stopped when replicas is 0 even if readyReplicas is non-zero', () => {
    expect(getServerStatus(REPLICAS_ZERO, REPLICAS_THREE)).toBe('stopped')
  })

  it('returns running when all replicas are ready', () => {
    expect(getServerStatus(REPLICAS_THREE, REPLICAS_THREE)).toBe('running')
  })

  it('returns running for a single replica that is ready', () => {
    expect(getServerStatus(REPLICAS_ONE, REPLICAS_ONE)).toBe('running')
  })

  it('returns scaling when some but not all replicas are ready', () => {
    expect(getServerStatus(REPLICAS_THREE, REPLICAS_ONE)).toBe('scaling')
  })

  it('returns error when replicas are desired but none are ready', () => {
    expect(getServerStatus(REPLICAS_THREE, REPLICAS_ZERO)).toBe('error')
  })
})

// ---------------------------------------------------------------------------
// extractGPUInfo
// ---------------------------------------------------------------------------

describe('extractGPUInfo', () => {
  describe('NVIDIA GPU', () => {
    it('returns NVIDIA type and count when nvidia.com/gpu limit is present', () => {
      const result = extractGPUInfo(makeDeployment({ 'nvidia.com/gpu': String(GPU_COUNT_TWO) }))
      expect(result).toEqual({ gpu: 'NVIDIA', gpuCount: GPU_COUNT_TWO })
    })

    it('preserves a count of zero for nvidia.com/gpu', () => {
      const result = extractGPUInfo(makeDeployment({ 'nvidia.com/gpu': String(GPU_COUNT_ZERO) }))
      expect(result).toEqual({ gpu: 'NVIDIA', gpuCount: GPU_COUNT_ZERO })
    })
  })

  describe('AMD GPU', () => {
    it('returns AMD type and count when amd.com/gpu limit is present', () => {
      const result = extractGPUInfo(makeDeployment({ 'amd.com/gpu': String(GPU_COUNT_ONE) }))
      expect(result).toEqual({ gpu: 'AMD', gpuCount: GPU_COUNT_ONE })
    })
  })

  describe('generic GPU', () => {
    it('returns GPU type when limit key contains "gpu" but is not nvidia or amd', () => {
      const result = extractGPUInfo(makeDeployment({ 'custom.io/gpu': String(GPU_COUNT_FOUR) }))
      expect(result).toEqual({ gpu: 'GPU', gpuCount: GPU_COUNT_FOUR })
    })
  })

  describe('no GPU', () => {
    it('returns empty object when limits has no GPU key', () => {
      expect(extractGPUInfo(makeDeployment({ 'cpu': '4', 'memory': '8Gi' }))).toEqual({})
    })

    it('returns empty object when limits is empty', () => {
      expect(extractGPUInfo(makeDeployment({}))).toEqual({})
    })

    it('returns empty object when deployment has no template', () => {
      const dep: DeploymentArg = {
        metadata: { name: 'bare', namespace: 'default' },
        spec: {},
        status: {},
      }
      expect(extractGPUInfo(dep)).toEqual({})
    })

    it('returns empty object when containers array is absent', () => {
      const dep: DeploymentArg = {
        metadata: { name: 'no-containers', namespace: 'default' },
        spec: { template: { spec: {} } },
        status: {},
      }
      expect(extractGPUInfo(dep)).toEqual({})
    })
  })
})
