import React from 'react'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GPUNamespaceDrillDown } from './GPUNamespaceDrillDown'

const { drillToPod, drillToGPUNode } = vi.hoisted(() => ({
  drillToPod: vi.fn(),
  drillToGPUNode: vi.fn(),
}))

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
    drillToPod,
    drillToGPUNode,
    drillToCluster: vi.fn(),
  }),
}))

describe('GPUNamespaceDrillDown', () => {
  it('renders namespace summary and pod list', () => {
    render(<GPUNamespaceDrillDown data={{ namespace: 'gpu-jobs' }} />)

    expect(screen.getByText('GPU Namespace Allocations')).toBeInTheDocument()
    expect(screen.getByText('trainer-pod')).toBeInTheDocument()
  })

  it('opens pod and node details with Enter and Space', () => {
    render(<GPUNamespaceDrillDown data={{ namespace: 'gpu-jobs' }} />)
    const pod = screen.getByRole('button', { name: /trainer-pod/ })
    const node = screen.getByRole('button', { name: /gpu-node-1.*1 pod/ })
    expect(pod).toHaveAttribute('tabindex', '0')
    expect(node).toHaveAttribute('tabindex', '0')
    for (const key of ['Enter', ' ']) {
      fireEvent.keyDown(pod, { key })
      fireEvent.keyDown(node, { key })
    }
    expect(drillToPod).toHaveBeenCalledTimes(2)
    expect(drillToPod).toHaveBeenCalledWith('cluster-a', 'gpu-jobs', 'trainer-pod', { status: 'Running' })
    expect(drillToGPUNode).toHaveBeenCalledTimes(2)
    expect(drillToGPUNode).toHaveBeenCalledWith('cluster-a', 'gpu-node-1', {
      gpuType: 'A100', gpuCount: 2, gpuAllocated: 1,
    })
  })
})
