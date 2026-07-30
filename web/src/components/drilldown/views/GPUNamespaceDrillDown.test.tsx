import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GPUNamespaceDrillDown } from './GPUNamespaceDrillDown'

vi.mock('../../../hooks/useMCP', () => ({
  useGPUNodes: () => ({
    nodes: [
      { name: 'gpu-node-1', cluster: 'cluster-a', gpuType: 'A100', gpuCount: 2, gpuAllocated: 1 },
    ],
  }),
  useAllPods: () => ({
    pods: [
      {
        cluster: 'cluster-a',
        namespace: 'gpu-jobs',
        name: 'trainer-pod',
        status: 'Running',
        node: 'gpu-node-1',
        containers: [{ name: 'trainer', gpuRequested: 1 }],
      },
    ],
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({ state: { stack: ['root'] }, pop: vi.fn(), close: vi.fn() }),
  useDrillDownActions: () => ({
    drillToPod: vi.fn(),
    drillToGPUNode: vi.fn(),
    drillToCluster: vi.fn(),
  }),
}))

describe('GPUNamespaceDrillDown', () => {
  it('renders namespace summary and pod list', () => {
    render(<GPUNamespaceDrillDown data={{ namespace: 'gpu-jobs' }} />)

    expect(screen.getByText('GPU Namespace Allocations')).toBeInTheDocument()
    expect(screen.getByText('trainer-pod')).toBeInTheDocument()
  })
})
