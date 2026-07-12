import React from 'react'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OperatorDrillDown } from './OperatorDrillDown'

const mockPop = vi.fn()
const mockClose = vi.fn()
const mockDrillToNamespace = vi.fn()
const mockDrillToCluster = vi.fn()
const mockDrillToCRD = vi.fn()

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ isConnected: false }),
}))

vi.mock('../../../hooks/useDrillDownWebSocket', () => ({
  useDrillDownWebSocket: () => ({ runKubectl: vi.fn() }),
}))

vi.mock('../../../hooks/useDrillDown', () => ({
  useDrillDown: () => ({
    state: { stack: ['root', 'operator'] },
    pop: mockPop,
    close: mockClose,
  }),
  useDrillDownActions: () => ({
    drillToNamespace: mockDrillToNamespace,
    drillToCluster: mockDrillToCluster,
    drillToCRD: mockDrillToCRD,
  }),
}))

vi.mock('../../../hooks/useMissions', () => ({
  useMissions: () => ({ startMission: vi.fn() }),
}))

vi.mock('../../modals', () => ({
  AIActionBar: () => null,
  AIActionButton: () => null,
  useModalAI: () => ({
    defaultAIActions: [],
    handleAIAction: vi.fn(),
    isAgentConnected: false,
  }),
}))

vi.mock('../../ui/ClusterBadge', () => ({
  ClusterBadge: ({ cluster }: { cluster: string }) => <span>{cluster}</span>,
}))

vi.mock('../../ui/ConsoleAIIcon', () => ({
  ConsoleAIIcon: () => <span>AI</span>,
}))

vi.mock('../../../lib/utils/sanitizeUrl', () => ({
  sanitizeUrl: (url: string) => url,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const OPERATOR_DATA = {
  cluster: 'prod-cluster',
  namespace: 'operators',
  operator: 'cert-manager',
  phase: 'Succeeded',
}

describe('OperatorDrillDown Component', () => {
  it('exports OperatorDrillDown component', () => {
    expect(OperatorDrillDown).toBeDefined()
    expect(typeof OperatorDrillDown).toBe('function')
  })

  it('renders operator name in the header', () => {
    render(<OperatorDrillDown data={OPERATOR_DATA} />)
    expect(screen.getAllByText('cert-manager').length).toBeGreaterThan(0)
  })

  it('shows back button when drill-down stack has multiple entries', () => {
    render(<OperatorDrillDown data={OPERATOR_DATA} />)
    const backBtn = screen.getByRole('button', { name: 'drilldown.goBack' })
    expect(backBtn).toBeInTheDocument()
  })

  it('calls pop when back button is clicked', async () => {
    const user = userEvent.setup()
    render(<OperatorDrillDown data={OPERATOR_DATA} />)
    const backBtn = screen.getByRole('button', { name: 'drilldown.goBack' })
    await user.click(backBtn)
    expect(mockPop).toHaveBeenCalledTimes(1)
  })
})
