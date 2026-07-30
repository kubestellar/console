import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PolicyDrillDown } from './PolicyDrillDown'

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false }),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: vi.fn(async () => '') }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({ state: { stack: ['root'] }, pop: vi.fn(), close: vi.fn() }),
  useDrillDownActions: () => ({ drillToNamespace: vi.fn(), drillToCluster: vi.fn(), drillToPod: vi.fn() }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../modals', () => ({
  AIActionBar: () => <div>AI actions</div>,
  useModalAI: () => ({
    defaultAIActions: [],
    handleAIAction: vi.fn(),
    isAgentConnected: false,
  }),
}))

describe('PolicyDrillDown', () => {
  it('renders policy metadata and tabs', () => {
    render(
      <PolicyDrillDown
        data={{
          cluster: 'cluster-a',
          namespace: 'default',
          policy: 'restrict-images',
          policyType: 'kyverno',
          status: 'Active',
          violationCount: 2,
        }}
      />
    )

    expect(screen.getByText('restrict-images')).toBeInTheDocument()
    expect(screen.getByText('AI actions')).toBeInTheDocument()
  })
})
