import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GPUTypeUtilizationList, GPUClusterUtilizationList } from './GPUUtilizationList'

const bar = (container: HTMLElement) => container.querySelector('[style]') as HTMLElement

describe('GPUTypeUtilizationList', () => {
  it('renders utilization percentage, pluralized footers and cluster names', () => {
    const { container } = render(
      <GPUTypeUtilizationList
        gpuTypeInfo={[{ type: 'A100', allocatedGPUs: 3, totalGPUs: 4, nodeCount: 2, clusters: ['c1', 'c2'] }]}
      />,
    )
    expect(screen.getByText('A100')).toBeInTheDocument()
    expect(screen.getByText('3/4 (75%)')).toHaveClass('text-yellow-400')
    expect(screen.getByText('2 nodes')).toBeInTheDocument()
    expect(screen.getByText('2 clusters: c1, c2')).toBeInTheDocument()
    expect(bar(container).style.width).toBe('75%')
    expect(bar(container)).toHaveClass('bg-yellow-400')
  })

  it('uses singular labels and 0% when there are no GPUs', () => {
    const { container } = render(
      <GPUTypeUtilizationList
        gpuTypeInfo={[{ type: 'T4', allocatedGPUs: 0, totalGPUs: 0, nodeCount: 1, clusters: ['c1'] }]}
      />,
    )
    expect(screen.getByText('0/0 (0%)')).toBeInTheDocument()
    expect(screen.getByText('1 node')).toBeInTheDocument()
    expect(screen.getByText('1 cluster: c1')).toBeInTheDocument()
    expect(bar(container)).toHaveClass('bg-green-400')
  })
})

describe('GPUClusterUtilizationList', () => {
  it('renders allocation, node count and GPU types per cluster', () => {
    const { container } = render(
      <GPUClusterUtilizationList
        clusterInfo={[{ cluster: 'prod', allocatedGPUs: 9, totalGPUs: 10, nodeCount: 1, gpuTypes: ['A100', 'H100'] }]}
      />,
    )
    expect(screen.getByText('prod')).toBeInTheDocument()
    expect(screen.getByText('9/10 allocated')).toHaveClass('text-red-400')
    expect(screen.getByText('1 GPU node')).toBeInTheDocument()
    expect(screen.getByText('A100, H100')).toBeInTheDocument()
    expect(bar(container)).toHaveClass('bg-red-400')
  })
})
