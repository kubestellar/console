/**
 * Tests for Kubernetes Zod schemas and the validateArrayResponse utility.
 *
 * These tests verify that:
 * 1. Valid API responses pass schema validation
 * 2. Malformed responses produce warnings (not crashes)
 * 3. The fallback path returns safe empty arrays
 * 4. Extra backend fields are tolerated (forward compatibility)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  PodsResponseSchema,
  EventsResponseSchema,
  DeploymentsResponseSchema,
  NodesResponseSchema,
  GPUNodesResponseSchema,
  GPUNodeHealthResponseSchema,
  ClustersResponseSchema,
} from '../kubernetes'
import { validateArrayResponse, validateResponse } from '../validate'
import { SecurityIssuesResponseSchema } from '../security'

beforeEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// PodsResponseSchema
// ============================================================================

describe('PodsResponseSchema', () => {
  it('validates a well-formed pods response', () => {
    const data = {
      pods: [
        {
          name: 'nginx-abc123',
          namespace: 'default',
          status: 'Running',
          ready: '1/1',
          restarts: 0,
          age: '2d',
        },
      ],
    }
    const result = PodsResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('defaults missing pods key to empty array', () => {
    const data = {}
    const result = PodsResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pods).toEqual([])
    }
  })

  it('fails on non-object input', () => {
    const result = PodsResponseSchema.safeParse('not-an-object')
    expect(result.success).toBe(false)
  })

  it('tolerates extra fields on pod objects', () => {
    const data = {
      pods: [
        {
          name: 'pod-1',
          namespace: 'ns',
          status: 'Running',
          ready: '1/1',
          restarts: 0,
          age: '1h',
          futureField: 'should not fail',
        },
      ],
    }
    const result = PodsResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// EventsResponseSchema
// ============================================================================

describe('EventsResponseSchema', () => {
  it('validates a well-formed events response', () => {
    const data = {
      events: [
        {
          type: 'Warning',
          reason: 'BackOff',
          message: 'Back-off restarting failed container',
          object: 'pod/nginx-abc123',
          namespace: 'default',
          count: 5,
        },
      ],
    }
    const result = EventsResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// DeploymentsResponseSchema
// ============================================================================

describe('DeploymentsResponseSchema', () => {
  it('validates a well-formed deployments response', () => {
    const data = {
      deployments: [
        {
          name: 'nginx',
          namespace: 'default',
          status: 'running',
          replicas: 3,
          readyReplicas: 3,
          updatedReplicas: 3,
          availableReplicas: 3,
          progress: 100,
        },
      ],
    }
    const result = DeploymentsResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects invalid deployment status', () => {
    const data = {
      deployments: [
        {
          name: 'nginx',
          namespace: 'default',
          status: 'banana',
          replicas: 3,
          readyReplicas: 3,
          updatedReplicas: 3,
          availableReplicas: 3,
          progress: 100,
        },
      ],
    }
    const result = DeploymentsResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// NodesResponseSchema
// ============================================================================

describe('NodesResponseSchema', () => {
  it('validates a well-formed nodes response', () => {
    const data = {
      nodes: [
        {
          name: 'node-1',
          status: 'Ready',
          roles: ['control-plane'],
          kubeletVersion: 'v1.28.4',
          cpuCapacity: '8',
          memoryCapacity: '32Gi',
          podCapacity: '110',
          conditions: [{ type: 'Ready', status: 'True' }],
          unschedulable: false,
        },
      ],
    }
    const result = NodesResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// GPUNodesResponseSchema
// ============================================================================

describe('GPUNodesResponseSchema', () => {
  it('validates a well-formed GPU nodes response', () => {
    const data = {
      nodes: [
        {
          name: 'gpu-node-1',
          cluster: 'vllm-d',
          gpuType: 'NVIDIA A100',
          gpuCount: 8,
          gpuAllocated: 4,
        },
      ],
    }
    const result = GPUNodesResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// GPUNodeHealthResponseSchema
// ============================================================================

describe('GPUNodeHealthResponseSchema', () => {
  it('validates a well-formed GPU health response', () => {
    const data = {
      nodes: [
        {
          nodeName: 'gpu-node-1',
          cluster: 'vllm-d',
          status: 'healthy',
          gpuCount: 8,
          gpuType: 'NVIDIA A100',
          checks: [{ name: 'node_ready', passed: true }],
          issues: [],
          stuckPods: 0,
          checkedAt: '2025-01-01T00:00:00Z',
        },
      ],
    }
    const result = GPUNodeHealthResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects invalid health status', () => {
    const data = {
      nodes: [
        {
          nodeName: 'gpu-node-1',
          cluster: 'vllm-d',
          status: 'on-fire',
          gpuCount: 8,
          gpuType: 'NVIDIA A100',
          checks: [],
          issues: [],
          stuckPods: 0,
          checkedAt: '2025-01-01T00:00:00Z',
        },
      ],
    }
    const result = GPUNodeHealthResponseSchema.safeParse(data)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// ClustersResponseSchema
// ============================================================================

describe('ClustersResponseSchema', () => {
  it('validates a well-formed clusters response', () => {
    const data = {
      clusters: [
        { name: 'prod-east', reachable: true },
        { name: 'staging', reachable: false },
      ],
    }
    const result = ClustersResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('allows clusters without reachable field', () => {
    const data = {
      clusters: [{ name: 'unknown-cluster' }],
    }
    const result = ClustersResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// validateArrayResponse utility
// ============================================================================

describe('validateArrayResponse', () => {
  it('returns original data on successful validation', () => {
    const data = { pods: [{ name: 'p', namespace: 'ns', status: 'Running', ready: '1/1', restarts: 0, age: '1h' }] }
    const result = validateArrayResponse<{ pods: unknown[] }>(PodsResponseSchema, data, 'test', 'pods')
    expect(result.pods).toHaveLength(1)
    expect(result.pods[0]).toEqual(data.pods[0])
  })

  it('returns empty-array fallback on validation failure and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = validateArrayResponse<{ pods: unknown[] }>(PodsResponseSchema, 'invalid', 'test-pods', 'pods')
    expect(result.pods).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[Zod]'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('test-pods'))
  })

  it('returns empty-array fallback when data has wrong field type', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // pods should be an array, not a string
    const data = { pods: 'not-an-array' }
    const result = validateArrayResponse<{ pods: unknown[] }>(PodsResponseSchema, data, 'test', 'pods')
    expect(result.pods).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })
})

// ============================================================================
// validateResponse (existing utility, regression test)
// ============================================================================

describe('validateResponse', () => {
  it('returns parsed data on success', () => {
    const data = { issues: [{ name: 'x', namespace: 'ns', issue: 'test', severity: 'high' }] }
    const result = validateResponse(SecurityIssuesResponseSchema, data, 'test')
    expect(result).not.toBeNull()
    expect(result?.issues).toHaveLength(1)
  })

  it('returns null on failure and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = validateResponse(SecurityIssuesResponseSchema, 42, 'test-sec')
    expect(result).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })
})
