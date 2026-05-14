import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import type { StatBlockConfig } from './StatsBlockDefinitions'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

vi.mock('./Button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock('./StatusBadge', () => ({
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('./StatBlockModePicker', () => ({
  StatBlockModePicker: () => null,
}))

vi.mock('../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }),
  wasAgentEverConnected: () => true,
}))

vi.mock('../../hooks/useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false }),
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../hooks/useStatHistory', () => ({
  MIN_SPARKLINE_POINTS: 5,
  useStatHistory: () => ({ getHistory: () => undefined }),
}))

vi.mock('../../lib/modals', () => ({
  useModalState: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}))

let mockBlocks: StatBlockConfig[] = []

vi.mock('./StatsConfig', () => ({
  StatsConfigModal: () => null,
  useStatsConfig: () => ({
    blocks: mockBlocks,
    saveBlocks: vi.fn(),
    visibleBlocks: mockBlocks.filter(block => block.visible),
    defaultBlocks: mockBlocks,
  }),
}))

import { StatsOverview } from './StatsOverview'

function renderStatsOverview(block: StatBlockConfig, statValue: { value: string | number; sublabel?: string; progressValue?: number; max?: number }) {
  mockBlocks = [block]
  return render(
    <StatsOverview
      dashboardType="clusters"
      getStatValue={() => statValue}
      collapsible={false}
      showConfigButton={false}
    />,
  )
}

describe('StatsOverview', () => {
  beforeEach(() => {
    mockBlocks = []
    cleanup()
  })

  it('shows percent and max context for mini-bar stats with an explicit max', () => {
    renderStatsOverview(
      { id: 'healthy', name: 'Healthy', icon: 'CheckCircle2', visible: true, color: 'green', displayMode: 'mini-bar' },
      { value: 3, sublabel: 'healthy', max: 5 },
    )

    expect(screen.getByTestId('stat-block-healthy-progress')).toBeTruthy()
    expect(screen.getByTestId('stat-block-healthy-scale').textContent).toBe('60%')
    expect(screen.getByText('healthy')).toBeTruthy()
    expect(screen.getByText('of 5')).toBeTruthy()
  })

  it('shows percent and max context for stacked-bar stats with an explicit max', () => {
    renderStatsOverview(
      { id: 'unhealthy', name: 'Unhealthy', icon: 'XCircle', visible: true, color: 'red', displayMode: 'stacked-bar' },
      { value: 2, sublabel: 'unhealthy', max: 5 },
    )

    expect(screen.getByTestId('stat-block-unhealthy-progress')).toBeTruthy()
    expect(screen.getByTestId('stat-block-unhealthy-scale').textContent).toBe('40%')
    expect(screen.getByText('unhealthy')).toBeTruthy()
    expect(screen.getByText('of 5')).toBeTruthy()
  })

  it('shows a percent sign in the main value for percentage stats without a max label', () => {
    renderStatsOverview(
      { id: 'cpu_util', name: 'CPU Utilization', icon: 'Cpu', visible: true, color: 'cyan', displayMode: 'mini-bar' },
      { value: 42, sublabel: 'cpu usage' },
    )

    expect(screen.getByTestId('stat-block-cpu_util-count').textContent).toBe('42%')
    expect(screen.queryByTestId('stat-block-cpu_util-scale')).toBeNull()
    expect(screen.queryByText('of 100')).toBeNull()
  })

  it('falls back to numeric mode when a raw count has no progress max', () => {
    renderStatsOverview(
      { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan', displayMode: 'mini-bar' },
      { value: 12, sublabel: 'total nodes' },
    )

    expect(screen.queryByTestId('stat-block-nodes-progress')).toBeNull()
    expect(screen.queryByTestId('stat-block-nodes-scale')).toBeNull()
    expect(screen.getByTestId('stat-block-nodes-count').textContent).toBe('12')
  })

  it('uses progressValue for node availability while keeping the total node count visible', () => {
    renderStatsOverview(
      { id: 'nodes', name: 'Nodes', icon: 'Box', visible: true, color: 'cyan', displayMode: 'mini-bar' },
      { value: 3, progressValue: 1, max: 3, sublabel: 'total nodes' },
    )

    expect(screen.getByTestId('stat-block-nodes-count').textContent).toBe('3')
    expect(screen.getByTestId('stat-block-nodes-scale').textContent).toBe('33%')
    expect(screen.getByText('of 3')).toBeTruthy()
  })
})
