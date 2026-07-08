import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NodeDrillDown } from './NodeDrillDown'

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedNodes: () => ({
    nodes: [
      {
        name: 'worker-1',
        cluster: 'cluster-a',
        status: 'Ready',
        unschedulable: false,
        roles: ['worker'],
        kubeletVersion: 'v1.31.0',
      },
    ],
    isLoading: false,
    isFailed: false,
    lastRefresh: Date.now(),
  }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({ state: { stack: ['root'] }, pop: vi.fn(), close: vi.fn() }),
  useDrillDownActions: () => ({ drillToEvents: vi.fn(), drillToCluster: vi.fn() }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(),
}))

describe('NodeDrillDown', () => {
  it('renders node details using cached node data', () => {
    render(<NodeDrillDown data={{ cluster: 'cluster-a', node: 'worker-1' }} />)

    expect(screen.getByText('Node: worker-1')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })
})
