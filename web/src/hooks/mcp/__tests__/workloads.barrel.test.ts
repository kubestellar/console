import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockUsePods = vi.hoisted(() => vi.fn(() => ({ pods: [{ name: 'pod-a' }], isLoading: false, error: null })))
const mockUseDeployments = vi.hoisted(() => vi.fn(() => ({ deployments: [{ name: 'deploy-a' }], isLoading: false, error: null })))
const mockSubscribeWorkloadsCache = vi.hoisted(() => vi.fn(() => vi.fn()))
const mockTestables = vi.hoisted(() => ({ cacheKey: 'workloads-test' }))

vi.mock('../workloadQueries', () => ({
  usePods: () => mockUsePods(),
  useAllPods: vi.fn(),
  usePodIssues: vi.fn(),
  useDeploymentIssues: vi.fn(),
  useDeployments: () => mockUseDeployments(),
  useJobs: vi.fn(),
  useHPAs: vi.fn(),
  useReplicaSets: vi.fn(),
  useStatefulSets: vi.fn(),
  useDaemonSets: vi.fn(),
  useCronJobs: vi.fn(),
  usePodLogs: vi.fn(),
  USE_POD_LOGS_DEFAULT_TAIL: 250,
  __workloadsTestables: mockTestables,
}))

vi.mock('../workloadSubscriptions', () => ({
  subscribeWorkloadsCache: (...args: unknown[]) => mockSubscribeWorkloadsCache(...args),
}))

import { __workloadsTestables, USE_POD_LOGS_DEFAULT_TAIL, subscribeWorkloadsCache, useDeployments, usePods } from '../workloads'

describe('workloads barrel exports', () => {
  it('re-exports query hooks through the workloads entrypoint', () => {
    const pods = renderHook(() => usePods())
    const deployments = renderHook(() => useDeployments())

    expect(pods.result.current.pods).toEqual([{ name: 'pod-a' }])
    expect(deployments.result.current.deployments).toEqual([{ name: 'deploy-a' }])
    expect(mockUsePods).toHaveBeenCalledTimes(1)
    expect(mockUseDeployments).toHaveBeenCalledTimes(1)
  })

  it('re-exports workload subscription helpers and test utilities', () => {
    const unsubscribe = vi.fn()
    mockSubscribeWorkloadsCache.mockReturnValue(unsubscribe)

    expect(USE_POD_LOGS_DEFAULT_TAIL).toBe(250)
    expect(__workloadsTestables).toBe(mockTestables)
    expect(subscribeWorkloadsCache('pods', vi.fn())).toBe(unsubscribe)
  })
})
