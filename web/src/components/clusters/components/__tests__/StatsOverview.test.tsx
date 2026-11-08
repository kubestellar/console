import React from 'react'
/**
 * StatsOverview Component Tests
 * 
 * StatsOverview displays health status via color-coded stat blocks and value indicators.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatsOverview, type ClusterStats } from '../StatsOverview'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }),
  wasAgentEverConnected: () => true,
}))
vi.mock('../../../../hooks/useDemoMode', () => ({ useDemoMode: () => ({ isDemoMode: true }) }))

const TEST_STATS: ClusterStats = {
  total: 3, loading: 0, healthy: 2, unhealthy: 1, unreachable: 0, totalNodes: 6, totalCPUs: 24,
  totalMemoryGB: 96, totalStorageGB: 500, totalPods: 40, totalGPUs: 0, allocatedGPUs: 0,
}

/** Timeout for importing heavy modules */
const IMPORT_TIMEOUT_MS = 30000

describe('StatsOverview', () => {
  it('exports StatsOverview component', async () => {
    const mod = await import('../StatsOverview')
    expect(mod.StatsOverview).toBeDefined()
    expect(typeof mod.StatsOverview).toBe('function')
  }, IMPORT_TIMEOUT_MS)

  it('activates clickable stat blocks with Enter and Space', () => {
    const onNodesClick = vi.fn()
    render(<StatsOverview stats={TEST_STATS} onNodesClick={onNodesClick} showConfigButton={false} />)
    const block = screen.getByTestId('stat-block-nodes-count').parentElement as HTMLElement
    expect(block).toHaveAttribute('role', 'button')
    expect(block).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(block, { key: 'Enter' })
    fireEvent.keyDown(block, { key: ' ' })
    fireEvent.keyDown(block, { key: 'a' })
    expect(onNodesClick).toHaveBeenCalledTimes(2)
  })
})
